import type { ClaimExpansion, ScoredBullet } from './types';

const PROTECTED_PATTERNS = [/\b(inc|llc|corp|ltd)\b/i, /\b(20\d{2}|19\d{2})\b/, /\b(certification|degree|b\.s\.|m\.s\.|phd)\b/i];

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
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(text));
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
