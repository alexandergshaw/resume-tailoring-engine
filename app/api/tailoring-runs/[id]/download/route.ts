import path from 'node:path';
import { NextResponse } from 'next/server';
import { canAccessRun, validateApiKey } from '@/lib/auth/apiKeys';
import { getTailoringRun } from '@/lib/queue';
import { readBuffer } from '@/lib/storage';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await validateApiKey(request.headers.get('authorization'));
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const run = await getTailoringRun(id);

  if (!run?.output_file_path) {
    return NextResponse.json({ error: 'Output not ready' }, { status: 404 });
  }

  if (!canAccessRun(run.api_client_id, auth.apiClientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const file = await readBuffer(run.output_file_path);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${path.basename(run.output_file_path)}"`,
    },
  });
}
