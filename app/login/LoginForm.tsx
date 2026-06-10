'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=/tailoring-runs`;
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo },
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return <p>Check your email for a magic sign-in link.</p>;
  }

  return (
    <form onSubmit={onSubmit}>
      <p>
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          style={{ width: 280 }}
        />
      </p>
      <button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send magic link'}
      </button>
      {error && <p style={{ color: '#b00020' }}>Error: {error}</p>}
    </form>
  );
}
