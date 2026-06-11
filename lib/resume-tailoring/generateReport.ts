import type { ClaimExpansion, ScoredBullet, TailoringReport } from './types';

export function generateReport(params: {
  matchedSkills: string[];
  missingSkills: string[];
  selectedBullets: ScoredBullet[];
  rejectedBullets: ScoredBullet[];
  expandedClaims: ClaimExpansion[];
  sectionDecisions: Record<string, string>;
  keyPhrases?: TailoringReport['key_phrases'];
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
    section_decisions: params.sectionDecisions,
    expanded_claims: params.expandedClaims,
    key_phrases: params.keyPhrases,
  };
}
