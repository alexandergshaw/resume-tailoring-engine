import type { DocxDocument } from './docxEditor';

export type AggressivenessLevel = 'conservative' | 'balanced' | 'aggressive' | 'max';
export const AGGRESSIVENESS_LEVELS: AggressivenessLevel[] = ['conservative', 'balanced', 'aggressive', 'max'];

export type ResumeBullet = {
  text: string;
  section: string;
  detectedSkills: string[];
  // Back-reference to the source DOCX paragraph block this bullet came from,
  // enabling in-place editing that preserves the original formatting. Absent
  // for plain-text input.
  sourceBlockId?: number;
};

export type ParsedResume = {
  rawText: string;
  sections: Record<string, string[]>;
  bullets: ResumeBullet[];
  // Present only when the input was a parseable DOCX. Carries the original
  // package so the renderer can edit text in place and keep all styling.
  docx?: DocxDocument;
  // Ordered source paragraph block ids per section (DOCX input only).
  sectionBlocks?: Record<string, number[]>;
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
