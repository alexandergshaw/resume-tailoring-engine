import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth/adminAuth';
import { signOut } from './actions';
import TailoringRunForm from './TailoringRunForm';

export const dynamic = 'force-dynamic';

export default async function TailoringRunsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!isAdmin(user)) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Resume Tailoring Admin</h1>
        <p style={{ color: '#b00020' }}>Not authorized. Signed in as {user.email}.</p>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Resume Tailoring Admin</h1>
        <form action={signOut}>
          <span style={{ marginRight: 8, color: '#555' }}>{user.email}</span>
          <button type="submit">Sign out</button>
        </form>
      </div>
      <TailoringRunForm />
      <p style={{ marginTop: 16, color: '#777' }}>Testing console — runs use the configured database.</p>
      <p>
        <Link href="/">Home</Link>
      </p>
    </main>
  );
}
