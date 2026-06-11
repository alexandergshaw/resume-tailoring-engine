import { AGGRESSIVENESS_CONFIG, type AggressivenessConfig } from './aggressiveness';
import { enrichContent } from './claimExpansion';
import { analyzeCoverage } from './coverageAnalysis';
import type { DocxDocument } from './docxEditor';
import { extractKeyPhrases } from './extractKeyPhrases';
import { extractSkills } from './extractSkills';
import { generateReport } from './generateReport';
import { identifyReplaceableRegions } from './identifyReplaceableRegions';
import { applyReplacementsToText, generateReplacements, type Replacement } from './lengthPreservingReplace';
import { parseJob } from './parseJob';
import { parseResume } from './parseResume';
import { renderDocx, renderInPlace } from './renderDocx';
import { scoreContent } from './scoreContent';
import type { TailorResumeInput, TailoredResult } from './types';

// Tailoring never reorders sections; the original document order is preserved.
const SECTION_ORDER = ['summary', 'skills', 'experience', 'projects', 'education'];

// Title-like nouns used to route mined key phrases into the job-title candidate
// pool for "top"-level region replacement.
const TITLE_PHRASE_RE = /\b(engineer|developer|manager|architect|analyst|designer|consultant|administrator|lead|director|specialist|scientist)\b/i;

