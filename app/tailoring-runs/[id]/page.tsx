import Link from 'next/link';

export default async function TailoringRunDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main style={{ padding: 24 }}>
      <h1>Tailoring Run {id}</h1>
      <p>
        Use API: <code>/api/tailoring-runs/{id}</code>
      </p>
      <p>
        <Link href={`/api/tailoring-runs/${id}/download`}>Download DOCX</Link>
      </p>
    </main>
  );
}
