import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { isAdmin } from '@/lib/auth/adminAuth';

function user(overrides: Partial<User>): User {
  return {
    id: 'user-1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    ...overrides,
  } as User;
}

describe('isAdmin', () => {
  const originalEnv = process.env.ADMIN_EMAILS;

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalEnv;
    vi.unstubAllEnvs();
  });

  it('returns false for null user', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('grants admin via ADMIN_EMAILS (case-insensitive)', () => {
    process.env.ADMIN_EMAILS = 'Admin@Example.com, other@example.com';
    expect(isAdmin(user({ email: 'admin@example.com' }))).toBe(true);
    expect(isAdmin(user({ email: 'ADMIN@EXAMPLE.COM' }))).toBe(true);
  });

  it('grants admin via app_metadata.role', () => {
    process.env.ADMIN_EMAILS = '';
    expect(isAdmin(user({ email: 'someone@example.com', app_metadata: { role: 'admin' } }))).toBe(true);
    expect(isAdmin(user({ email: 'someone@example.com', app_metadata: { role: 'ADMIN' } }))).toBe(true);
  });

  it('rejects non-admin users', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    expect(isAdmin(user({ email: 'nobody@example.com' }))).toBe(false);
    expect(isAdmin(user({ email: 'nobody@example.com', app_metadata: { role: 'user' } }))).toBe(false);
  });
});
