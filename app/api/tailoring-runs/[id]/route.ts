import { NextResponse } from 'next/server';
import { getTailoringReport, getTailoringRun } from '@/lib/queue';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = await getTailoringRun(id);

  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const report = await getTailoringReport(id);

  return NextResponse.json({
    run_id: run.id,
    status: run.status,
    score: run.match_score,
    download_url: run.output_file_path ? `/api/tailoring-runs/${run.id}/download` : null,
    report,
  });
}
