import { describe, expect, it } from 'vitest';
import { enrichContent } from '@/lib/resume-tailoring/claimExpansion';
import type { ParsedJob, ScoredBullet } from '@/lib/resume-tailoring/types';

function bullet(text: string): ScoredBullet {
  return { text, section: 'experience', detectedSkills: [], score: 5, reasons: [] };
}

const baseJob: ParsedJob = {
  requiredSkills: [],
  preferredSkills: [],
  tools: [],
  domainKeywords: [],
  titleKeywords: [],
  responsibilities: [],
  seniority: 'unknown',
};

const config = {
  substituteTerminology: false,
  augmentBullets: true,
  augmentTitlesAndProjects: false,
  maxInsertionsPerBullet: 2,
};

describe('enrichContent phrase targeting', () => {
  it('weaves a posting-mined phrase into its targeted bullet', async () => {
    const { bullets, expansions } = await enrichContent({
      bullets: [bullet('Monitored production dashboards'), bullet('Wrote internal docs')],
      parsedJob: baseJob,
      resumeText: 'Monitored production dashboards Wrote internal docs',
      config,
      phraseTargets: [{ text: 'observability tooling', targetBulletIndex: 0, weight: 5 }],
    });

    expect(bullets[0].text).toContain('observability tooling');
    expect(bullets[1].text).toBe('Wrote internal docs');
    expect(expansions.some((e) => e.expanded_text.includes('observability tooling'))).toBe(true);
  });

  it('never injects into a protected bullet', async () => {
    const original = 'Increased revenue by 40% in 2023';
    const { bullets } = await enrichContent({
      bullets: [bullet(original)],
      parsedJob: baseJob,
      resumeText: original,
      config,
      phraseTargets: [{ text: 'distributed systems', targetBulletIndex: 0, weight: 5 }],
    });

    expect(bullets[0].text).toBe(original);
  });

  it('respects the per-bullet insertion budget', async () => {
    const { bullets } = await enrichContent({
      bullets: [bullet('Built internal services')],
      parsedJob: baseJob,
      resumeText: 'Built internal services',
      config: { ...config, maxInsertionsPerBullet: 1 },
      phraseTargets: [
        { text: 'event streaming', targetBulletIndex: 0, weight: 5 },
        { text: 'service mesh', targetBulletIndex: 0, weight: 4 },
      ],
    });

    const insertedCount = ['event streaming', 'service mesh'].filter((phrase) =>
      bullets[0].text.includes(phrase),
    ).length;
    expect(insertedCount).toBe(1);
  });
});
