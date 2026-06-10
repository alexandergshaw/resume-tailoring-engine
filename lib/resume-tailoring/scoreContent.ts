import type { ParsedJob, ResumeBullet, ScoredBullet } from './types';

export function scoreContent(bullets: ResumeBullet[], job: ParsedJob): ScoredBullet[] {
  const seen = new Set<string>();

  return bullets
    .map((bullet) => {
      const lower = bullet.text.toLowerCase();
      let score = 0;
      const reasons: string[] = [];

      if (job.requiredSkills.some((skill) => bullet.detectedSkills.includes(skill))) {
        score += 5;
        reasons.push('required_skill');
      }
      if (job.preferredSkills.some((skill) => bullet.detectedSkills.includes(skill))) {
        score += 3;
        reasons.push('preferred_skill');
      }
      if (job.responsibilities.some((resp) => tokenOverlap(resp, lower))) {
        score += 3;
        reasons.push('responsibility_match');
      }
      if ([...job.domainKeywords, ...job.titleKeywords].some((keyword) => lower.includes(keyword.toLowerCase()))) {
        score += 2;
        reasons.push('domain_or_title');
      }
      if (['experience', 'projects'].includes(bullet.section)) {
        score += 1;
        reasons.push('recent_section_bonus');
      }
      if (seen.has(lower)) {
        score -= 2;
        reasons.push('duplicate_penalty');
      }

      seen.add(lower);
      return { ...bullet, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

function tokenOverlap(reference: string, target: string): boolean {
  const tokens = reference.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  return tokens.some((token) => target.includes(token));
}
