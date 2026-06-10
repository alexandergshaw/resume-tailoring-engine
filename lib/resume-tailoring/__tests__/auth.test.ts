import { describe, expect, it } from 'vitest';
import { canAccessRun, registerApiClient, validateApiKey } from '@/lib/auth/apiKeys';

describe('API client registration and access control', () => {
  it('registers a client and validates its key', async () => {
    const client = await registerApiClient('Integration test client');
    expect(client.rawKey.startsWith('rte_')).toBe(true);

    const result = await validateApiKey(`Bearer ${client.rawKey}`);
    expect(result.valid).toBe(true);
    expect(result.apiClientId).toBe(client.id);
  });

  it('allows access to anonymously created runs', () => {
    expect(canAccessRun(null, 'client-1')).toBe(true);
    expect(canAccessRun(null, null)).toBe(true);
  });

  it('restricts owned runs to the owning client', () => {
    expect(canAccessRun('client-1', 'client-1')).toBe(true);
    expect(canAccessRun('client-1', 'client-2')).toBe(false);
    expect(canAccessRun('client-1', null)).toBe(false);
  });
});
