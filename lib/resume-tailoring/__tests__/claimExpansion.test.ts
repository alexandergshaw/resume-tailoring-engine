import { describe, expect, it } from 'vitest';
import { claimExpansion } from '@/lib/resume-tailoring/claimExpansion';
import type { ScoredBullet } from '@/lib/resume-tailoring/types';

function bullet(text: string): ScoredBullet {
  return { text, section: 'experience', detectedSkills: [], score: 5, reasons: [] };
}

describe('claimExpansion protected categories', () => {
  const protectedBullets: Array<[string, string]> = [
    ['compensation', 'Developer earning $120,000 salary'],
    ['location', 'Developer based in Austin, TX'],
    ['metrics', 'Developer who built systems for 5000 users'],
    ['work authorization', 'Developer with H-1B visa sponsorship'],
    ['publications', 'Developer with a published journal paper'],
    ['awards', 'Developer who received an award'],
    ['employer', 'Developer at Example Inc'],
    ['credential', 'Developer with a B.S. degree'],
  ];

  for (const [category, text] of protectedBullets) {
    it(`never alters bullets containing ${category}`, () => {
      const { bullets, expansions } = claimExpansion({ bullets: [bullet(text)], jobText: 'Required: Kafka' });
      expect(bullets[0].text).toBe(text);
      expect(expansions).toHaveLength(0);
    });
  }

  it('expands unprotected bullets and records the expansion', () => {
    const { bullets, expansions } = claimExpansion({
      bullets: [bullet('Built services as a developer')],
      jobText: 'Required: Kafka',
    });

    expect(bullets[0].text).not.toBe('Built services as a developer');
    expect(expansions.length).toBeGreaterThan(0);
    expect(expansions[0]).toHaveProperty('claim_type');
    expect(expansions[0]).toHaveProperty('original_text');
    expect(expansions[0]).toHaveProperty('expanded_text');
    expect(expansions[0]).toHaveProperty('basis');
  });
});
