/**
 * Job-posting term miner (no LLM, local, deterministic-by-default).
 *
 * The legacy extraction relied on a tiny literal skill taxonomy and a hardcoded
 * list of ~4 title words, so multi-word buzzwords ("event-driven architecture",
 * "CI/CD", "stakeholder management") were invisible and could never be woven
 * into a resume. This miner casts a far wider net:
 *
 *   1. wink-nlp noun-phrase chunking captures multi-word domain phrases.
 *   2. A regex pass captures tech tokens/acronyms (CI/CD, REST, gRPC, k8s) that
 *      survive tokenization poorly.
 *   3. Phrases are weighted by which posting section they appear in (required >
 *      preferred > responsibility > body), frequency, length, and acronym/caps
 *      signal.
 *   4. MiniLM embeddings merge semantically duplicate phrases; a boilerplate
 *      stoplist drops fluff ("team player", "fast-paced").
 *
 * Graceful degradation: when the NLP/embedding models are unavailable, a
 * deterministic regex + frequency miner runs instead, so behavior degrades
 * rather than breaking. Pass `embedderOverride` (incl. null) in tests.
 */
import { cosineSimilarity, getEmbedder, type Embedder } from './embeddings';
import { ensureNlpLoaded, nounPhrases } from './nlp';

export type KeyPhraseSource = 'required' | 'preferred' | 'responsibility' | 'body';

export type KeyPhrase = {
  text: string;
  weight: number;
  source: KeyPhraseSource;
};

const SOURCE_WEIGHT: Record<KeyPhraseSource, number> = {
  required: 3,
  preferred: 2,
  responsibility: 1.5,
  body: 1,
};

// Generic resume/job fluff that should never be treated as a differentiating
// buzzword. Compared against the normalized (lower-cased) phrase.
const BOILERPLATE = new Set([
  'team player', 'fast-paced', 'fast paced', 'communication skills', 'hard worker',
  'self starter', 'self-starter', 'detail oriented', 'detail-oriented', 'team', 'teams',
  'work', 'experience', 'years', 'ability', 'responsibilities', 'requirements',
  'role', 'company', 'opportunity', 'candidate', 'candidates', 'job', 'position',
  'environment', 'culture', 'benefits', 'skills', 'plus', 'etc',
]);

