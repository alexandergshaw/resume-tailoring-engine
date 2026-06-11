import type { DocxDocument } from './docxEditor';
import type { KeyPhrase } from './extractKeyPhrases';

export type AggressivenessLevel = 'conservative' | 'balanced' | 'aggressive' | 'max' | 'top';
export const AGGRESSIVENESS_LEVELS: AggressivenessLevel[] = ['conservative', 'balanced', 'aggressive', 'max', 'top'];

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
  // Ranked buzzwords/phrases mined from the posting (multi-word aware). Optional
  // because the lightweight `parseJob` does not run the async miner; it is
  // populated by the tailoring pipeline.
  keyPhrases?: KeyPhrase[];
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
  // Posting buzzword/phrase intelligence: what was detected and how it was
  // handled. `integrated` lists phrases woven into the resume; `missing_gaps`
  // are genuine gaps the resume has no basis for (never fabricated).
  key_phrases?: {
    detected: string[];
    integrated: string[];
    already_covered: string[];
    missing_gaps: string[];
  };
  // Destructive in-place region replacements applied at the "top" level. Each
  // entry confirms the char/line layout lock held for that swap.
  replacements?: Array<{
    kind: 'job_title' | 'skill_category_label' | 'skill_item';
    original_text: string;
    new_text: string;
    char_count: number;
    line_count: number;
    lock_held: boolean;
  }>;
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
