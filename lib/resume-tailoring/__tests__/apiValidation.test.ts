import { describe, expect, it } from 'vitest';
import { createApiKey, hashApiKey, validateApiKey } from '@/lib/auth/apiKeys';
import { inMemoryDb } from '@/lib/supabase/inMemoryDb';

describe('API key auth', () => {
  it('creates and validates hashed API keys', async () => {
    const created = createApiKey();
    inMemoryDb.apiClients.set('client-1', {
      id: 'client-1',
      name: 'Test client',
      api_key_hash: created.hash,
      created_at: new Date().toISOString(),
      is_active: true,
    });

    const valid = await validateApiKey('Bearer ' + created.rawKey);
    expect(valid.valid).toBe(true);
    expect(valid.apiClientId).toBe('client-1');
    expect(hashApiKey(created.rawKey)).toBe(created.hash);
  });
});
