import { describe, expect, it } from 'vitest';
import { scoreContent } from '@/lib/resume-tailoring/scoreContent';

describe('scoreContent', () => {
  it('prioritizes required skills and penalizes duplicates', () => {
    const scored = scoreContent(
      [
        { text: 'Built React dashboard', section: 'experience', detectedSkills: ['React'] },
        { text: 'Built React dashboard', section: 'projects', detectedSkills: ['React'] },
      ],
      {
        requiredSkills: ['React'],
        preferredSkills: [],
        tools: [],
        domainKeywords: [],
        titleKeywords: [],
        responsibilities: [],
        seniority: 'unknown',
      },
    );

    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });
});
