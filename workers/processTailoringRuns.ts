import crypto from 'node:crypto';
import path from 'node:path';
import { listQueuedRuns, storeTailoringReport, updateTailoringRun } from '@/lib/queue';
import { tailorResume } from '@/lib/resume-tailoring/tailorResume';
import { readBuffer, storeBuffer } from '@/lib/storage';

export async function processTailoringRunsOnce(): Promise<number> {
  const queued = await listQueuedRuns(10);

  for (const run of queued) {
    try {
      await updateTailoringRun(run.id, { status: 'processing' });
      const resumeBuffer = await readBuffer(run.resume_file_path);
      const result = await tailorResume({
        resumeBuffer,
        resumeFilename: path.basename(run.resume_file_path),
        jobPostingText: run.job_posting_text,
        aggressiveness: run.aggressiveness,
        trustedClaimExpansion: run.trusted_claim_expansion,
      });

      const outputPath = await storeBuffer(`outputs/${run.id}.docx`, result.outputBuffer);

      await storeTailoringReport({
        id: crypto.randomUUID(),
        tailoring_run_id: run.id,
        matched_skills: result.report.matched_skills,
        missing_skills: result.report.missing_skills,
        selected_bullets: result.report.selected_bullets,
        rejected_bullets: result.report.rejected_bullets,
        keyword_coverage: result.report.keyword_coverage,
        section_decisions: result.report.section_decisions,
        expanded_claims: result.report.expanded_claims,
        created_at: new Date().toISOString(),
      });

      await updateTailoringRun(run.id, {
        status: 'completed',
        output_file_path: outputPath,
        match_score: result.matchScore,
        claim_expansion_used: result.report.expanded_claims.length > 0,
        completed_at: new Date().toISOString(),
      });

      if (run.callback_url) {
        try {
          await fetch(run.callback_url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              run_id: run.id,
              status: 'completed',
              score: result.matchScore,
              download_url: `/api/tailoring-runs/${run.id}/download`,
            }),
          });
        } catch (callbackError) {
          console.error('Callback failed', run.id, callbackError);
        }
      }
    } catch (error) {
      await updateTailoringRun(run.id, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown processing error',
      });
    }
  }

  return queued.length;
}

export async function processTailoringRuns(): Promise<void> {
  for (;;) {
    const processed = await processTailoringRunsOnce();
    await new Promise((resolve) => setTimeout(resolve, processed > 0 ? 500 : 2000));
  }
}

if (require.main === module) {
  processTailoringRuns().catch((error) => {
    console.error('Worker crashed', error);
    process.exit(1);
  });
}
