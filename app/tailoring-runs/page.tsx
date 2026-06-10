'use client';

import { FormEvent, useState } from 'react';

export default function TailoringRunsPage() {
  const [runId, setRunId] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/tailoring-runs', { method: 'POST', body: form });
    const data = await response.json();
    setRunId(data.run_id);
    setStatus(data.status);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Resume Tailoring Admin</h1>
      <form onSubmit={onSubmit}>
        <p>
          <input name="resume_file" type="file" required />
        </p>
        <p>
          <textarea name="job_posting_text" placeholder="Paste job posting" rows={10} cols={80} required />
        </p>
        <p>
          <select name="aggressiveness" defaultValue="balanced">
            <option value="conservative">conservative</option>
            <option value="balanced">balanced</option>
            <option value="aggressive">aggressive</option>
            <option value="max">max</option>
          </select>
        </p>
        <button type="submit">Run tailoring</button>
      </form>
      {runId && (
        <p>
          Run queued: <a href={`/tailoring-runs/${runId}`}>{runId}</a> ({status})
        </p>
      )}
    </main>
  );
}
