'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { createTailoringRun } from '@/lib/tailoringRuns';

export type SubmitState = { runId?: string; status?: string; error?: string };

export async function submitTailoringRun(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const auth = await requireAdmin();
  if (auth.status === 'unauthenticated') {
    return { error: 'You must sign in to submit a run.' };
  }
  if (auth.status === 'forbidden') {
    return { error: 'Not authorized.' };
  }

  const resumeFile = formData.get('resume_file');
  const jobPostingText = `${formData.get('job_posting_text') ?? ''}`.trim();

  if (!(resumeFile instanceof File) || resumeFile.size === 0 || !jobPostingText) {
    return { error: 'resume_file and job_posting_text are required.' };
  }

  const buffer = Buffer.from(await resumeFile.arrayBuffer());

  try {
    const run = await createTailoringRun({
      apiClientId: null,
      resumeBuffer: buffer,
      resumeFilename: resumeFile.name,
      jobPostingText,
      aggressiveness: `${formData.get('aggressiveness') ?? 'balanced'}`,
    });
    return { runId: run.id, status: run.status };
  } catch (error) {
    console.error('submitTailoringRun failed', error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null
          ? JSON.stringify(error)
          : 'Failed to queue run.';
    return { error: message };
  }
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect('/login');
}
