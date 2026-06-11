/**
 * POS / phrase-aware rewriting utility (no LLM, deterministic, local).
 *
 * Wraps wink-nlp with the lite English model to give structure-aware edits:
 * detecting the main verb and noun phrases so keyword insertion is grammatical
 * (a proper modifier) and weak verbs can be strengthened to the posting's
 * terminology — instead of blindly appending "; leveraging X".
 *
 * Graceful degradation: if the model can't load, helpers return the input
 * unchanged so enrichment falls back to today's string behavior. Mirrors the
 * embeddings/Supabase null-fallback pattern. The model loads lazily via
 * `ensureNlpLoaded()` (call once before a batch of edits); the per-sentence
 * helpers then read the cached instance synchronously.
 */

type WinkDoc = {
  tokens(): {
    out(its?: unknown): string[];
  };
};

export type WinkNlp = {
  readDoc(text: string): WinkDoc;
  its: { pos: unknown };
};

// `undefined` = not yet loaded; `null` = load attempted and unavailable.
let nlpInstance: WinkNlp | null | undefined;
let injectedNlp: WinkNlp | null | undefined;

// Weak, low-signal leading verbs worth strengthening when the posting offers a
// stronger equivalent.
const WEAK_VERBS = new Set(['made', 'did', 'worked', 'helped', 'handled', 'used', 'got', 'put']);

/** Test seam: force an nlp instance (or null to force the fallback path). */
export function setNlpForTesting(instance: WinkNlp | null | undefined): void {
  injectedNlp = instance;
  nlpInstance = undefined;
}

/** Lazily loads (and caches) the wink-nlp model. Safe to call repeatedly. */
export async function ensureNlpLoaded(): Promise<void> {
  if (injectedNlp !== undefined || nlpInstance !== undefined) return;
  try {
    const winkModule = await import('wink-nlp');
    const modelModule = await import('wink-eng-lite-web-model');
    const winkNLP = (winkModule.default ?? winkModule) as (model: unknown) => WinkNlp;
    const model = (modelModule.default ?? modelModule) as unknown;
    nlpInstance = winkNLP(model);
  } catch (error) {
    console.error('wink-nlp model unavailable; falling back to plain text edits.', error);
    nlpInstance = null;
  }
}

function getNlp(): WinkNlp | null {
  if (injectedNlp !== undefined) return injectedNlp;
  return nlpInstance ?? null;
}

/** Returns the lower-cased leading verb of a sentence, or null. */
export function leadingVerb(sentence: string): string | null {
  const nlp = getNlp();
  if (!nlp) return null;
  try {
    const doc = nlp.readDoc(sentence);
    const tokens = doc.tokens().out();
    const tags = doc.tokens().out(nlp.its.pos);
    for (let i = 0; i < tags.length; i += 1) {
      if (tags[i] === 'VERB') return tokens[i].toLowerCase();
    }
  } catch {
    return null;
  }
  return null;
}

/** Lower-cased noun-like tokens, used to place keywords near related nouns. */
export function nounTokens(sentence: string): string[] {
  const nlp = getNlp();
  if (!nlp) return [];
  try {
    const doc = nlp.readDoc(sentence);
    const tokens = doc.tokens().out();
    const tags = doc.tokens().out(nlp.its.pos);
    const nouns: string[] = [];
    for (let i = 0; i < tags.length; i += 1) {
      if (tags[i] === 'NOUN' || tags[i] === 'PROPN') nouns.push(tokens[i].toLowerCase());
    }
    return nouns;
  } catch {
    return [];
  }
}

/**
 * Approximate noun-phrase chunking: returns runs of adjective/noun/proper-noun
 * tokens (e.g. "event-driven architecture", "distributed systems"). The lite
 * model has no dedicated chunker, so we group consecutive ADJ|NOUN|PROPN tags.
 * Returns lower-cased phrases. Empty array when the model is unavailable so
 * callers can fall back to a deterministic miner.
 */
export function nounPhrases(text: string): string[] {
  const nlp = getNlp();
  if (!nlp) return [];
  try {
    const doc = nlp.readDoc(text);
    const tokens = doc.tokens().out();
    const tags = doc.tokens().out(nlp.its.pos);
    const phrases: string[] = [];
    let current: string[] = [];
    const flush = () => {
      if (current.length > 0) {
        phrases.push(current.join(' ').toLowerCase());
        current = [];
      }
    };
    for (let i = 0; i < tags.length; i += 1) {
      const tag = tags[i];
      const token = tokens[i];
      // Allow internal hyphens/slashes (event-driven, CI/CD) to stay attached.
      if (tag === 'ADJ' || tag === 'NOUN' || tag === 'PROPN') {
        current.push(token);
      } else {
        flush();
      }
    }
    flush();
    return phrases;
  } catch {
    return [];
  }
}

/**
 * Swap a weak leading verb (made/worked/used…) for a stronger preferred verb
 * when the sentence actually starts with one. Returns the original sentence if
 * no safe substitution applies (or the model is unavailable).
 */
export function strengthenVerb(sentence: string, preferredVerb: string): string {
  if (!preferredVerb || !getNlp()) return sentence;
  const match = sentence.match(/^(\s*)([A-Za-z]+)/);
  if (!match) return sentence;
  const leading = match[2];
  if (!WEAK_VERBS.has(leading.toLowerCase())) return sentence;

  const replacement = capitalizeLike(leading, preferredVerb);
  return sentence.replace(/^(\s*)([A-Za-z]+)/, `$1${replacement}`);
}

/**
 * Insert a keyword as a grammatical modifier. If the model identifies a noun to
 * anchor to, append a concise relative clause; otherwise fall back to a clean
 * trailing qualifier. Never duplicates a keyword already present.
 */
export function insertKeywordGrammatically(sentence: string, keyword: string): string {
  if (!keyword) return sentence;
  if (new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(sentence)) return sentence;

  const nouns = nounTokens(sentence);
  const trimmed = sentence.replace(/[.;]\s*$/, '');
  if (nouns.length > 0) {
    return `${trimmed} using ${keyword}`;
  }
  return `${trimmed} with ${keyword}`;
}

function capitalizeLike(reference: string, value: string): string {
  if (reference[0] === reference[0]?.toUpperCase()) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
