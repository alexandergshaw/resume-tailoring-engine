create table if not exists api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  api_key_hash text not null,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table if not exists tailoring_runs (
  id uuid primary key default gen_random_uuid(),
  api_client_id uuid references api_clients(id),
  status text not null default 'queued',
  mode text not null default 'deterministic',
  aggressiveness text not null default 'balanced',
  trusted_claim_expansion boolean not null default false,
  claim_expansion_used boolean not null default false,
  resume_file_path text not null,
  job_posting_text text not null,
  job_posting_url text,
  callback_url text,
  output_file_path text,
  match_score numeric,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists tailoring_reports (
  id uuid primary key default gen_random_uuid(),
  tailoring_run_id uuid not null references tailoring_runs(id) on delete cascade,
  matched_skills jsonb not null default '[]'::jsonb,
  missing_skills jsonb not null default '[]'::jsonb,
  selected_bullets jsonb not null default '[]'::jsonb,
  rejected_bullets jsonb not null default '[]'::jsonb,
  keyword_coverage jsonb not null default '{}'::jsonb,
  section_decisions jsonb not null default '{}'::jsonb,
  expanded_claims jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists resume_bullets (
  id uuid primary key default gen_random_uuid(),
  tailoring_run_id uuid not null references tailoring_runs(id) on delete cascade,
  text text not null,
  section text not null,
  detected_skills jsonb not null default '[]'::jsonb,
  score numeric not null,
  selected boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists skill_taxonomy (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  category text not null,
  created_at timestamptz not null default now()
);

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  api_client_id uuid references api_clients(id),
  tailoring_run_id uuid references tailoring_runs(id),
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tailoring_runs_status on tailoring_runs(status);
create index if not exists idx_tailoring_runs_api_client_id on tailoring_runs(api_client_id);
create index if not exists idx_tailoring_reports_tailoring_run_id on tailoring_reports(tailoring_run_id);
create index if not exists idx_resume_bullets_tailoring_run_id on resume_bullets(tailoring_run_id);
create index if not exists idx_usage_events_created_at on usage_events(created_at);
