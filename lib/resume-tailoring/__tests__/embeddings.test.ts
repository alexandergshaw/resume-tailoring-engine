import { afterEach, describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  getEmbedder,
  setEmbedderForTesting,
  type Embedder,
} from '@/lib/resume-tailoring/embeddings';

afterEach(() => {
  setEmbedderForTesting(null);
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors and 0 for orthogonal ones', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns 0 for empty or mismatched-length vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });
});

describe('getEmbedder injection', () => {
  it('returns the injected embedder', async () => {
    const stub: Embedder = async (texts) => texts.map(() => [1, 0]);
    setEmbedderForTesting(stub);
    const embedder = await getEmbedder();
    expect(embedder).toBe(stub);
    expect(await embedder!(['a'])).toEqual([[1, 0]]);
  });

  it('returns null when forced to the fallback path', async () => {
    setEmbedderForTesting(null);
    expect(await getEmbedder()).toBeNull();
  });
});
