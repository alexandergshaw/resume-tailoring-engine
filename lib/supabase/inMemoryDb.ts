export type TailoringRunRecord = {
  id: string;
  api_client_id: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  mode: 'deterministic';
  aggressiveness: 'conservative' | 'balanced' | 'aggressive' | 'max';
  trusted_claim_expansion: boolean;
  claim_expansion_used: boolean;
  resume_file_path: string;
  job_posting_text: string;
  job_posting_url: string | null;
  callback_url: string | null;
  output_file_path: string | null;
  match_score: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TailoringReportRecord = {
  id: string;
  tailoring_run_id: string;
  matched_skills: string[];
  missing_skills: string[];
  selected_bullets: string[];
  rejected_bullets: string[];
  keyword_coverage: Record<string, boolean>;
  section_decisions: Record<string, string>;
  expanded_claims: unknown[];
  created_at: string;
};

export type ApiClientRecord = {
  id: string;
  name: string;
  api_key_hash: string;
  created_at: string;
  is_active: boolean;
};

const runs = new Map<string, TailoringRunRecord>();
const reports = new Map<string, TailoringReportRecord>();
const apiClients = new Map<string, ApiClientRecord>();

export const inMemoryDb = {
  runs,
  reports,
  apiClients,
};
