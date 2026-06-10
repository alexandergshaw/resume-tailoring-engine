export type AggressivenessLevel = 'conservative' | 'balanced' | 'aggressive' | 'max';
export const AGGRESSIVENESS_LEVELS: AggressivenessLevel[] = ['conservative', 'balanced', 'aggressive', 'max'];

export type ResumeBullet = {
  text: string;
  section: string;
  detectedSkills: string[];
};

export type ParsedResume = {
  rawText: string;
  sections: Record<string, string[]>;
  bullets: ResumeBullet[];
};

export type ParsedJob = {
  requiredSkills: string[];
  preferredSkills: string[];
  tools: string[];
  domainKeywords: string[];
  titleKeywords: string[];
  responsibilities: string[];
  seniority: 'junior' | 'mid' | 'senior' | 'staff' | 'unknown';
};

export type ScoredBullet = ResumeBullet & {
  score: number;
  reasons: string[];
};

export type ClaimExpansion = {
  claim_type: 'job_title' | 'job_duty' | 'skill' | 'project_name' | 'project_detail';
  original_text: string;
  expanded_text: string;
  basis: string;
};

export type TailoringReport = {
  matched_skills: string[];
  missing_skills: string[];
  selected_bullets: string[];
  rejected_bullets: string[];
  keyword_coverage: Record<string, boolean>;
  section_decisions: Record<string, string>;
  expanded_claims: ClaimExpansion[];
};

export type TailoredResult = {
  outputBuffer: Buffer;
  matchScore: number;
  report: TailoringReport;
  selectedBullets: ScoredBullet[];
  rejectedBullets: ScoredBullet[];
  missingSkills: string[];
  sectionOrder: string[];
};

export type TailorResumeInput = {
  resumeBuffer: Buffer;
  resumeFilename: string;
  jobPostingText: string;
  aggressiveness?: AggressivenessLevel;
  trustedClaimExpansion?: boolean;
  mode?: 'deterministic';
};
