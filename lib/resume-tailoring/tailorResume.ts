import { AGGRESSIVENESS_CONFIG, type AggressivenessConfig } from './aggressiveness';
import { enrichContent } from './claimExpansion';
import { extractSkills } from './extractSkills';
import { generateReport } from './generateReport';
import { parseJob } from './parseJob';
import { parseResume } from './parseResume';
import { renderDocx, renderInPlace } from './renderDocx';
import { scoreContent } from './scoreContent';
import type { TailorResumeInput, TailoredResult } from './types';

// Tailoring never reorders sections; the original document order is preserved.
const SECTION_ORDER = ['summary', 'skills', 'experience', 'projects', 'education'];

export async function tailorResume(input: TailorResumeInput): Promise<TailoredResult> {
  const aggressiveness = input.aggressiveness ?? 'balanced';
  const parsedResume = await parseResume({ buffer: input.resumeBuffer, filename: input.resumeFilename });
  const parsedJob = parseJob(input.jobPostingText);
  const config = AGGRESSIVENESS_CONFIG[aggressiveness];

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
  });

  const requiredSkills = parsedJob.requiredSkills;
  const resumeSkills = extractSkills(parsedResume.rawText);
  const matchedRequiredSkills = requiredSkills.filter((skill) => resumeSkills.includes(skill));
  const missingSkills = requiredSkills.filter((skill) => !matchedRequiredSkills.includes(skill));
  const matchScore = requiredSkills.length === 0 ? 0 : Math.round((matchedRequiredSkills.length / requiredSkills.length) * 100);

  // Skills section additions: posting skills supported by the resume's content
  // but not yet listed in the skills section. Existing skills are never dropped.
  const existingSkillsText = (parsedResume.sections.skills ?? []).join(' ');
  const existingSkills = extractSkills(existingSkillsText);
  const postingSkills = uniq([...requiredSkills, ...parsedJob.preferredSkills, ...parsedJob.tools]);
  const appendSkills = config.appendSkills
    ? postingSkills.filter((skill) => resumeSkills.includes(skill) && !existingSkills.includes(skill))
    : [];

  const allSkills = uniq([...existingSkills, ...appendSkills]);

  const experienceBullets = enriched.bullets.filter((bullet) => bullet.section === 'experience').map((bullet) => bullet.text);
  const projectBullets = enriched.bullets.filter((bullet) => bullet.section === 'projects').map((bullet) => bullet.text);

  const summary = buildSummary(parsedResume.sections.summary?.join(' ').trim() ?? '', config.summaryStrategy, allSkills);

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
      selected: enriched.bullets,
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

  const report = generateReport({
    matchedSkills: allSkills,
    missingSkills,
    selectedBullets: enriched.bullets,
    rejectedBullets: [],
    expandedClaims: enriched.expansions,
    sectionDecisions,
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

function buildSummary(summary: string, strategy: AggressivenessConfig['summaryStrategy'], skills: string[]): string {
  if (strategy === 'preserve' || skills.length === 0) {
    return summary;
  }
  if (strategy === 'prioritize_keywords') {
    return summary ? `${summary} Key strengths: ${skills.join(', ')}.` : `Key strengths: ${skills.join(', ')}.`;
  }
  // maximize_relevance
  const lead = `Results-driven professional specializing in ${skills.join(', ')}.`;
  return summary ? `${lead} ${summary}` : lead;
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
