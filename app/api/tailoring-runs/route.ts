import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/apiKeys';
import { createTailoringRun } from '@/lib/tailoringRuns';

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

  const run = await createTailoringRun({
    apiClientId: auth.apiClientId,
    resumeBuffer: buffer,
    resumeFilename: resumeFile.name,
    jobPostingText,
    aggressiveness: `${form.get('aggressiveness') ?? 'balanced'}`,
    trustedClaimExpansion: `${form.get('trusted_claim_expansion') ?? 'false'}` === 'true',
    jobPostingUrl: optionalValue(form.get('job_posting_url')),
    callbackUrl: optionalValue(form.get('callback_url')),
  });

  return NextResponse.json({ run_id: run.id, status: run.status }, { status: 202 });
}

function optionalValue(value: FormDataEntryValue | null): string | null {
  const text = `${value ?? ''}`.trim();
  return text.length > 0 ? text : null;
}
