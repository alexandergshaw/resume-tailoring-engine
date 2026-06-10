import { afterEach, describe, expect, it, vi } from 'vitest';
import { enqueueTailoringRun, getTailoringReport, getTailoringRun } from '@/lib/queue';
import { storeBuffer } from '@/lib/storage';
import { inMemoryDb } from '@/lib/supabase/inMemoryDb';
import { processTailoringRunsOnce } from '@/workers/processTailoringRuns';

async function enqueue(overrides: Partial<Parameters<typeof enqueueTailoringRun>[0]> = {}) {
  const resumePath = await storeBuffer(
    `inputs/test-${crypto.randomUUID()}.txt`,
    Buffer.from('Experience\n- Built React and AWS services'),
  );
  return enqueueTailoringRun({
    api_client_id: 'client-worker',
    mode: 'deterministic',
    aggressiveness: 'balanced',
    trusted_claim_expansion: false,
    resume_file_path: resumePath,
    job_posting_text: 'Required: React, AWS',
    job_posting_url: null,
    callback_url: 'https://example.com/callback',
    ...overrides,
  });
}

describe('processTailoringRunsOnce', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('completes a run, stores report and bullets, records usage and fires callback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const run = await enqueue();
    await processTailoringRunsOnce();

    const updated = await getTailoringRun(run.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.match_score).toBe(100);

    const report = await getTailoringReport(run.id);
    expect(report).not.toBeNull();

    expect(inMemoryDb.resumeBullets.get(run.id)?.length).toBeGreaterThan(0);

    const events = inMemoryDb.usageEvents.filter((event) => event.tailoring_run_id === run.id);
    expect(events.some((event) => event.event_type === 'run_completed')).toBe(true);

    const callbackBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callbackBody).toMatchObject({ run_id: run.id, status: 'completed', score: 100 });
  });

  it('marks a run failed, records usage and fires a failure callback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const run = await enqueue({ resume_file_path: '/nonexistent/path/resume.txt' });
    await processTailoringRunsOnce();

    const updated = await getTailoringRun(run.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.error_message).toBeTruthy();

    const events = inMemoryDb.usageEvents.filter((event) => event.tailoring_run_id === run.id);
    expect(events.some((event) => event.event_type === 'run_failed')).toBe(true);

    const failureCall = fetchMock.mock.calls.find((call) => JSON.parse(call[1].body).run_id === run.id);
    expect(JSON.parse(failureCall![1].body)).toMatchObject({ run_id: run.id, status: 'failed' });
  });
});
