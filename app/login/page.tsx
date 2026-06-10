import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth/adminAuth';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user && isAdmin(user)) {
    redirect('/tailoring-runs');
  }

  return (
    <main style={{ padding: 24, maxWidth: 480 }}>
      <h1>Admin sign in</h1>
      {user && !isAdmin(user) ? (
        <p style={{ color: '#b00020' }}>
          Signed in as {user.email}, but this account is not an admin.
        </p>
      ) : (
        <p>Sign in with GitHub using an admin account to access the testing console.</p>
      )}
      <LoginForm />
      <p style={{ marginTop: 24 }}>
        <Link href="/">Home</Link>
      </p>
    </main>
  );
}
