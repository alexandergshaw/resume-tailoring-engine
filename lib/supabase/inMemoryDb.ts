export type TailoringRunRecord = {
  id: string;
  api_client_id: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  mode: 'deterministic';
  aggressiveness: 'conservative' | 'balanced' | 'aggressive' | 'max' | 'top';
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

export type ResumeBulletRecord = {
  id: string;
  tailoring_run_id: string;
  text: string;
  section: string;
  detected_skills: string[];
  score: number;
  selected: boolean;
  created_at: string;
};

export type SkillTaxonomyRecord = {
  id: string;
  canonical_name: string;
  aliases: string[];
  category: string;
  created_at: string;
};

export type UsageEventRecord = {
  id: string;
  api_client_id: string | null;
  tailoring_run_id: string | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const SEED_SKILL_TAXONOMY: Array<Pick<SkillTaxonomyRecord, 'canonical_name' | 'aliases' | 'category'>> = [
  { canonical_name: 'React', aliases: ['react', 'reactjs', 'react.js'], category: 'frontend' },
  { canonical_name: 'Spring Boot', aliases: ['spring boot', 'springboot'], category: 'backend' },
  { canonical_name: 'AWS', aliases: ['aws', 'amazon web services'], category: 'cloud' },
  { canonical_name: 'Docker', aliases: ['docker', 'containerization'], category: 'devops' },
  { canonical_name: 'Kafka', aliases: ['kafka', 'apache kafka'], category: 'data' },
  { canonical_name: 'TypeScript', aliases: ['typescript', 'ts'], category: 'language' },
  { canonical_name: 'JavaScript', aliases: ['javascript', 'js'], category: 'language' },
  { canonical_name: 'Python', aliases: ['python'], category: 'language' },
  { canonical_name: 'Node.js', aliases: ['node', 'nodejs', 'node.js'], category: 'backend' },
  { canonical_name: 'PostgreSQL', aliases: ['postgres', 'postgresql'], category: 'database' },
];

const runs = new Map<string, TailoringRunRecord>();
const reports = new Map<string, TailoringReportRecord>();
const apiClients = new Map<string, ApiClientRecord>();
const resumeBullets = new Map<string, ResumeBulletRecord[]>();
const skillTaxonomy = new Map<string, SkillTaxonomyRecord>();
const usageEvents: UsageEventRecord[] = [];

for (const [index, entry] of SEED_SKILL_TAXONOMY.entries()) {
  const id = `seed-skill-${index}`;
  skillTaxonomy.set(id, { id, created_at: new Date(0).toISOString(), ...entry });
}

export const inMemoryDb = {
  runs,
  reports,
  apiClients,
  resumeBullets,
  skillTaxonomy,
  usageEvents,
};
