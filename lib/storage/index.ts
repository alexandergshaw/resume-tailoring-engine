import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSupabaseServiceClient } from '@/lib/supabase/client';

const BASE = path.join(process.cwd(), '.data', 'storage');
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'resume-tailoring';

export async function storeBuffer(relativePath: string, content: Buffer): Promise<string> {
  const supabase = getSupabaseServiceClient();
  if (supabase) {
    const { error } = await supabase.storage.from(BUCKET).upload(relativePath, content, {
      upsert: true,
      contentType: 'application/octet-stream',
    });
    if (error) throw error;
    return relativePath;
  }

  const target = path.join(BASE, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
  return target;
}

export async function readBuffer(pathOrKey: string): Promise<Buffer> {
  const supabase = getSupabaseServiceClient();
  if (supabase && !path.isAbsolute(pathOrKey)) {
    const { data, error } = await supabase.storage.from(BUCKET).download(pathOrKey);
    if (error || !data) throw error ?? new Error('Storage object not found');
    return Buffer.from(await data.arrayBuffer());
  }

  return fs.readFile(pathOrKey);
}

export async function getSignedDownloadUrl(pathOrKey: string, expiresInSeconds = 3600): Promise<string | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase || path.isAbsolute(pathOrKey)) return null;

  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(pathOrKey, expiresInSeconds);
  return data?.signedUrl ?? null;
}
