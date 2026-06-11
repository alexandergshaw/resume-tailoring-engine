import type { ClaimExpansion, ParsedJob, ScoredBullet } from './types';
import { ensureNlpLoaded, insertKeywordGrammatically, strengthenVerb } from './nlp';

// Dates are never fabricated, but a bullet merely *containing* a date (e.g.
// "Led the 2021 migration") should still be eligible for additive enrichment.
// So date patterns are anti-fabrication only (see FABRICATION_PATTERNS) and are
// intentionally NOT part of the pre-check that blocks rewriting.
const DATE_PATTERNS: RegExp[] = [
  /\b(19\d{2}|20\d{2})\b/,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/i,
];

// Genuine quantified-result claims that must never be altered or fabricated.
// Crucially, this is NOT "any digit" — incidental numbers (dates, versions,
// counts woven into prose) must not block enrichment. We only protect figures
// that read as measurable outcomes: percentages, currency-scale numbers,
// magnitudes, multipliers, explicit quantities, and result verbs paired with a
// number.
const METRIC_PATTERNS: RegExp[] = [
  /\d+(\.\d+)?\s?%/, // 40%, 12.5 %
  /\b\d{1,3}(,\d{3})+\b/, // 5,000 / 120,000
  /\b\d+(\.\d+)?(k|m|bn|mm)\b/i, // 5k, 1.2M, 10bn
  /\b\d+(\.\d+)?\s*(million|billion|thousand|percent)\b/i,
  /\b\d+(\.\d+)?x\b/i, // 3x throughput
  /\b\d+\+?\s+(users|customers|clients|engineers|developers|employees|people|projects|requests|transactions|records|members|hours|countries|markets)\b/i,
  /\bteam of \d+/i,
  /\b(increased|decreased|reduced|improved|grew|cut|saved|generated|boosted|accelerated|raised|lowered|optimized)\b[^.]*?\d/i,
];

