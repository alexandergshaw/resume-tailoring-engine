import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/auth/adminAuth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/resume-tailoring/processRun', () => ({ processRunById: vi.fn() }));
vi.mock('@/lib/tailoringRuns', () => ({ createTailoringRun: vi.fn() }));
vi.mock('@/lib/queue', () => ({ updateTailoringRun: vi.fn(), getTailoringRun: vi.fn() }));
vi.mock('@/lib/storage', () => ({ storeBuffer: vi.fn() }));
vi.mock('@/lib/resume-tailoring/mappings/fillTemplate', () => ({ fillTemplateDocx: vi.fn() }));

import { requireAdmin } from '@/lib/auth/adminAuth';
import { getTailoringRun, updateTailoringRun } from '@/lib/queue';
import { fillTemplateDocx } from '@/lib/resume-tailoring/mappings/fillTemplate';
import { storeBuffer } from '@/lib/storage';
import { createTailoringRun } from '@/lib/tailoringRuns';
import { tailorFromTemplate } from '@/app/tailoring-runs/actions';

function adminOk() {
  vi.mocked(requireAdmin).mockResolvedValue({
    status: 'ok',
    user: { id: 'admin-1', email: 'admin@example.com' } as never,
  });
}

function templateForm(): FormData {
  const form = new FormData();
  form.set(
    'template_file',
    new File([Buffer.from('PK template')], 'template.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  );
  form.set('job_posting_text', 'Senior React engineer building REST APIs.');
  form.set('aggressiveness', 'balanced');
  return form;
}

describe('tailorFromTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ status: 'unauthenticated' });
    const result = await tailorFromTemplate({}, templateForm());
    expect(result.error).toBeTruthy();
    expect(fillTemplateDocx).not.toHaveBeenCalled();
  });

  it('rejects non-admin callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ status: 'forbidden' });
    const result = await tailorFromTemplate({}, templateForm());
    expect(result.error).toBe('Not authorized.');
    expect(fillTemplateDocx).not.toHaveBeenCalled();
  });

  it('rejects a missing template file', async () => {
    adminOk();
    const form = new FormData();
    form.set('job_posting_text', 'Senior React engineer.');
    const result = await tailorFromTemplate({}, form);
    expect(result.error).toBeTruthy();
    expect(fillTemplateDocx).not.toHaveBeenCalled();
  });

  it('rejects a non-docx template', async () => {
    adminOk();
    const form = new FormData();
    form.set('template_file', new File([Buffer.from('x')], 'template.txt', { type: 'text/plain' }));
    form.set('job_posting_text', 'Senior React engineer.');
    const result = await tailorFromTemplate({}, form);
    expect(result.error).toContain('.docx');
    expect(fillTemplateDocx).not.toHaveBeenCalled();
  });

  it('rejects an empty job posting', async () => {
    adminOk();
    const form = new FormData();
    form.set('template_file', new File([Buffer.from('x')], 'template.docx'));
    form.set('job_posting_text', '   ');
    const result = await tailorFromTemplate({}, form);
    expect(result.error).toBeTruthy();
    expect(fillTemplateDocx).not.toHaveBeenCalled();
  });

  it('fills the template, stores the output, and completes the run', async () => {
    adminOk();
    vi.mocked(fillTemplateDocx).mockReturnValue(Buffer.from('filled docx'));
    vi.mocked(createTailoringRun).mockResolvedValue({ id: 'run-9', status: 'queued' } as never);
    vi.mocked(storeBuffer).mockResolvedValue('outputs/run-9.docx');
    vi.mocked(getTailoringRun).mockResolvedValue({ id: 'run-9', status: 'completed' } as never);

    const result = await tailorFromTemplate({}, templateForm());

    expect(fillTemplateDocx).toHaveBeenCalledOnce();
    expect(storeBuffer).toHaveBeenCalledWith('outputs/run-9.docx', expect.anything());
    expect(updateTailoringRun).toHaveBeenCalledWith(
      'run-9',
      expect.objectContaining({ status: 'completed', output_file_path: 'outputs/run-9.docx' }),
    );
    expect(result).toEqual({ runId: 'run-9', status: 'completed' });
  });
});
