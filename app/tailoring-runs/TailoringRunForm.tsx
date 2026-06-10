'use client';

import { useActionState, useEffect, useState } from 'react';
import { submitTailoringRun, type SubmitState } from './actions';

const initialState: SubmitState = {};

const STORAGE_KEY = 'tailoring-run-draft';

type Draft = { jobPostingText: string; aggressiveness: string };

const DEFAULT_DRAFT: Draft = { jobPostingText: '', aggressiveness: 'balanced' };

function loadDraft(): Draft {
  if (typeof window === 'undefined') return DEFAULT_DRAFT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DRAFT;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      jobPostingText: typeof parsed.jobPostingText === 'string' ? parsed.jobPostingText : '',
      aggressiveness: typeof parsed.aggressiveness === 'string' ? parsed.aggressiveness : 'balanced',
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

export default function TailoringRunForm() {
  const [state, formAction, pending] = useActionState(submitTailoringRun, initialState);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [hydrated, setHydrated] = useState(false);

  // Restore the saved draft from localStorage on mount (client only).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unavailable during SSR, so hydrate after mount.
    setDraft(loadDraft());
    setHydrated(true);
  }, []);

  // Persist the draft as the user edits the text inputs.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore quota / unavailable storage
    }
  }, [draft, hydrated]);

  // Clear the saved draft once a run is successfully submitted.
  useEffect(() => {
    if (!hydrated || !state.runId) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the controlled form after a successful submit.
    setDraft(DEFAULT_DRAFT);
  }, [state.runId, hydrated]);

  return (
    <>
      <form action={formAction}>
        <p>
          <input name="resume_file" type="file" required />
        </p>
        <p>
          <textarea
            name="job_posting_text"
            placeholder="Paste job posting"
            rows={10}
            cols={80}
            required
            value={draft.jobPostingText}
            onChange={(event) => setDraft((prev) => ({ ...prev, jobPostingText: event.target.value }))}
          />
        </p>
        <p>
          <select
            name="aggressiveness"
            value={draft.aggressiveness}
            onChange={(event) => setDraft((prev) => ({ ...prev, aggressiveness: event.target.value }))}
          >
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
