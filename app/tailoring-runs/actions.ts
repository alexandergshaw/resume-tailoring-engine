'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/adminAuth';
import { processRunById } from '@/lib/resume-tailoring/processRun';
import { fillTemplateDocx } from '@/lib/resume-tailoring/mappings/fillTemplate';
import type { JobPostingSignals } from '@/lib/resume-tailoring/mappings/selectMappings';
import { parseJob } from '@/lib/resume-tailoring/parseJob';
import { getTailoringRun, updateTailoringRun } from '@/lib/queue';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { storeBuffer } from '@/lib/storage';
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

    // Vercel has no long-running worker, so the testing UI processes the run
    // inline here. `processRunById` marks the run failed (never throws) on
    // error. The external worker remains the production path for API workloads.
    await processRunById(run.id);
    const processed = await getTailoringRun(run.id);
    return { runId: run.id, status: processed?.status ?? run.status };
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

/**
 * Tailors an uploaded resume TEMPLATE docx to the pasted job posting by filling
 * its {{PLACEHOLDER}} tokens with deterministic mappings. Reuses the run record
 * + storage so the existing session-authenticated download route serves the
 * filled DOCX. Mirrors submitTailoringRun's error handling (never throws).
 */
export async function tailorFromTemplate(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const auth = await requireAdmin();
  if (auth.status === 'unauthenticated') {
    return { error: 'You must sign in to submit a run.' };
  }
  if (auth.status === 'forbidden') {
    return { error: 'Not authorized.' };
  }

  const templateFile = formData.get('template_file');
  const jobPostingText = `${formData.get('job_posting_text') ?? ''}`.trim();

  if (!(templateFile instanceof File) || templateFile.size === 0 || !jobPostingText) {
    return { error: 'template_file and job_posting_text are required.' };
  }
  if (!/\.docx$/i.test(templateFile.name)) {
    return { error: 'Template must be a .docx file.' };
  }

  try {
    const templateBuffer = Buffer.from(await templateFile.arrayBuffer());
    const parsed = parseJob(jobPostingText);
    const signals: JobPostingSignals = {
      text: jobPostingText,
      requiredSkills: parsed.requiredSkills,
      preferredSkills: parsed.preferredSkills,
      jobTitles: parsed.titleKeywords,
      domains: parsed.domainKeywords,
    };

    const output = fillTemplateDocx(templateBuffer, signals);

    const run = await createTailoringRun({
      apiClientId: null,
      resumeBuffer: templateBuffer,
      resumeFilename: templateFile.name,
      jobPostingText,
      aggressiveness: `${formData.get('aggressiveness') ?? 'balanced'}`,
    });

    const outputPath = await storeBuffer(`outputs/${run.id}.docx`, output);
    await updateTailoringRun(run.id, {
      status: 'completed',
      output_file_path: outputPath,
      completed_at: new Date().toISOString(),
    });

    const processed = await getTailoringRun(run.id);
    return { runId: run.id, status: processed?.status ?? 'completed' };
  } catch (error) {
    console.error('tailorFromTemplate failed', error);
    const message = error instanceof Error ? error.message : 'Failed to tailor template.';
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
