import crypto from 'node:crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/client';
import {
  inMemoryDb,
  type ResumeBulletRecord,
  type TailoringReportRecord,
  type TailoringRunRecord,
  type UsageEventRecord,
} from '@/lib/supabase/inMemoryDb';

export async function enqueueTailoringRun(input: Omit<TailoringRunRecord, 'id' | 'created_at' | 'updated_at' | 'completed_at' | 'status' | 'claim_expansion_used' | 'output_file_path' | 'match_score' | 'error_message'>): Promise<TailoringRunRecord> {
  const now = new Date().toISOString();
  const record: TailoringRunRecord = {
    ...input,
    id: crypto.randomUUID(),
    status: 'queued',
    claim_expansion_used: false,
    output_file_path: null,
    match_score: null,
    error_message: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
  };

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    inMemoryDb.runs.set(record.id, record);
    return record;
  }

  const { data, error } = await supabase.from('tailoring_runs').insert(record).select().single();
  if (error) throw error;
  return data as TailoringRunRecord;
}

export async function getTailoringRun(id: string): Promise<TailoringRunRecord | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return inMemoryDb.runs.get(id) ?? null;
  }

  const { data } = await supabase.from('tailoring_runs').select('*').eq('id', id).single();
  return (data as TailoringRunRecord | null) ?? null;
}

export async function getTailoringReport(runId: string): Promise<TailoringReportRecord | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return inMemoryDb.reports.get(runId) ?? null;
  }

  const { data } = await supabase.from('tailoring_reports').select('*').eq('tailoring_run_id', runId).single();
  return (data as TailoringReportRecord | null) ?? null;
}

export async function listQueuedRuns(limit = 10): Promise<TailoringRunRecord[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return [...inMemoryDb.runs.values()].filter((run) => run.status === 'queued').slice(0, limit);
  }

  const { data } = await supabase.from('tailoring_runs').select('*').eq('status', 'queued').order('created_at', { ascending: true }).limit(limit);
  return (data as TailoringRunRecord[]) ?? [];
}

export async function updateTailoringRun(id: string, updates: Partial<TailoringRunRecord>): Promise<void> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    const existing = inMemoryDb.runs.get(id);
    if (!existing) return;
    inMemoryDb.runs.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() });
    return;
  }

  await supabase.from('tailoring_runs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function storeTailoringReport(report: TailoringReportRecord): Promise<void> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    inMemoryDb.reports.set(report.tailoring_run_id, report);
    return;
  }

  await supabase.from('tailoring_reports').insert(report);
}

export async function storeResumeBullets(
  runId: string,
  bullets: Array<Omit<ResumeBulletRecord, 'id' | 'tailoring_run_id' | 'created_at'>>,
): Promise<void> {
  const now = new Date().toISOString();
  const records: ResumeBulletRecord[] = bullets.map((bullet) => ({
    ...bullet,
    id: crypto.randomUUID(),
    tailoring_run_id: runId,
    created_at: now,
  }));

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    inMemoryDb.resumeBullets.set(runId, records);
    return;
  }

  if (records.length > 0) {
    await supabase.from('resume_bullets').insert(records);
  }
}

export async function recordUsageEvent(event: {
  apiClientId: string | null;
  tailoringRunId: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const record: UsageEventRecord = {
    id: crypto.randomUUID(),
    api_client_id: event.apiClientId,
    tailoring_run_id: event.tailoringRunId,
    event_type: event.eventType,
    metadata: event.metadata ?? {},
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    inMemoryDb.usageEvents.push(record);
    return;
  }

  await supabase.from('usage_events').insert(record);
}
