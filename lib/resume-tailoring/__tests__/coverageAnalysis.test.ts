import { describe, expect, it } from 'vitest';
import { analyzeCoverage } from '@/lib/resume-tailoring/coverageAnalysis';
import type { Embedder } from '@/lib/resume-tailoring/embeddings';
import type { KeyPhrase } from '@/lib/resume-tailoring/extractKeyPhrases';
import type { ResumeBullet } from '@/lib/resume-tailoring/types';

const phrases: KeyPhrase[] = [
  { text: 'frontend frameworks', weight: 4, source: 'required' },
  { text: 'kubernetes orchestration', weight: 3, source: 'preferred' },
  { text: 'underwater basket weaving', weight: 1, source: 'body' },
];

const bullets: ResumeBullet[] = [{ text: 'Built React dashboards', section: 'experience', detectedSkills: [] }];

describe('analyzeCoverage (semantic, stubbed embedder)', () => {
  it('classifies covered, supported, and unsupported phrases', async () => {
    // Canned 2D unit vectors: identical → covered; 60° (~cos 0.5) → supported;
    // orthogonal → unsupported.
    const vectorFor = (text: string): number[] => {
      const lower = text.toLowerCase();
      if (lower.includes('react') || lower === 'frontend frameworks') return [1, 0];
      if (lower === 'kubernetes orchestration') return [0.5, Math.sqrt(3) / 2];
      return [0, 1];
    };
    const stubEmbedder: Embedder = async (texts) => texts.map(vectorFor);

    const coverage = await analyzeCoverage(phrases, bullets, 'Built React dashboards', stubEmbedder);

    expect(coverage.alreadyCovered.map((p) => p.text)).toContain('frontend frameworks');
    expect(coverage.missingButSupported.map((p) => p.text)).toContain('kubernetes orchestration');
    expect(coverage.missingButSupported[0].targetBulletIndex).toBe(0);
    expect(coverage.missingAndUnsupported.map((p) => p.text)).toContain('underwater basket weaving');
  });
});

describe('analyzeCoverage (embedder unavailable — overlap fallback)', () => {
  it('supports phrases sharing a content word and rejects unrelated ones', async () => {
    const coverage = await analyzeCoverage(
      [
        { text: 'react tooling', weight: 3, source: 'required' },
        { text: 'mainframe cobol', weight: 2, source: 'preferred' },
      ],
      bullets,
      'Built React dashboards',
      null,
    );

    expect(coverage.missingButSupported.map((p) => p.text)).toContain('react tooling');
    expect(coverage.missingAndUnsupported.map((p) => p.text)).toContain('mainframe cobol');
  });
});