export async function tailorResume(input: TailorResumeInput): Promise<TailoredResult> {
  const aggressiveness = input.aggressiveness ?? 'balanced';
  const parsedResume = await parseResume({ buffer: input.resumeBuffer, filename: input.resumeFilename });
  const parsedJob = parseJob(input.jobPostingText);
  const config = AGGRESSIVENESS_CONFIG[aggressiveness];

  // Mine the posting for ranked buzzwords/phrases (multi-word aware), then
  // decide — semantically — which the resume already expresses, which it can
  // legitimately support (safe to weave in), and which are genuine gaps.
  const keyPhrases = await extractKeyPhrases(input.jobPostingText);
  parsedJob.keyPhrases = keyPhrases;
  const coverage = await analyzeCoverage(keyPhrases, parsedResume.bullets, parsedResume.rawText);

  const resumeSkills = extractSkills(parsedResume.rawText);

  // Destructive, layout-locked region replacement — ONLY at the "top" level.
  // A first pass flags prime candidates (job titles, skill-category labels,
  // individual skills) and swaps their wording for the most relevant posting
  // terminology, holding each replacement to the original's exact character and
  // line-break count so the document's footprint cannot shift. Grounded to
  // resume-supported terms by default so nothing is fabricated. All other levels
  // skip this entirely and remain strictly additive.
  let replacements: Replacement[] = [];
  const replacedBlockIds = new Set<number>();
  if (config.replaceRegions && parsedResume.docx) {
    const regions = identifyReplaceableRegions(parsedResume);
    const titlePhrases = keyPhrases.filter((phrase) => TITLE_PHRASE_RE.test(phrase.text)).map((phrase) => phrase.text);
    const skillPhrases = keyPhrases.filter((phrase) => phrase.text.split(/\s+/).length <= 3).map((phrase) => phrase.text);
    const candidates = {
      jobTitles: uniq([...parsedJob.titleKeywords, ...titlePhrases]),
      skills: uniq([...parsedJob.requiredSkills, ...parsedJob.preferredSkills, ...parsedJob.tools, ...skillPhrases]),
    };
    const groundedTerms = new Set<string>([
      ...resumeSkills.map((skill) => skill.toLowerCase()),
      ...coverage.alreadyCovered.map((phrase) => phrase.text.toLowerCase()),
      ...coverage.missingButSupported.map((phrase) => phrase.text.toLowerCase()),
    ]);
    replacements = await generateReplacements({
      regions,
      candidates,
      groundedTerms,
      groundedOnly: config.groundedReplacementsOnly ?? true,
    });
    applyRegionReplacements(parsedResume.docx, replacements);
    for (const replacement of replacements) replacedBlockIds.add(replacement.region.blockId);
  }

  // Score bullets for enrichment targeting only — nothing is removed or reordered.
  const scored = await scoreContent(parsedResume.bullets, parsedJob);

  // Additive keyword enrichment: weave posting terminology into existing bullets.
  const enriched = await enrichContent({
    bullets: scored,
    parsedJob,
    resumeText: parsedResume.rawText,
    config: {
      substituteTerminology: config.substituteTerminology,
      augmentBullets: config.augmentBullets,
      augmentTitlesAndProjects: config.augmentTitlesAndProjects,
      maxInsertionsPerBullet: config.maxInsertionsPerBullet,
    },
    phraseTargets: coverage.missingButSupported.map((phrase) => ({
      text: phrase.text,
      targetBulletIndex: phrase.targetBulletIndex,
      weight: phrase.weight,
    })),
  });

  const requiredSkills = parsedJob.requiredSkills;
  const matchedRequiredSkills = requiredSkills.filter((skill) => resumeSkills.includes(skill));
  const missingSkills = requiredSkills.filter((skill) => !matchedRequiredSkills.includes(skill));
  const matchScore = requiredSkills.length === 0 ? 0 : Math.round((matchedRequiredSkills.length / requiredSkills.length) * 100);

  // Skills section additions: posting skills supported by the resume's content
  // but not yet listed in the skills section. Existing skills are never dropped.
  const existingSkillsText = (parsedResume.sections.skills ?? []).join(' ');
  const existingSkills = extractSkills(existingSkillsText);
  const postingSkills = uniq([...requiredSkills, ...parsedJob.preferredSkills, ...parsedJob.tools]);
  const taxonomyAppend = config.appendSkills
    ? postingSkills.filter((skill) => resumeSkills.includes(skill) && !existingSkills.includes(skill))
    : [];

  // Also append short, skill-like posting phrases the resume supports but does
  // not list (beyond the literal taxonomy), so mined buzzwords reach the skills
  // section too. Capped to avoid keyword stuffing.
  const lowerExistingSkills = existingSkillsText.toLowerCase();
  const phraseAppend = config.appendSkills
    ? coverage.missingButSupported
        .filter((phrase) => phrase.text.split(/\s+/).length <= 3 && phrase.text.length >= 2)
        .filter((phrase) => !lowerExistingSkills.includes(phrase.text.toLowerCase()))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5)
        .map((phrase) => phrase.text)
    : [];
  const appendSkills = uniq([...taxonomyAppend, ...phraseAppend]);

  const allSkills = uniq([...existingSkills, ...appendSkills]);

  const experienceBullets = enriched.bullets.filter((bullet) => bullet.section === 'experience').map((bullet) => bullet.text);
  const projectBullets = enriched.bullets.filter((bullet) => bullet.section === 'projects').map((bullet) => bullet.text);

  // Weave the single highest-weight supported phrase into the summary when the
  // strategy permits, so the headline reflects the posting's language too.
  const topPhrase = coverage.missingButSupported
    .slice()
    .sort((a, b) => b.weight - a.weight)[0]?.text;
  const summary = buildSummary(
    parsedResume.sections.summary?.join(' ').trim() ?? '',
    config.summaryStrategy,
    allSkills,
    topPhrase,
  );

  let outputBuffer: Buffer;
  if (parsedResume.docx) {
    // Faithful path: edit the uploaded DOCX in place so original formatting and
    // styling are preserved. The from-scratch renderer below is only a fallback
    // for plain-text input or unparseable DOCX files.
    const sectionBlocks = parsedResume.sectionBlocks ?? {};
    const summaryBlockId = sectionBlocks.summary?.[0];
    const skillsBlockId = sectionBlocks.skills?.[0];
    outputBuffer = renderInPlace({
      doc: parsedResume.docx,
      // Skip blocks already overwritten by a layout-locked region replacement so
      // additive enrichment cannot clobber them.
      selected: enriched.bullets.filter(
        (bullet) => bullet.sourceBlockId === undefined || !replacedBlockIds.has(bullet.sourceBlockId),
      ),
      summaryText: config.summaryStrategy !== 'preserve' && summaryBlockId !== undefined ? summary : undefined,
      summaryBlockId,
      appendSkills: skillsBlockId !== undefined ? appendSkills : [],
      skillsBlockId,
    });
  } else {
    outputBuffer = renderDocx({
      header: parsedResume.sections.header ?? [],
      summary,
      skills: allSkills,
      experienceBullets,
      projects: projectBullets,
      education: parsedResume.sections.education?.join(' ').trim() ?? '',
      sectionOrder: SECTION_ORDER,
    });
  }

  const sectionDecisions = buildSectionDecisions(config, enriched.expansions.length, appendSkills);

  // Which mined phrases actually made it into the document text.
  const finalText = enriched.bullets.map((bullet) => bullet.text).join(' \n ').toLowerCase();
  const integratedPhrases = coverage.missingButSupported
    .filter((phrase) => finalText.includes(phrase.text.toLowerCase()))
    .map((phrase) => phrase.text);

  const report = generateReport({
    matchedSkills: allSkills,
    missingSkills,
    selectedBullets: enriched.bullets,
    rejectedBullets: [],
    expandedClaims: enriched.expansions,
    sectionDecisions,
    keyPhrases: {
      detected: keyPhrases.slice(0, 25).map((phrase) => phrase.text),
      integrated: uniq([...integratedPhrases, ...phraseAppend]),
      already_covered: coverage.alreadyCovered.map((phrase) => phrase.text),
      missing_gaps: coverage.missingAndUnsupported.map((phrase) => phrase.text),
    },
    replacements: replacements.length
      ? replacements.map((replacement) => ({
          kind: replacement.region.kind,
          original_text: replacement.region.originalText,
          new_text: replacement.newText,
          char_count: replacement.region.charCount,
          line_count: replacement.region.lineCount,
          lock_held: replacement.lockHeld,
        }))
      : undefined,
  });

  return {
    outputBuffer,
    matchScore,
    report,
    selectedBullets: enriched.bullets,
    rejectedBullets: [],
    missingSkills,
    sectionOrder: SECTION_ORDER,
  };
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

