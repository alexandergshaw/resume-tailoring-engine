import type { ParsedJob, ResumeBullet, ScoredBullet } from './types';
import { cosineSimilarity, getEmbedder, type Embedder } from './embeddings';

// Cosine threshold above which a bullet is considered semantically relevant to
// a posting requirement. MiniLM sentence similarities for genuinely related
// content typically land here; unrelated content stays well below.
const SIMILARITY_THRESHOLD = 0.4;

/**
 * Scores bullets for enrichment targeting only — never sorts or removes them.
 * Keyword signals are kept exactly as before; semantic similarity (via local
 * MiniLM embeddings) is layered on top as an additive boost so a bullet can
 * rank as relevant even with no shared keywords. When the embedder is
 * unavailable (offline/CI) the function degrades to the original keyword-only
 * behavior. Pass `embedderOverride` (including `null`) in tests to control the
 * path deterministically.
 */
export async function scoreContent(
  bullets: ResumeBullet[],
  job: ParsedJob,
  embedderOverride?: Embedder | null,
): Promise<ScoredBullet[]> {
  const embedder = embedderOverride !== undefined ? embedderOverride : await getEmbedder();

  const requirements = uniq([
    ...job.requiredSkills,
    ...job.preferredSkills,
    ...job.responsibilities,
  ]).filter((text) => text.trim().length > 0);

  let bulletVectors: number[][] | null = null;
  let requirementVectors: number[][] | null = null;
  if (embedder && requirements.length > 0 && bullets.length > 0) {
    try {
      bulletVectors = await embedder(bullets.map((bullet) => bullet.text));
      requirementVectors = await embedder(requirements);
    } catch {
      bulletVectors = null;
      requirementVectors = null;
    }
  }

  const seen = new Set<string>();

  return bullets.map((bullet, index) => {
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

    if (bulletVectors && requirementVectors) {
      const vector = bulletVectors[index];
      const best = requirementVectors.reduce(
        (max, requirementVector) => Math.max(max, cosineSimilarity(vector, requirementVector)),
        0,
      );
      if (best >= SIMILARITY_THRESHOLD) {
        // Additive boost proportional to similarity (max +4), so semantically
        // relevant bullets are favored for enrichment without overriding
        // explicit keyword matches.
        score += Math.round(best * 4);
        reasons.push('semantic_match');
      }
    }

    if (seen.has(lower)) {
      score -= 2;
      reasons.push('duplicate_penalty');
    }

    seen.add(lower);
    return { ...bullet, score, reasons };
  });
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function tokenOverlap(reference: string, target: string): boolean {
  const tokens = reference.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  return tokens.some((token) => target.includes(token));
}
