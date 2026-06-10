import crypto from 'node:crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/client';
import { inMemoryDb } from '@/lib/supabase/inMemoryDb';

const KEY_PREFIX = 'rte_';

export function createApiKey(): { rawKey: string; hash: string } {
  const rawKey = `${KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
  return { rawKey, hash: hashApiKey(rawKey) };
}

export function hashApiKey(apiKey: string): string {
  const secret = process.env.API_KEY_SECRET ?? 'dev-secret';
  return crypto.createHmac('sha256', secret).update(apiKey).digest('hex');
}

export async function validateApiKey(authorizationHeader: string | null): Promise<{ valid: boolean; apiClientId: string | null }> {
  const allowAnonymous = process.env.NODE_ENV !== 'production' && process.env.ALLOW_ANONYMOUS_API === 'true';
  if (!authorizationHeader && allowAnonymous) {
    return { valid: true, apiClientId: null };
  }

  if (!authorizationHeader?.startsWith('Bearer ')) {
    return { valid: false, apiClientId: null };
  }

  const hash = hashApiKey(authorizationHeader.slice('Bearer '.length));
  const supabase = getSupabaseServiceClient();

  if (!supabase) {
    const match = [...inMemoryDb.apiClients.values()].find((client) => client.api_key_hash === hash && client.is_active);
    return { valid: Boolean(match), apiClientId: match?.id ?? null };
  }

  const { data } = await supabase.from('api_clients').select('id').eq('api_key_hash', hash).eq('is_active', true).maybeSingle();
  return { valid: Boolean(data), apiClientId: (data as { id: string } | null)?.id ?? null };
}
