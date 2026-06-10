import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Resume Tailoring Service</h1>
      <p>API-first service for generating tailored resumes and reports.</p>
      <p>
        <Link href="/tailoring-runs">Open admin test UI</Link>
      </p>
    </main>
  );
}
