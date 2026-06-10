import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth/adminAuth';
import { getTailoringReport, getTailoringRun } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export default async function TailoringRunDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!isAdmin(user)) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Tailoring Run</h1>
        <p style={{ color: '#b00020' }}>Not authorized. Signed in as {user.email}.</p>
      </main>
    );
  }

  const { id } = await params;
  const run = await getTailoringRun(id);

  if (!run) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Tailoring Run {id}</h1>
        <p>Run not found.</p>
        <p>
          <Link href="/tailoring-runs">Back to admin</Link>
        </p>
      </main>
    );
  }

  const report = await getTailoringReport(id);
  const expandedClaims = (report?.expanded_claims ?? []) as Array<{
    claim_type: string;
    original_text: string;
    expanded_text: string;
    basis: string;
  }>;

  return (
    <main style={{ padding: 24, maxWidth: 800 }}>
      <h1>Tailoring Run</h1>
      <p style={{ color: '#555' }}>{id}</p>

      <section style={{ marginTop: 16 }}>
        <p>
          <strong>Status:</strong> {run.status}
        </p>
        <p>
          <strong>Match score:</strong> {run.match_score ?? '—'}
        </p>
        <p>
          <strong>Aggressiveness:</strong> {run.aggressiveness}
        </p>
        {run.error_message ? (
          <p style={{ color: '#b00020' }}>
            <strong>Error:</strong> {run.error_message}
          </p>
        ) : null}
        {run.output_file_path ? (
          <p>
            <Link href={`/api/tailoring-runs/${id}/download`}>Download DOCX</Link>
          </p>
        ) : null}
      </section>

      {report ? (
        <section style={{ marginTop: 16 }}>
          <h2>Matched skills</h2>
          <p>{report.matched_skills.length > 0 ? report.matched_skills.join(', ') : 'None'}</p>

          <h2>Missing skills</h2>
          <p>{report.missing_skills.length > 0 ? report.missing_skills.join(', ') : 'None'}</p>

          <h2>Selected bullets</h2>
          <ul>
            {report.selected_bullets.map((bullet, index) => (
              <li key={`selected-${index}`}>{bullet}</li>
            ))}
          </ul>

          <h2>Rejected bullets</h2>
          <ul>
            {report.rejected_bullets.map((bullet, index) => (
              <li key={`rejected-${index}`}>{bullet}</li>
            ))}
          </ul>

          <h2>Section decisions</h2>
          <ul>
            {Object.entries(report.section_decisions).map(([key, value]) => (
              <li key={key}>
                <strong>{key}:</strong> {String(value)}
              </li>
            ))}
          </ul>

          {expandedClaims.length > 0 ? (
            <>
              <h2>Expanded claims</h2>
              <ul>
                {expandedClaims.map((claim, index) => (
                  <li key={`claim-${index}`}>
                    <strong>{claim.claim_type}:</strong> {claim.original_text} → {claim.expanded_text} ({claim.basis})
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : (
        <p style={{ marginTop: 16 }}>Report not available yet.</p>
      )}

      <p style={{ marginTop: 24 }}>
        <Link href="/tailoring-runs">Back to admin</Link>
      </p>
    </main>
  );
}
