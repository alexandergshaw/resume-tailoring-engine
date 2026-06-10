import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/apiKeys';
import { enqueueTailoringRun } from '@/lib/queue';
import { AGGRESSIVENESS_LEVELS, type AggressivenessLevel } from '@/lib/resume-tailoring/types';
import { storeBuffer } from '@/lib/storage';

export async function POST(request: Request) {
  const auth = await validateApiKey(request.headers.get('authorization'));
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await request.formData();
  const resumeFile = form.get('resume_file');
  const jobPostingText = `${form.get('job_posting_text') ?? ''}`.trim();

  if (!(resumeFile instanceof File) || !jobPostingText) {
    return NextResponse.json({ error: 'resume_file and job_posting_text are required' }, { status: 400 });
  }

  const buffer = Buffer.from(await resumeFile.arrayBuffer());
  const resumePath = await storeBuffer(`inputs/${crypto.randomUUID()}-${resumeFile.name}`, buffer);

  const run = await enqueueTailoringRun({
    api_client_id: auth.apiClientId,
    mode: 'deterministic',
    aggressiveness: normalizeAggressiveness(`${form.get('aggressiveness') ?? 'balanced'}`),
    trusted_claim_expansion: `${form.get('trusted_claim_expansion') ?? 'false'}` === 'true',
    resume_file_path: resumePath,
    job_posting_text: jobPostingText,
    job_posting_url: optionalValue(form.get('job_posting_url')),
    callback_url: optionalValue(form.get('callback_url')),
  });

  return NextResponse.json({ run_id: run.id, status: run.status }, { status: 202 });
}

function normalizeAggressiveness(value: string): AggressivenessLevel {
  return AGGRESSIVENESS_LEVELS.includes(value as AggressivenessLevel) ? (value as AggressivenessLevel) : 'balanced';
}

function optionalValue(value: FormDataEntryValue | null): string | null {
  const text = `${value ?? ''}`.trim();
  return text.length > 0 ? text : null;
}
