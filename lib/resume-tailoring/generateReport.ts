import type { ClaimExpansion, ScoredBullet, TailoringReport } from './types';

export function generateReport(params: {
  matchedSkills: string[];
  missingSkills: string[];
  selectedBullets: ScoredBullet[];
  rejectedBullets: ScoredBullet[];
  expandedClaims: ClaimExpansion[];
}): TailoringReport {
  const keywordCoverage: Record<string, boolean> = {};
  for (const skill of [...params.matchedSkills, ...params.missingSkills]) {
    keywordCoverage[skill] = params.matchedSkills.includes(skill);
  }

  return {
    matched_skills: params.matchedSkills,
    missing_skills: params.missingSkills,
    selected_bullets: params.selectedBullets.map((bullet) => bullet.text),
    rejected_bullets: params.rejectedBullets.map((bullet) => bullet.text),
    keyword_coverage: keywordCoverage,
    section_decisions: {
      experience: 'prioritized by score',
      projects: 'kept highest scoring projects',
      skills: 'canonicalized against taxonomy',
    },
    expanded_claims: params.expandedClaims,
  };
}
