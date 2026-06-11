import { describe, expect, it } from 'vitest';
import { tailorResume } from '@/lib/resume-tailoring/tailorResume';

// End-to-end on the deterministic (model-null) fallback path enforced by the
// shared test setup: a multi-word posting phrase that the resume supports but
// does not literally state is woven into the most-related bullet, while a
// genuine quantified-result bullet is left untouched and the report surfaces
// detected/integrated/gap phrases.
describe('tailorResume key-phrase integration (E2E, fallback path)', () => {
  it('integrates a supported posting phrase and reports phrase intelligence', async () => {
    const resume = Buffer.from(
      [
        'Experience',
        '- Monitored production tooling across services',
        '- Increased uptime to 99.9% during 2023 migration',
      ].join('\n'),
    );

    const result = await tailorResume({
      resumeBuffer: resume,
      resumeFilename: 'resume.txt',
      jobPostingText: [
        'Required: observability tooling and distributed systems',
        'Responsibilities: improve mainframe cobol batch jobs',
      ].join('\n'),
      aggressiveness: 'max',
    });

    const combined = result.selectedBullets.map((b) => b.text).join(' ');

    // The supported multi-word phrase is woven into the related (tooling) bullet.
    expect(combined).toContain('observability tooling');

    // The quantified-result bullet is preserved verbatim.
    expect(
      result.selectedBullets.some((b) => b.text === 'Increased uptime to 99.9% during 2023 migration'),
    ).toBe(true);

    // Report exposes phrase intelligence, including honest gaps (cobol is
    // unsupported by this resume and must never be fabricated into a bullet).
    expect(result.report.key_phrases).toBeDefined();
    expect(result.report.key_phrases!.detected.length).toBeGreaterThan(0);
    expect(result.report.key_phrases!.integrated).toContain('observability tooling');
    expect(combined.toLowerCase()).not.toContain('cobol');
  });
});
