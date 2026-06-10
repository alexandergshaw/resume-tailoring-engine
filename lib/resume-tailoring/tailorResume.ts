import { AGGRESSIVENESS_CONFIG } from './aggressiveness';
import { claimExpansion } from './claimExpansion';
import { extractSkills } from './extractSkills';
import { generateReport } from './generateReport';
import { parseJob } from './parseJob';
import { parseResume } from './parseResume';
import { renderDocx } from './renderDocx';
import { scoreContent } from './scoreContent';
import type { ScoredBullet, TailorResumeInput, TailoredResult } from './types';

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

  const outputBuffer = renderDocx({
    summary: parsedResume.sections.summary?.join(' ').trim() ?? '',
    skills: matchedSkills,
    experienceBullets: expansionResult.bullets.filter((bullet) => bullet.section === 'experience').map((bullet) => bullet.text),
    projects: expansionResult.bullets.filter((bullet) => bullet.section === 'projects').map((bullet) => bullet.text),
    education: parsedResume.sections.education?.join(' ').trim() ?? '',
  });

  const report = generateReport({
    matchedSkills,
    missingSkills,
    selectedBullets: expansionResult.bullets,
    rejectedBullets: rejected,
    expandedClaims: expansionResult.expansions,
  });

  return {
    outputBuffer,
    matchScore,
    report,
    selectedBullets: expansionResult.bullets,
    missingSkills,
  };
}

export function applyAggressiveness(scored: ScoredBullet[], config: { reorderBullets: boolean; removeLowRelevanceBullets: boolean; minBulletScore: number; maxChangeRatio: number }): ScoredBullet[] {
  const ordered = config.reorderBullets ? [...scored].sort((a, b) => b.score - a.score) : [...scored];
  const filtered = config.removeLowRelevanceBullets ? ordered.filter((bullet) => bullet.score >= config.minBulletScore) : ordered;
  const source = filtered.length > 0 ? filtered : ordered;
  const maxKeep = Math.max(1, Math.ceil(source.length * (1 - config.maxChangeRatio)));
  return source.slice(0, Math.max(maxKeep, 1));
}
