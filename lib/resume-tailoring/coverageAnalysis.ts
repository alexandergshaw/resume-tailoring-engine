/**
 * Coverage gap analysis (semantic, not literal).
 *
 * For each ranked posting phrase, decides whether the resume already expresses
 * it, could legitimately express it, or has no basis for it at all. This is the
 * anti-fabrication gate AND the integration planner:
 *
 *   - alreadyCovered:        the resume literally or semantically states it →
 *                            never keyword-stuff it again.
 *   - missingButSupported:   not present, but a related capability is → safe to
 *                            weave into the most-related bullet.
 *   - missingAndUnsupported: no basis anywhere → NEVER inject; report as a gap.
 *
 * Semantic similarity uses the shared MiniLM embedder. When embeddings are
 * unavailable, a deterministic content-word overlap heuristic is used so the
 * feature degrades safely (unverifiable phrases default to unsupported — we
 * never fabricate). Pass `embedderOverride` (incl. null) in tests.
 */
import { cosineSimilarity, getEmbedder, type Embedder } from './embeddings';
import type { KeyPhrase } from './extractKeyPhrases';
import type { ResumeBullet } from './types';

export type PhraseTarget = KeyPhrase & { targetBulletIndex: number };

export type Coverage = {
  alreadyCovered: KeyPhrase[];
  missingButSupported: PhraseTarget[];
  missingAndUnsupported: KeyPhrase[];
};

// Resume bullet is considered to already express the phrase at/above this
// similarity; related-but-not-stated sits in the support band below it.
const COVERED_THRESHOLD = 0.7;
const SUPPORT_THRESHOLD = 0.45;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'our', 'are', 'will', 'have', 'has', 'this',
  'that', 'from', 'your', 'using', 'into', 'per', 'via', 'a', 'an', 'of', 'to', 'in', 'on',
]);

export async function analyzeCoverage(
  phrases: KeyPhrase[],
  bullets: ResumeBullet[],
  resumeText: string,
  embedderOverride?: Embedder | null,
): Promise<Coverage> {
  const coverage: Coverage = { alreadyCovered: [], missingButSupported: [], missingAndUnsupported: [] };
  if (phrases.length === 0) return coverage;

  const lowerResume = resumeText.toLowerCase();
  const embedder = embedderOverride !== undefined ? embedderOverride : await getEmbedder();

  let phraseVectors: number[][] | null = null;
  let bulletVectors: number[][] | null = null;
  if (embedder && bullets.length > 0) {
    try {
      phraseVectors = await embedder(phrases.map((phrase) => phrase.text));
      bulletVectors = await embedder(bullets.map((bullet) => bullet.text));
    } catch {
      phraseVectors = null;
      bulletVectors = null;
    }
  }

  phrases.forEach((phrase, index) => {
    // Literal presence always counts as covered.
    if (lowerResume.includes(phrase.text.toLowerCase())) {
      coverage.alreadyCovered.push(phrase);
      return;
    }

    if (phraseVectors && bulletVectors && bullets.length > 0) {
      let bestIndex = -1;
      let bestSim = -1;
      for (let b = 0; b < bulletVectors.length; b += 1) {
        const sim = cosineSimilarity(phraseVectors[index], bulletVectors[b]);
        if (sim > bestSim) {
          bestSim = sim;
          bestIndex = b;
        }
      }
      if (bestSim >= COVERED_THRESHOLD) {
        coverage.alreadyCovered.push(phrase);
      } else if (bestSim >= SUPPORT_THRESHOLD) {
        coverage.missingButSupported.push({ ...phrase, targetBulletIndex: bestIndex });
      } else {
        coverage.missingAndUnsupported.push(phrase);
      }
      return;
    }

    // Deterministic fallback: content-word overlap with a bullet → supported.
    const target = bestOverlapBullet(phrase.text, bullets);
    if (target >= 0) {
      coverage.missingButSupported.push({ ...phrase, targetBulletIndex: target });
    } else {
      coverage.missingAndUnsupported.push(phrase);
    }
  });

  return coverage;
}

function bestOverlapBullet(phrase: string, bullets: ResumeBullet[]): number {
  const phraseWords = contentWords(phrase);
  if (phraseWords.length === 0) return -1;
  let bestIndex = -1;
  let bestOverlap = 0;
  bullets.forEach((bullet, index) => {
    const bulletWords = new Set(contentWords(bullet.text));
    const overlap = phraseWords.filter((word) => bulletWords.has(word)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestIndex = index;
    }
  });
  return bestOverlap > 0 ? bestIndex : -1;
}

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}
