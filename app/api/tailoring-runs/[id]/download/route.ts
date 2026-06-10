import path from 'node:path';
import { NextResponse } from 'next/server';
import { getTailoringRun } from '@/lib/queue';
import { readBuffer } from '@/lib/storage';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = await getTailoringRun(id);

  if (!run?.output_file_path) {
    return NextResponse.json({ error: 'Output not ready' }, { status: 404 });
  }

  const file = await readBuffer(run.output_file_path);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${path.basename(run.output_file_path)}"`,
    },
  });
}
