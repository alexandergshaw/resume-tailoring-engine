import crypto from 'node:crypto';
import { enqueueTailoringRun, recordUsageEvent } from '@/lib/queue';
import { AGGRESSIVENESS_LEVELS, type AggressivenessLevel } from '@/lib/resume-tailoring/types';
import { storeBuffer } from '@/lib/storage';
import type { TailoringRunRecord } from '@/lib/supabase/inMemoryDb';

export type CreateTailoringRunInput = {
  apiClientId: string | null;
  resumeBuffer: Buffer;
  resumeFilename: string;
  jobPostingText: string;
  aggressiveness?: string;
  trustedClaimExpansion?: boolean;
  jobPostingUrl?: string | null;
  callbackUrl?: string | null;
};

export async function createTailoringRun(input: CreateTailoringRunInput): Promise<TailoringRunRecord> {
  const resumePath = await storeBuffer(`inputs/${crypto.randomUUID()}-${input.resumeFilename}`, input.resumeBuffer);

  const run = await enqueueTailoringRun({
    api_client_id: input.apiClientId,
    mode: 'deterministic',
    aggressiveness: normalizeAggressiveness(input.aggressiveness ?? 'balanced'),
    trusted_claim_expansion: input.trustedClaimExpansion ?? false,
    resume_file_path: resumePath,
    job_posting_text: input.jobPostingText,
    job_posting_url: input.jobPostingUrl ?? null,
    callback_url: input.callbackUrl ?? null,
  });

  await recordUsageEvent({
    apiClientId: input.apiClientId,
    tailoringRunId: run.id,
    eventType: 'run_created',
    metadata: { aggressiveness: run.aggressiveness, trusted_claim_expansion: run.trusted_claim_expansion },
  });

  return run;
}

function normalizeAggressiveness(value: string): AggressivenessLevel {
  return AGGRESSIVENESS_LEVELS.includes(value as AggressivenessLevel) ? (value as AggressivenessLevel) : 'balanced';
}
