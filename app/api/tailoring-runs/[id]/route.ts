import { NextResponse } from 'next/server';
import { canAccessRun, validateApiKey } from '@/lib/auth/apiKeys';
import { getTailoringReport, getTailoringRun } from '@/lib/queue';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await validateApiKey(request.headers.get('authorization'));
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const run = await getTailoringRun(id);

  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canAccessRun(run.api_client_id, auth.apiClientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
