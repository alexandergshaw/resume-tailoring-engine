import { describe, expect, it } from 'vitest';
import { tailorResume } from '@/lib/resume-tailoring/tailorResume';

describe('additive tailoring behavior', () => {
  it('keeps every bullet — nothing is removed or reordered, even at max', async () => {
    const resume = Buffer.from(
      `Experience\n- Worked on low relevance internal tool\n- Created React components\n- Maintained legacy scripts`,
    );
    const result = await tailorResume({
      resumeBuffer: resume,
      resumeFilename: 'resume.txt',
      jobPostingText: 'Required: React',
      aggressiveness: 'max',
    });

    expect(result.rejectedBullets).toHaveLength(0);
    expect(result.selectedBullets).toHaveLength(3);
    // Original order preserved (first source bullet stays first).
    expect(result.selectedBullets[0].text).toContain('internal tool');
    expect(result.report.section_decisions.sections).toContain('no content removed');
  });

  it('inserts missing job keywords into existing bullets', async () => {
    const resume = Buffer.from(`Experience\n- Created React components for the web app`);
    const result = await tailorResume({
      resumeBuffer: resume,
      resumeFilename: 'resume.txt',
      jobPostingText: 'Required: React, Kafka',
      aggressiveness: 'max',
    });

    const combined = result.selectedBullets.map((bullet) => bullet.text).join(' ');
    expect(combined).toContain('Kafka');
    expect(result.report.expanded_claims.length).toBeGreaterThan(0);
  });

  it('appends supported posting skills to the matched skills without dropping any', async () => {
    const resume = Buffer.from(`Skills\nReact\nExperience\n- Maintained AWS infrastructure and React apps`);
    const result = await tailorResume({
      resumeBuffer: resume,
      resumeFilename: 'resume.txt',
      jobPostingText: 'Required: React, AWS',
      aggressiveness: 'balanced',
    });

    expect(result.report.matched_skills).toContain('React');
    expect(result.report.matched_skills).toContain('AWS');
  });

  it('never alters protected lines (dates, money, metrics, employers)', async () => {
    const resume = Buffer.from(`Experience\n- Developer at Example Inc in 2022 earning $120,000`);
    const result = await tailorResume({
      resumeBuffer: resume,
      resumeFilename: 'resume.txt',
      jobPostingText: 'Required: React, Kafka',
      aggressiveness: 'max',
    });

    const text = result.selectedBullets[0].text;
    expect(text).toContain('Example Inc');
    expect(text).toContain('2022');
    expect(text).toContain('$120,000');
    expect(text).not.toContain('Kafka');
  });

  it('conservative only substitutes terminology, no keyword insertion', async () => {
    const resume = Buffer.from(`Experience\n- Worked as a developer on web tooling`);
    const result = await tailorResume({
      resumeBuffer: resume,
      resumeFilename: 'resume.txt',
      jobPostingText: 'Required: Kafka',
      aggressiveness: 'conservative',
    });

    const text = result.selectedBullets[0].text;
    expect(text).toContain('software engineer');
    expect(text).not.toContain('leveraging');
  });

  it('calculates score from required skill matches only', async () => {
    const resume = Buffer.from(`Experience\n- Built React and Kafka services with Python automations`);
    const result = await tailorResume({
      resumeBuffer: resume,
      resumeFilename: 'resume.txt',
      jobPostingText: 'Required: React',
      aggressiveness: 'balanced',
    });

    expect(result.matchScore).toBe(100);
  });
});