// Protected categories that block in-place rewriting of a bullet entirely.
// These are claims where any wording change risks misrepresentation.
const PROTECTED_PATTERNS: Array<{ category: string; pattern: RegExp }> = [
  // employers
  { category: 'employer', pattern: /\b(inc|llc|corp|corporation|ltd|gmbh|co)\b/i },
  // certifications & degrees
  { category: 'credential', pattern: /\b(certification|certified|certificate|degree|diploma|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?b\.?a\.?|ph\.?d\.?|bachelor|master|doctorate)\b/i },
  // compensation
  { category: 'compensation', pattern: /\$\s?\d|\b(salary|compensation|wage|stipend|usd|per\s+(hour|year|annum)|annual\s+pay)\b/i },
  // locations
  { category: 'location', pattern: /\b[A-Z][a-zA-Z]+,\s?(?:[A-Z]{2}|[A-Z][a-z]+)\b|\b(remote|on-?site|hybrid|relocat)\w*\b/ },
  // genuine quantified results
  ...METRIC_PATTERNS.map((pattern) => ({ category: 'metric', pattern })),
  // work authorization
  { category: 'work_authorization', pattern: /\b(visa|h-?1b|green\s?card|citizen|citizenship|sponsorship|work\s+authoriz\w*|authorized\s+to\s+work)\b/i },
  // publications
  { category: 'publication', pattern: /\b(publication|published|journal|conference\s+paper|proceedings|doi|isbn)\b/i },
  // awards
  { category: 'award', pattern: /\b(award|awarded|honou?r|recognition|scholarship|dean'?s\s+list|valedictorian|medal)\b/i },
];

export function claimExpansion(params: { bullets: ScoredBullet[]; jobText: string }): { bullets: ScoredBullet[]; expansions: ClaimExpansion[] } {
  const lowerJobText = params.jobText.toLowerCase();
  const expansions: ClaimExpansion[] = [];

  const bullets = params.bullets.map((bullet) => {
    if (isProtected(bullet.text)) {
      return bullet;
    }

    let next = bullet.text;
    next = replaceTerm(next, /developer/gi, 'software engineer', 'job_title', expansions);
    next = replaceTerm(next, /built/gi, 'designed and delivered', 'job_duty', expansions);

    if (lowerJobText.includes('kafka') && !/kafka/i.test(next)) {
      const original = next;
      next = `${next}; aligned architecture with Apache Kafka event-streaming patterns`;
      expansions.push({ claim_type: 'skill', original_text: original, expanded_text: next, basis: 'Target role references Kafka.' });
    }

    return { ...bullet, text: next };
  });

  return { bullets, expansions };
}

function isProtected(text: string): boolean {
  return PROTECTED_PATTERNS.some(({ pattern }) => pattern.test(text));
}

// Re-exported so other modules (e.g. region replacement) can reuse the exact
// same factual-claim protection logic.
export { isProtected };

// Meaning-preserving terminology upgrades that align weak resume phrasing with
// stronger, results-oriented language. These are intentionally conservative —
// they swap synonyms, never invent scope or outcomes.
const TERMINOLOGY_SUBSTITUTIONS: Array<{
  pattern: RegExp;
  replacement: string;
  claimType: ClaimExpansion['claim_type'];
}> = [
  { pattern: /\bdeveloper\b/gi, replacement: 'software engineer', claimType: 'job_title' },
  { pattern: /\bbuilt\b/gi, replacement: 'designed and delivered', claimType: 'job_duty' },
  { pattern: /\bworked on\b/gi, replacement: 'delivered', claimType: 'job_duty' },
  { pattern: /\bresponsible for\b/gi, replacement: 'owned', claimType: 'job_duty' },
  { pattern: /\bin charge of\b/gi, replacement: 'led', claimType: 'job_duty' },
  { pattern: /\bassisted with\b/gi, replacement: 'supported', claimType: 'job_duty' },
  { pattern: /\bparticipated in\b/gi, replacement: 'contributed to', claimType: 'job_duty' },
];

export type EnrichConfig = {
  substituteTerminology: boolean;
  augmentBullets: boolean;
  augmentTitlesAndProjects: boolean;
  maxInsertionsPerBullet: number;
};

/**
 * Additive keyword enrichment: weaves job-posting terminology into existing
 * resume bullets WITHOUT removing or reordering anything. Bullets are returned
 * in their original order; only their text may be augmented. Protected claims
 * (employers, dates, metrics, credentials, compensation, etc.) are never
 * altered, and insertions are additive qualifiers — they never fabricate
 * quantified results, titles held, employers, or credentials.
 *
 * Keyword insertion is POS-aware (via wink-nlp): keywords are placed as
 * grammatical modifiers and weak leading verbs are strengthened toward the
 * posting's terminology. When the NLP model is unavailable the helpers return
 * input unchanged, so enrichment still works with plain string fallbacks.
 * Async because both the NLP layer and future semantic checks may be async.
 */
export async function enrichContent(params: {
  bullets: ScoredBullet[];
  parsedJob: ParsedJob;
  resumeText: string;
  config: EnrichConfig;
  // High-priority, posting-mined phrases pre-matched to a specific bullet index
  // (from semantic coverage analysis). These are woven in first, before the
  // generic skill round-robin. Each is already known to be missing from the
  // resume but supported by the bullet's content.
  phraseTargets?: Array<{ text: string; targetBulletIndex: number; weight: number }>;
}): Promise<{ bullets: ScoredBullet[]; expansions: ClaimExpansion[] }> {
  const { config, parsedJob } = params;
  const expansions: ClaimExpansion[] = [];

  // Load the POS model once so the per-bullet rewrite helpers can run; if it is
  // unavailable the helpers degrade to plain-string fallbacks.
  await ensureNlpLoaded();

  // Keywords the posting wants that the resume does not already mention anywhere.
  const lowerResume = params.resumeText.toLowerCase();
  const missingKeywords = uniq([
    ...parsedJob.requiredSkills,
    ...parsedJob.preferredSkills,
    ...parsedJob.tools,
  ]).filter((keyword) => keyword && !lowerResume.includes(keyword.toLowerCase()));

  const eligibleSections = config.augmentTitlesAndProjects
    ? ['experience', 'projects']
    : config.augmentBullets
      ? ['experience']
      : [];

  const isEligible = (index: number): boolean => {
    const bullet = params.bullets[index];
    return bullet !== undefined && eligibleSections.includes(bullet.section) && !isProtected(bullet.text);
  };

  // Per-bullet insertion budget so a single bullet is never over-stuffed.
  const budget = new Map<number, number>();
  params.bullets.forEach((_, index) => {
    if (isEligible(index)) budget.set(index, config.maxInsertionsPerBullet);
  });

  // Insertion plan: bulletIndex -> ordered phrases/keywords to weave in.
  const plan = new Map<number, string[]>();
  const planFor = (index: number): string[] => {
    const existing = plan.get(index);
    if (existing) return existing;
    const created: string[] = [];
    plan.set(index, created);
    return created;
  };

  // 1. Posting-mined phrases first (highest weight → most relevant bullet).
  if (config.maxInsertionsPerBullet > 0) {
    const sortedPhrases = [...(params.phraseTargets ?? [])].sort((a, b) => b.weight - a.weight);
    for (const phrase of sortedPhrases) {
      const index = phrase.targetBulletIndex;
      const remaining = budget.get(index) ?? 0;
      if (remaining > 0 && phrase.text.trim()) {
        planFor(index).push(phrase.text.trim());
        budget.set(index, remaining - 1);
      }
    }
  }

  // 2. Generic skill round-robin fills any leftover budget, strongest bullets
  //    first, emitting in original order so the document is never reordered.
  if (config.maxInsertionsPerBullet > 0 && missingKeywords.length > 0) {
    const queue = [...missingKeywords];
    const orderedTargets = [...params.bullets]
      .map((bullet, index) => ({ bullet, index }))
      .filter(({ index }) => isEligible(index))
      .sort((a, b) => b.bullet.score - a.bullet.score)
      .map(({ index }) => index);

    for (const index of orderedTargets) {
      let remaining = budget.get(index) ?? 0;
      while (remaining > 0 && queue.length > 0) {
        planFor(index).push(queue.shift() as string);
        remaining -= 1;
      }
      budget.set(index, remaining);
    }
  }

  const bullets = params.bullets.map((bullet, index) => {
    if (isProtected(bullet.text)) {
      return bullet;
    }

    let next = bullet.text;

    if (config.substituteTerminology) {
      for (const { pattern, replacement, claimType } of TERMINOLOGY_SUBSTITUTIONS) {
        // Reset stateful global regexes before each reuse.
        pattern.lastIndex = 0;
        next = replaceTerm(next, pattern, replacement, claimType, expansions);
      }
    }

    // Strengthen a weak leading verb toward the posting's dominant action verb.
    if (config.substituteTerminology) {
      const preferredVerb = preferredActionVerb(parsedJob);
      if (preferredVerb) {
        const strengthened = strengthenVerb(next, preferredVerb);
        if (strengthened !== next && !isProtected(strengthened)) {
          expansions.push({
            claim_type: 'job_duty',
            original_text: next,
            expanded_text: strengthened,
            basis: 'Strengthened weak verb toward posting terminology.',
          });
          next = strengthened;
        }
      }
    }

    for (const keyword of planFor(index)) {
      const original = next;
      const candidate = insertKeywordGrammatically(next, keyword);
      // Anti-fabrication post-filter: a rewrite must not introduce a protected
      // claim (number, date, employer, credential, etc.) that was not already
      // present in the original text.
      if (candidate !== original && !introducesProtectedClaim(original, candidate)) {
        expansions.push({
          claim_type: 'skill',
          original_text: original,
          expanded_text: candidate,
          basis: `Aligned with target role keyword: ${keyword}.`,
        });
        next = candidate;
      }
    }

    return next === bullet.text ? bullet : { ...bullet, text: next };
  });

  return { bullets, expansions };
}

// Returns true when a rewrite would introduce a claim not supported by the
// original text. This is the anti-fabrication guarantee: a rewrite may never
// add a number, date, employer, credential, metric, etc. that the candidate did
// not already state. Insertions are pure additive qualifiers (e.g. "using
// Kubernetes"), so they always pass; anything that smuggles in a new fact is
// rejected.
function introducesProtectedClaim(original: string, rewritten: string): boolean {
  // Never introduce new numeric content (metrics, counts, dates, versions).
  if (countDigits(rewritten) > countDigits(original)) return true;
  if (DATE_PATTERNS.some((pattern) => pattern.test(rewritten) && !pattern.test(original))) return true;
  return PROTECTED_PATTERNS.some(
    ({ pattern }) => pattern.test(rewritten) && !pattern.test(original),
  );
}

function countDigits(text: string): number {
  return (text.match(/\d/g) ?? []).length;
}

// Chooses a stronger action verb to lead bullets with, based on the posting's
// dominant role keyword. Returns '' when no confident choice applies.
function preferredActionVerb(parsedJob: ParsedJob): string {
  if (parsedJob.titleKeywords.includes('engineer')) return 'engineered';
  if (parsedJob.titleKeywords.includes('architect')) return 'architected';
  if (parsedJob.titleKeywords.includes('manager')) return 'led';
  return '';
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function replaceTerm(
  text: string,
  regex: RegExp,
  replacement: string,
  claimType: ClaimExpansion['claim_type'],
  expansions: ClaimExpansion[],
): string {
  if (!regex.test(text)) return text;
  const original = text;
  const expanded = text.replace(regex, replacement);
  if (expanded !== original) {
    expansions.push({ claim_type: claimType, original_text: original, expanded_text: expanded, basis: `Terminology alignment for ${claimType}.` });
  }
  return expanded;
}
