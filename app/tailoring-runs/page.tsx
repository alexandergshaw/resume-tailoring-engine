import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth/adminAuth';
import { listRuns } from '@/lib/queue';
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
      <RecentRuns />
      <p>
        <Link href="/">Home</Link>
      </p>
    </main>
  );
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#0a7d33',
  failed: '#b00020',
  processing: '#9a6700',
  queued: '#555',
};

async function RecentRuns() {
  const runs = await listRuns(25);

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ marginBottom: 8 }}>Recent runs</h2>
      {runs.length === 0 ? (
        <p style={{ color: '#777' }}>No runs yet. Submit a resume above to get started.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 800 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={{ padding: '6px 8px' }}>Created</th>
              <th style={{ padding: '6px 8px' }}>Status</th>
              <th style={{ padding: '6px 8px' }}>Score</th>
              <th style={{ padding: '6px 8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                  {new Date(run.created_at).toLocaleString()}
                </td>
                <td style={{ padding: '6px 8px', color: STATUS_COLORS[run.status] ?? '#555' }}>{run.status}</td>
                <td style={{ padding: '6px 8px' }}>{run.match_score ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>
                  <Link href={`/tailoring-runs/${run.id}`}>Details</Link>
                  {run.output_file_path ? (
                    <>
                      {' · '}
                      <Link href={`/tailoring-runs/${run.id}/download`}>Download</Link>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
