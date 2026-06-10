import { AGGRESSIVENESS_CONFIG, type AggressivenessConfig } from './aggressiveness';
import { claimExpansion } from './claimExpansion';
import { extractSkills } from './extractSkills';
import { generateReport } from './generateReport';
import { parseJob } from './parseJob';
import { parseResume } from './parseResume';
import { renderDocx } from './renderDocx';
import { scoreContent } from './scoreContent';
import type { ScoredBullet, TailorResumeInput, TailoredResult } from './types';

const DEFAULT_SECTION_ORDER = ['summary', 'skills', 'experience', 'projects', 'education'];
const REORDERED_SECTION_ORDER = ['skills', 'experience', 'projects', 'summary', 'education'];

export async function tailorResume(input: TailorResumeInput): Promise<TailoredResult> {
  const aggressiveness = input.aggressiveness ?? 'balanced';
  const parsedResume = await parseResume({ buffer: input.resumeBuffer, filename: input.resumeFilename });
  const parsedJob = parseJob(input.jobPostingText);
  const scored = scoreContent(parsedResume.bullets, parsedJob);
  const config = AGGRESSIVENESS_CONFIG[aggressiveness];

  const selected = applyAggressiveness(scored, config);
  const rejected = scored.filter((bullet) => !selected.includes(bullet));

  const effectiveMaxExpansion = aggressiveness === 'max' && input.trustedClaimExpansion === true;
  const expansionResult = effectiveMaxExpansion
    ? claimExpansion({ bullets: selected, jobText: input.jobPostingText })
    : { bullets: selected, expansions: [] };

  const matchedSkills = extractSkills(expansionResult.bullets.map((bullet) => bullet.text).join(' '));
  const requiredSkills = parsedJob.requiredSkills;
  const matchedRequiredSkills = requiredSkills.filter((skill) => matchedSkills.includes(skill));
  const missingSkills = requiredSkills.filter((skill) => !matchedRequiredSkills.includes(skill));
  const matchScore = requiredSkills.length === 0 ? 0 : Math.round((matchedRequiredSkills.length / requiredSkills.length) * 100);

  const orderedSkills = config.reorderSkills ? prioritizeSkills(matchedSkills, requiredSkills) : matchedSkills;

  const experienceBullets = expansionResult.bullets.filter((bullet) => bullet.section === 'experience').map((bullet) => bullet.text);
  const projectBullets = expansionResult.bullets.filter((bullet) => bullet.section === 'projects');
  const orderedProjects = (config.projectSwaps ? [...projectBullets].sort((a, b) => b.score - a.score) : projectBullets).map((bullet) => bullet.text);

  const summary = buildSummary(parsedResume.sections.summary?.join(' ').trim() ?? '', config.summaryStrategy, orderedSkills);
  const sectionOrder = config.reorderSections ? REORDERED_SECTION_ORDER : DEFAULT_SECTION_ORDER;

  const outputBuffer = renderDocx({
    summary,
    skills: orderedSkills,
    experienceBullets,
    projects: orderedProjects,
    education: parsedResume.sections.education?.join(' ').trim() ?? '',
    sectionOrder,
  });

  const sectionDecisions = buildSectionDecisions(config, rejected.length);

  const report = generateReport({
    matchedSkills: orderedSkills,
    missingSkills,
    selectedBullets: expansionResult.bullets,
    rejectedBullets: rejected,
    expandedClaims: expansionResult.expansions,
    sectionDecisions,
  });

  return {
    outputBuffer,
    matchScore,
    report,
    selectedBullets: expansionResult.bullets,
    rejectedBullets: rejected,
    missingSkills,
    sectionOrder,
  };
}

export function applyAggressiveness(scored: ScoredBullet[], config: AggressivenessConfig): ScoredBullet[] {
  const ordered = config.reorderBullets ? [...scored].sort((a, b) => b.score - a.score) : [...scored];
  const filtered = config.removeLowRelevanceBullets ? ordered.filter((bullet) => bullet.score >= config.minBulletScore) : ordered;
  const source = filtered.length > 0 ? filtered : ordered;
  const maxKeep = Math.max(1, Math.ceil(source.length * (1 - config.maxChangeRatio)));
  return source.slice(0, Math.max(maxKeep, 1));
}

function prioritizeSkills(skills: string[], requiredSkills: string[]): string[] {
  const required = skills.filter((skill) => requiredSkills.includes(skill));
  const rest = skills.filter((skill) => !requiredSkills.includes(skill));
  return [...required, ...rest];
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

function buildSectionDecisions(config: AggressivenessConfig, removedCount: number): Record<string, string> {
  return {
    sections: config.reorderSections ? 'reordered to lead with skills and experience' : 'original section order preserved',
    bullets: config.reorderBullets ? 'reordered by relevance score' : 'original bullet order preserved',
    bullets_removed: config.removeLowRelevanceBullets ? `${removedCount} low-relevance bullet(s) removed` : 'no bullets removed',
    projects: config.projectSwaps ? 'projects reordered by relevance score' : 'original project order preserved',
    skills: config.reorderSkills ? 'job-required skills prioritized' : 'skills canonicalized against taxonomy',
    summary: `summary strategy: ${config.summaryStrategy}`,
  };
}
