import type { User } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Determines whether an authenticated user is an admin.
 *
 * A user is an admin if either:
 *  - their email is listed in the `ADMIN_EMAILS` env var (comma-separated,
 *    case-insensitive), or
 *  - their Supabase `app_metadata.role` is `'admin'`.
 */
export function isAdmin(user: Pick<User, 'email' | 'app_metadata'> | null | undefined): boolean {
  if (!user) return false;

  const role = (user.app_metadata as { role?: unknown } | undefined)?.role;
  if (typeof role === 'string' && role.toLowerCase() === 'admin') {
    return true;
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  const email = user.email?.toLowerCase();
  return Boolean(email && adminEmails.includes(email));
}

/**
 * Returns the currently authenticated user, or null if not signed in / auth
 * is not configured.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export type AdminAuthResult =
  | { status: 'ok'; user: User }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' };

/**
 * Resolves the current admin user. Returns a discriminated result so callers
 * can decide how to respond (redirect to login, show "not authorized", etc.).
 */
export async function requireAdmin(): Promise<AdminAuthResult> {
  const user = await getCurrentUser();
  if (!user) return { status: 'unauthenticated' };
  if (!isAdmin(user)) return { status: 'forbidden' };
  return { status: 'ok', user };
}
