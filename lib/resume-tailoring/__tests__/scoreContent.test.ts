import { describe, expect, it } from 'vitest';
import { scoreContent } from '@/lib/resume-tailoring/scoreContent';
import type { Embedder } from '@/lib/resume-tailoring/embeddings';
import type { ParsedJob } from '@/lib/resume-tailoring/types';

const job: ParsedJob = {
  requiredSkills: ['React'],
  preferredSkills: [],
  tools: [],
  domainKeywords: [],
  titleKeywords: [],
  responsibilities: [],
  seniority: 'unknown',
};

describe('scoreContent', () => {
  it('prioritizes required skills and penalizes duplicates (keyword-only fallback)', async () => {
    // Force the null embedder so behavior is the deterministic keyword-only path.
    const scored = await scoreContent(
      [
        { text: 'Built React dashboard', section: 'experience', detectedSkills: ['React'] },
        { text: 'Built React dashboard', section: 'projects', detectedSkills: ['React'] },
      ],
      job,
      null,
    );

    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });

  it('uses semantic similarity so a keyword-free bullet can match a requirement', async () => {
    // Stub embedder returning canned vectors. The "pipelines" bullet shares no
    // keyword with the "React" requirement, but the stub makes it
    // embedding-identical to the requirement while the unrelated bullet is
    // orthogonal. This proves semantic matching changes targeting.
    const vectorFor = (text: string): number[] => {
      const lower = text.toLowerCase();
      if (lower.includes('react') || lower.includes('pipeline')) return [1, 0];
      return [0, 1];
    };
    const stubEmbedder: Embedder = async (texts) => texts.map(vectorFor);

    const scored = await scoreContent(
      [
        { text: 'Orchestrated CI/CD pipelines', section: 'experience', detectedSkills: [] },
        { text: 'Organized team offsite events', section: 'experience', detectedSkills: [] },
      ],
      job,
      stubEmbedder,
    );

    const pipeline = scored.find((bullet) => bullet.text.includes('pipelines'));
    const offsite = scored.find((bullet) => bullet.text.includes('offsite'));
    expect(pipeline?.reasons).toContain('semantic_match');
    expect(offsite?.reasons).not.toContain('semantic_match');
    expect(pipeline!.score).toBeGreaterThan(offsite!.score);
  });
});