// Applies layout-locked region replacements to the live document, grouping
// sub-span edits per paragraph and applying them right-to-left so offsets stay
// valid. Each replacement's text already matches its span length, so paragraph
// character counts and line breaks are preserved exactly.
function applyRegionReplacements(doc: DocxDocument, replacements: Replacement[]): void {
  const byBlock = new Map<number, Replacement[]>();
  for (const replacement of replacements) {
    const list = byBlock.get(replacement.region.blockId) ?? [];
    list.push(replacement);
    byBlock.set(replacement.region.blockId, list);
  }
  for (const [blockId, reps] of byBlock) {
    const original = doc.getText(blockId);
    const spans = reps.map((replacement) => ({
      start: replacement.region.start ?? 0,
      end: replacement.region.end ?? original.length,
      newText: replacement.newText,
    }));
    doc.setText(blockId, applyReplacementsToText(original, spans));
  }
}

function buildSummary(
  summary: string,
  strategy: AggressivenessConfig['summaryStrategy'],
  skills: string[],
  topPhrase?: string,
): string {
  if (strategy === 'preserve') {
    return summary;
  }
  const emphasis = topPhrase ? ` Emphasis on ${topPhrase}.` : '';
  if (skills.length === 0 && !topPhrase) {
    return summary;
  }
  if (strategy === 'prioritize_keywords') {
    const strengths = skills.length > 0 ? `Key strengths: ${skills.join(', ')}.` : '';
    const lead = [summary, strengths].filter(Boolean).join(' ');
    return `${lead}${emphasis}`.trim();
  }
  // maximize_relevance
  const lead = skills.length > 0
    ? `Results-driven professional specializing in ${skills.join(', ')}.`
    : 'Results-driven professional.';
  return `${[lead, summary].filter(Boolean).join(' ')}${emphasis}`.trim();
}

function buildSectionDecisions(
  config: AggressivenessConfig,
  insertionCount: number,
  appendedSkills: string[],
): Record<string, string> {
  return {
    sections: 'all sections preserved; no content removed or reordered',
    bullets: config.augmentBullets
      ? `${insertionCount} keyword insertion(s)/substitution(s) woven into existing bullets`
      : 'bullets preserved; terminology substitutions only',
    projects: config.augmentTitlesAndProjects
      ? 'project entries enriched with posting keywords'
      : 'projects preserved unchanged',
    skills:
      appendedSkills.length > 0
        ? `appended supported posting skills: ${appendedSkills.join(', ')}`
        : 'no skills appended; existing skills preserved',
    summary: `summary strategy: ${config.summaryStrategy}`,
  };
}
