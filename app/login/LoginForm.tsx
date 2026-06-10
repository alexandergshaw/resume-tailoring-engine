'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function LoginForm() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSignIn() {
    setError('');
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (signInError) {
        setError(signInError.message);
        setPending(false);
      }
      // On success the browser is redirected to GitHub; no further UI needed.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onSignIn} disabled={pending}>
        {pending ? 'Redirecting…' : 'Sign in with GitHub'}
      </button>
      {error && <p style={{ color: '#b00020' }}>Error: {error}</p>}
    </div>
  );
}
