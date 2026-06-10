import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/auth/adminAuth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/tailoringRuns', () => ({ createTailoringRun: vi.fn() }));

import { requireAdmin } from '@/lib/auth/adminAuth';
import { createTailoringRun } from '@/lib/tailoringRuns';
import { submitTailoringRun } from '@/app/tailoring-runs/actions';

function formWithResume(): FormData {
  const form = new FormData();
  form.set('resume_file', new File([Buffer.from('Experience\n- Built React')], 'resume.txt', { type: 'text/plain' }));
  form.set('job_posting_text', 'Required: React');
  form.set('aggressiveness', 'balanced');
  return form;
}

describe('submitTailoringRun authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ status: 'unauthenticated' });
    const result = await submitTailoringRun({}, formWithResume());
    expect(result.error).toBeTruthy();
    expect(createTailoringRun).not.toHaveBeenCalled();
  });

  it('rejects non-admin callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ status: 'forbidden' });
    const result = await submitTailoringRun({}, formWithResume());
    expect(result.error).toBe('Not authorized.');
    expect(createTailoringRun).not.toHaveBeenCalled();
  });

  it('queues a run for an admin caller', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      status: 'ok',
      user: { id: 'admin-1', email: 'admin@example.com' } as never,
    });
    vi.mocked(createTailoringRun).mockResolvedValue({ id: 'run-1', status: 'queued' } as never);

    const result = await submitTailoringRun({}, formWithResume());
    expect(result).toEqual({ runId: 'run-1', status: 'queued' });
    expect(createTailoringRun).toHaveBeenCalledOnce();
  });
});
