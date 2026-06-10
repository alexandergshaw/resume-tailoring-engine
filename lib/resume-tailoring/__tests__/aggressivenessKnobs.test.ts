import { describe, expect, it } from 'vitest';
import { tailorResume } from '@/lib/resume-tailoring/tailorResume';

const resume = Buffer.from(
  `Summary\nSeasoned engineer\nSkills\nReact\nExperience\n- Created React services\n- Maintained AWS infrastructure\nProjects\n- Created Docker tooling\n- Wrote Python scripts`,
);
const job = 'Required: React, AWS, Docker';

describe('aggressiveness knobs (additive)', () => {
  it('always preserves section order regardless of level', async () => {
    for (const level of ['conservative', 'balanced', 'aggressive', 'max'] as const) {
      const result = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: job, aggressiveness: level });
      expect(result.sectionOrder).toEqual(['summary', 'skills', 'experience', 'projects', 'education']);
      expect(result.report.section_decisions.sections).toContain('no content removed');
      expect(result.rejectedBullets).toHaveLength(0);
    }
  });

  it('records additive section decisions (no removal/reorder language)', async () => {
    const result = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: job, aggressiveness: 'balanced' });
    expect(result.report.section_decisions).toHaveProperty('bullets');
    expect(result.report.section_decisions).toHaveProperty('projects');
    expect(result.report.section_decisions).toHaveProperty('skills');
    expect(result.report.section_decisions.summary).toContain('prioritize_keywords');
    expect(JSON.stringify(result.report.section_decisions)).not.toContain('removed low-relevance');
  });

  it('matched skills include required job skills supported by the resume', async () => {
    const result = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: 'Required: AWS', aggressiveness: 'balanced' });
    expect(result.report.matched_skills).toContain('AWS');
  });

  it('aggressive augments projects, conservative does not', async () => {
    const aggressive = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: job, aggressiveness: 'aggressive' });
    const conservative = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: job, aggressiveness: 'conservative' });
    expect(aggressive.report.section_decisions.projects).toContain('enriched');
    expect(conservative.report.section_decisions.projects).toContain('preserved');
  });
});