// Tech tokens / acronyms that tokenizers tend to split or lower-signal POS
// taggers miss. Matched directly against the raw posting text.
const TECH_TOKEN_REGEX =
  /\b(?:ci\/cd|cd\/ci|[A-Z]{2,5}(?:\/[A-Z]{2,5})?|k8s|gRPC|RESTful|micro-?services?|node\.js|next\.js|c\+\+|c#|\.net)\b/g;

const SIMILARITY_MERGE_THRESHOLD = 0.85;

export async function extractKeyPhrases(
  jobPostingText: string,
  embedderOverride?: Embedder | null,
): Promise<KeyPhrase[]> {
  await ensureNlpLoaded();
  const segments = segmentPosting(jobPostingText);

  // Accumulate normalized phrase -> { weightSum, bestSource, displayText }.
  const accumulator = new Map<
    string,
    { weight: number; source: KeyPhraseSource; display: string; count: number }
  >();

  for (const { text, source } of segments) {
    const candidates = mineCandidates(text);
    for (const raw of candidates) {
      const normalized = normalizePhrase(raw);
      if (!isUsefulPhrase(normalized)) continue;
      const lengthBonus = Math.min(wordCount(normalized), 3) * 0.5; // favor 2-3 word phrases
      const acronymBonus = /[A-Z]{2,}|\//.test(raw) ? 1 : 0;
      const increment = SOURCE_WEIGHT[source] + lengthBonus + acronymBonus;

      const existing = accumulator.get(normalized);
      if (existing) {
        existing.weight += increment;
        existing.count += 1;
        if (SOURCE_WEIGHT[source] > SOURCE_WEIGHT[existing.source]) existing.source = source;
      } else {
        accumulator.set(normalized, { weight: increment, source, display: cleanDisplay(raw), count: 1 });
      }
    }
  }

  let phrases: KeyPhrase[] = [...accumulator.entries()].map(([normalized, value]) => ({
    text: value.display || normalized,
    weight: value.weight,
    source: value.source,
  }));

  phrases = await mergeSemanticDuplicates(phrases, embedderOverride);
  phrases.sort((a, b) => b.weight - a.weight);
  return phrases;
}

type Segment = { text: string; source: KeyPhraseSource };

const REQUIRED_HINT = /(required|must have|minimum qualifications|qualifications)/i;
const PREFERRED_HINT = /(preferred|nice to have|bonus|plus)/i;
const RESPONSIBILITY_HINT = /(responsibilities|you will|what you'll do|what you will do|day to day)/i;

// Splits the posting into weighted segments by the heading that most recently
// applied to each line, so required-section phrases outrank body phrases.
function segmentPosting(text: string): Segment[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const segments: Segment[] = [];
  let current: KeyPhraseSource = 'body';

  for (const line of lines) {
    if (REQUIRED_HINT.test(line)) current = 'required';
    else if (PREFERRED_HINT.test(line)) current = 'preferred';
    else if (RESPONSIBILITY_HINT.test(line)) current = 'responsibility';
    segments.push({ text: line, source: current });
  }

  return segments;
}

// Mines candidate phrases from a chunk: noun phrases (model) or a frequency
// n-gram fallback, plus tech tokens (always, regardless of model).
function mineCandidates(text: string): string[] {
  const candidates: string[] = [];

  const phrases = nounPhrases(text);
  if (phrases.length > 0) {
    candidates.push(...phrases);
  } else {
    candidates.push(...fallbackNgrams(text));
  }

  const techMatches = text.match(TECH_TOKEN_REGEX);
  if (techMatches) candidates.push(...techMatches);

  return candidates;
}

// Deterministic fallback when the NLP model is unavailable: unigrams + bigrams
// formed only from runs of consecutive content words. Runs are broken at clause
// punctuation and stopwords so unrelated comma-separated terms ("React, Kafka")
// never fuse into a spurious phrase.
function fallbackNgrams(text: string): string[] {
  const grams: string[] = [];
  const segments = text.toLowerCase().split(/[,;.\n|]+/);

  for (const segment of segments) {
    const words = segment.split(/[^a-z0-9+#-]+/).filter(Boolean);
    let run: string[] = [];
    const flush = () => {
      for (const word of run) {
        if (word.length > 2) grams.push(word);
      }
      for (let i = 0; i < run.length - 1; i += 1) {
        grams.push(`${run[i]} ${run[i + 1]}`);
      }
      run = [];
    };
    for (const word of words) {
      if (word.length <= 2 || STOPWORDS.has(word)) {
        flush();
      } else {
        run.push(word);
      }
    }
    flush();
  }

  return grams;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'our', 'are', 'will', 'have', 'has', 'this',
  'that', 'from', 'your', 'who', 'all', 'any', 'can', 'into', 'out', 'per', 'via',
  'including', 'such', 'across', 'using', 'able', 'must', 'should', 'their', 'them',
  'required', 'preferred', 'responsibilities', 'qualifications', 'requirements',
]);

async function mergeSemanticDuplicates(
  phrases: KeyPhrase[],
  embedderOverride?: Embedder | null,
): Promise<KeyPhrase[]> {
  if (phrases.length < 2) return phrases;
  const embedder = embedderOverride !== undefined ? embedderOverride : await getEmbedder();
  if (!embedder) return phrases;

  let vectors: number[][];
  try {
    vectors = await embedder(phrases.map((phrase) => phrase.text));
  } catch {
    return phrases;
  }

  const merged: KeyPhrase[] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < phrases.length; i += 1) {
    if (consumed.has(i)) continue;
    let kept = phrases[i];
    for (let j = i + 1; j < phrases.length; j += 1) {
      if (consumed.has(j)) continue;
      if (cosineSimilarity(vectors[i], vectors[j]) >= SIMILARITY_MERGE_THRESHOLD) {
        consumed.add(j);
        // Keep the higher-weight phrase as canonical; sum the weights.
        const summedWeight = kept.weight + phrases[j].weight;
        kept = (kept.weight >= phrases[j].weight ? kept : phrases[j]);
        kept = { ...kept, weight: summedWeight };
      }
    }
    merged.push(kept);
  }
  return merged;
}

function normalizePhrase(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/^(a|an|the|our|your|their)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Strip a single trailing plural "s" (but keep "ss" like "access").
  return base.replace(/([a-z])s$/i, (m, c) => (base.endsWith('ss') ? m : c));
}

function cleanDisplay(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function isUsefulPhrase(normalized: string): boolean {
  if (!normalized) return false;
  if (BOILERPLATE.has(normalized)) return false;
  const words = wordCount(normalized);
  if (words > 4) return false; // overly long chunks aren't reusable buzzwords
  if (words === 1 && normalized.length < 3) return false;
  if (/^\d+$/.test(normalized)) return false;
  return true;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
