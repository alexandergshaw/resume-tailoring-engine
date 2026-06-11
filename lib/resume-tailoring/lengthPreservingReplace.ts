/**
 * Length-/line-locked replacement generator for the "top" level.
 *
 * For each replaceable region, selects the most relevant posting term and emits
 * a replacement that EXACTLY matches the original region's character count and
 * line-break count, so the document's visual footprint cannot shift. If no
 * readable candidate can satisfy the lock, the region is skipped (original
 * preserved) — the lock is never broken.
 *
 * Candidate relevance uses MiniLM similarity when available, falling back to
 * literal content-word overlap. An optional grounding guard restricts
 * candidates to terms the resume already supports, preventing fabricated titles
 * or skills. Never throws; degrades to deterministic behavior offline.
 */
import { cosineSimilarity, getEmbedder, type Embedder } from './embeddings';
import { isProtected } from './claimExpansion';
import type { RegionKind, ReplaceableRegion } from './identifyReplaceableRegions';

export type Replacement = {
  region: ReplaceableRegion;
  newText: string;
  lockHeld: true;
};

export type ReplacementCandidates = {
  // Candidate terms for job-title regions (posting titleKeywords / title phrases).
  jobTitles: string[];
  // Candidate terms for skill_item / skill_category_label regions.
  skills: string[];
};

export async function generateReplacements(params: {
  regions: ReplaceableRegion[];
  candidates: ReplacementCandidates;
  // Lower-cased terms the resume semantically supports. Used as the allow-list
  // when `groundedOnly` is true.
  groundedTerms: Set<string>;
  groundedOnly: boolean;
  embedderOverride?: Embedder | null;
}): Promise<Replacement[]> {
  const { regions, candidates, groundedTerms, groundedOnly } = params;
  if (regions.length === 0) return [];

  const embedder = params.embedderOverride !== undefined ? params.embedderOverride : await getEmbedder();
  const results: Replacement[] = [];

  for (const region of regions) {
    const pool = candidatePool(region.kind, candidates)
      .filter((candidate) => candidate.trim().length > 0)
      .filter((candidate) => candidate.toLowerCase() !== region.originalText.toLowerCase())
      .filter((candidate) => !isProtected(candidate))
      .filter((candidate) => (groundedOnly ? groundedTerms.has(candidate.toLowerCase()) : true));

    if (pool.length === 0) continue;

    const ranked = await rankByRelevance(region.originalText, pool, embedder);

    // Walk candidates best-first; take the first that fits the layout lock.
    let applied: string | null = null;
    for (const candidate of ranked) {
      const fitted = fitToLock(candidate, region.charCount, region.lineCount);
      if (fitted !== null && fitted.toLowerCase() !== region.originalText.toLowerCase() && !isProtected(fitted)) {
        applied = fitted;
        break;
      }
    }

    if (applied !== null) {
      results.push({ region, newText: applied, lockHeld: true });
    }
  }

  return results;
}

function candidatePool(kind: RegionKind, candidates: ReplacementCandidates): string[] {
  if (kind === 'job_title') return candidates.jobTitles;
  return candidates.skills;
}

async function rankByRelevance(
  reference: string,
  pool: string[],
  embedder: Embedder | null,
): Promise<string[]> {
  if (embedder) {
    try {
      const vectors = await embedder([reference, ...pool]);
      const refVec = vectors[0];
      return pool
        .map((candidate, index) => ({ candidate, sim: cosineSimilarity(refVec, vectors[index + 1]) }))
        .sort((a, b) => b.sim - a.sim)
        .map((entry) => entry.candidate);
    } catch {
      // fall through to overlap ranking
    }
  }

  const refWords = new Set(contentWords(reference));
  return pool
    .map((candidate) => ({
      candidate,
      overlap: contentWords(candidate).filter((word) => refWords.has(word)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap)
    .map((entry) => entry.candidate);
}

/**
 * Returns a version of `candidate` whose character count === targetChars and
 * whose line count === targetLines, or null if no readable fit exists.
 */
export function fitToLock(candidate: string, targetChars: number, targetLines: number): string | null {
  // Single-line regions are the common case; multi-line locks require the
  // candidate to already carry the same number of breaks, which posting terms
  // never do, so only single-line locks are satisfiable here.
  if (targetLines !== 1) return null;
  if (/\n/.test(candidate)) return null;

  const text = candidate.trim();
  if (text.length === targetChars) return text;

  if (text.length < targetChars) {
    // Pad with trailing spaces to hit the exact width.
    return text + ' '.repeat(targetChars - text.length);
  }

  // Too long: truncate at a word boundary, then pad to the exact width.
  const truncated = truncateAtWord(text, targetChars);
  if (truncated === null) return null;
  // Require the kept text to remain readable (at least half the slot, ≥3 chars).
  if (truncated.length < Math.max(3, Math.ceil(targetChars / 2))) return null;
  return truncated + ' '.repeat(targetChars - truncated.length);
}

function truncateAtWord(text: string, maxChars: number): string | null {
  if (maxChars <= 0) return null;
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > 0) return slice.slice(0, lastSpace).trimEnd();
  // No word boundary; a hard cut would be unreadable.
  return null;
}

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'of', 'to', 'in', 'on', 'a', 'an']);

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/**
 * Applies sub-span replacements to a single paragraph's text, preserving the
 * overall character count and line breaks. Replacements are applied right-to-
 * left so earlier offsets stay valid. Each replacement's newText must already
 * match its span length (guaranteed by fitToLock for whole-line regions; for
 * sub-spans the caller passes span-length-matched text).
 */
export function applyReplacementsToText(
  original: string,
  spans: Array<{ start: number; end: number; newText: string }>,
): string {
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let text = original;
  for (const span of ordered) {
    if (span.start < 0 || span.end > text.length || span.start >= span.end) continue;
    text = text.slice(0, span.start) + span.newText + text.slice(span.end);
  }
  return text;
}
