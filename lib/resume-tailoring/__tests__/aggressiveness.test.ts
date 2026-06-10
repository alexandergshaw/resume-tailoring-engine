import { describe, expect, it } from 'vitest';
import { AGGRESSIVENESS_CONFIG } from '@/lib/resume-tailoring/aggressiveness';
import { applyAggressiveness, tailorResume } from '@/lib/resume-tailoring/tailorResume';

const bullets = [
  { text: 'Low relevance', section: 'projects', detectedSkills: [], score: 0, reasons: [] },
  { text: 'High relevance React', section: 'experience', detectedSkills: ['React'], score: 8, reasons: [] },
  { text: 'Medium relevance', section: 'experience', detectedSkills: [], score: 3, reasons: [] },
];

describe('aggressiveness behavior', () => {
  it('conservative preserves bullet order', () => {
    const selected = applyAggressiveness(bullets, AGGRESSIVENESS_CONFIG.conservative);
    expect(selected[0].text).toBe('Low relevance');
  });

  it('balanced reorders and trims low scoring bullets', () => {
    const selected = applyAggressiveness(bullets, AGGRESSIVENESS_CONFIG.balanced);
    expect(selected[0].text).toBe('High relevance React');
    expect(selected.find((item) => item.text === 'Low relevance')).toBeUndefined();
  });

  it('aggressive maximizes relevance', () => {
    const selected = applyAggressiveness(bullets, AGGRESSIVENESS_CONFIG.aggressive);
    expect(selected.every((item) => item.score >= 2)).toBe(true);
  });

  it('max without trust behaves like aggressive for selections', async () => {
    const resume = Buffer.from(`Experience\n- Built React components\nProjects\n- Built internal tool`);
    const job = 'Required: React, Kafka';
    const aggressive = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: job, aggressiveness: 'aggressive' });
    const maxNoTrust = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: job, aggressiveness: 'max', trustedClaimExpansion: false });

    expect(maxNoTrust.selectedBullets.map((b) => b.text)).toEqual(aggressive.selectedBullets.map((b) => b.text));
    expect(maxNoTrust.report.expanded_claims).toHaveLength(0);
  });

  it('max with trusted claim expansion inserts allowed expansions and records them', async () => {
    const resume = Buffer.from(`Experience\n- Built React components as a developer`);
    const result = await tailorResume({
      resumeBuffer: resume,
      resumeFilename: 'resume.txt',
      jobPostingText: 'Required: React, Kafka',
      aggressiveness: 'max',
      trustedClaimExpansion: true,
    });

    expect(result.report.expanded_claims.length).toBeGreaterThan(0);
    expect(result.selectedBullets.some((bullet) => bullet.text.includes('Apache Kafka'))).toBe(true);
  });

  it('protected categories are never altered', async () => {
    const resume = Buffer.from(`Experience\n- Developer at Example Inc in 2022`);
    const result = await tailorResume({
      resumeBuffer: resume,
      resumeFilename: 'resume.txt',
      jobPostingText: 'Required: React',
      aggressiveness: 'max',
      trustedClaimExpansion: true,
    });

    expect(result.selectedBullets[0].text).toContain('Example Inc');
    expect(result.selectedBullets[0].text).toContain('2022');
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
