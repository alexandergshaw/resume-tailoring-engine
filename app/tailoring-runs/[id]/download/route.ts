import path from 'node:path';
import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth/adminAuth';
import { getTailoringRun } from '@/lib/queue';
import { readBuffer } from '@/lib/storage';

/**
 * Session-authenticated DOCX download for the admin testing UI. Unlike the
 * public `/api/tailoring-runs/[id]/download` route (API-key auth), this route
 * authorizes via the Supabase admin session so the browser can download
 * generated resumes directly.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
