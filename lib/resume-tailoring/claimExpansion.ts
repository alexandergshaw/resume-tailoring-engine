import type { ClaimExpansion, ScoredBullet } from './types';

// Protected categories that may never be altered or fabricated by claim expansion.
const PROTECTED_PATTERNS: Array<{ category: string; pattern: RegExp }> = [
  // employers
  { category: 'employer', pattern: /\b(inc|llc|corp|corporation|ltd|gmbh|co)\b/i },
  // dates
  { category: 'date', pattern: /\b(19\d{2}|20\d{2})\b/ },
  { category: 'date', pattern: /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/i },
  // certifications & degrees
  { category: 'credential', pattern: /\b(certification|certified|certificate|degree|diploma|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?b\.?a\.?|ph\.?d\.?|bachelor|master|doctorate)\b/i },
  // compensation
  { category: 'compensation', pattern: /\$\s?\d|\b(salary|compensation|wage|stipend|usd|per\s+(hour|year|annum)|annual\s+pay)\b/i },
  // locations
  { category: 'location', pattern: /\b[A-Z][a-zA-Z]+,\s?(?:[A-Z]{2}|[A-Z][a-z]+)\b|\b(remote|on-?site|hybrid|relocat)\w*\b/ },
  // metrics (any numeric figure that could be a fabricated result)
  { category: 'metric', pattern: /\d/ },
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
