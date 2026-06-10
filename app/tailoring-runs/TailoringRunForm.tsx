'use client';

import { useActionState } from 'react';
import { submitTailoringRun, type SubmitState } from './actions';

const initialState: SubmitState = {};

export default function TailoringRunForm() {
  const [state, formAction, pending] = useActionState(submitTailoringRun, initialState);

  return (
    <>
      <form action={formAction}>
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
        <button type="submit" disabled={pending}>
          {pending ? 'Submitting…' : 'Run tailoring'}
        </button>
      </form>
      {state.error && <p style={{ color: '#b00020' }}>Error: {state.error}</p>}
      {state.runId && (
        <p>
          Run queued: <a href={`/tailoring-runs/${state.runId}`}>{state.runId}</a> ({state.status})
        </p>
      )}
    </>
  );
}
