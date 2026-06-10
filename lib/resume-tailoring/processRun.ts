import crypto from 'node:crypto';
import path from 'node:path';
import {
  getTailoringRun,
  recordUsageEvent,
  storeResumeBullets,
  storeTailoringReport,
  updateTailoringRun,
} from '@/lib/queue';
import { loadSkillTaxonomy } from '@/lib/resume-tailoring/extractSkills';
import { tailorResume } from '@/lib/resume-tailoring/tailorResume';
import type { ScoredBullet } from '@/lib/resume-tailoring/types';
import type { TailoringRunRecord } from '@/lib/supabase/inMemoryDb';
import { readBuffer, storeBuffer } from '@/lib/storage';

function toBulletRecords(bullets: ScoredBullet[], selected: boolean) {
  return bullets.map((bullet) => ({
    text: bullet.text,
    section: bullet.section,
    detected_skills: bullet.detectedSkills,
    score: bullet.score,
    selected,
  }));
}

async function sendCallback(callbackUrl: string | null, payload: Record<string, unknown>): Promise<void> {
  if (!callbackUrl) return;
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (callbackError) {
    console.error('Callback failed', payload.run_id, callbackError);
  }
}

/**
 * Process a single tailoring run end-to-end: tailor the resume, store the
 * rendered DOCX + report, update run status, and fire the callback.
 *
 * On failure the run is marked `failed` with the error message rather than
 * throwing, so callers (worker loop or inline UI submit) never crash.
 */
export async function processSingleRun(run: TailoringRunRecord): Promise<void> {
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

    await storeResumeBullets(run.id, [
      ...toBulletRecords(result.selectedBullets, true),
      ...toBulletRecords(result.rejectedBullets, false),
    ]);

    const claimExpansionUsed = result.report.expanded_claims.length > 0;

    await updateTailoringRun(run.id, {
      status: 'completed',
      output_file_path: outputPath,
      match_score: result.matchScore,
      claim_expansion_used: claimExpansionUsed,
      completed_at: new Date().toISOString(),
    });

    await recordUsageEvent({
      apiClientId: run.api_client_id,
      tailoringRunId: run.id,
      eventType: 'run_completed',
      metadata: { score: result.matchScore, claim_expansion_used: claimExpansionUsed },
    });

    if (claimExpansionUsed) {
      await recordUsageEvent({
        apiClientId: run.api_client_id,
        tailoringRunId: run.id,
        eventType: 'claim_expansion_used',
        metadata: { count: result.report.expanded_claims.length },
      });
    }

    await sendCallback(run.callback_url, {
      run_id: run.id,
      status: 'completed',
      score: result.matchScore,
      download_url: `/api/tailoring-runs/${run.id}/download`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown processing error';
    await updateTailoringRun(run.id, {
      status: 'failed',
      error_message: message,
    });

    await recordUsageEvent({
      apiClientId: run.api_client_id,
      tailoringRunId: run.id,
      eventType: 'run_failed',
      metadata: { error: message },
    });

    await sendCallback(run.callback_url, {
      run_id: run.id,
      status: 'failed',
      error: message,
    });
  }
}

/**
 * Load the skill taxonomy and process a single run by id. Used by the testing
 * UI to process a run inline (Vercel has no long-running worker). For real
 * API workloads the external worker remains the production-grade path.
 */
export async function processRunById(runId: string): Promise<void> {
  await loadSkillTaxonomy();
  const run = await getTailoringRun(runId);
  if (!run) return;
  await processSingleRun(run);
}
