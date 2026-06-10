import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') ?? '/tailoring-runs';
  const redirectTo = new URL(next, url.origin);

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL('/login', url.origin));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/login', url.origin));
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'magiclink' | 'email',
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(new URL('/login', url.origin));
    }
  } else {
    return NextResponse.redirect(new URL('/login', url.origin));
  }

  return NextResponse.redirect(redirectTo);
}
