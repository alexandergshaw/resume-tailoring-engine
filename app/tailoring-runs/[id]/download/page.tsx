import { redirect } from 'next/navigation';

export default async function TailoringRunDownloadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/api/tailoring-runs/${id}/download`);
}
