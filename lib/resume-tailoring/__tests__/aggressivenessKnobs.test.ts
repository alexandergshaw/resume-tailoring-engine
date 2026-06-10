import { describe, expect, it } from 'vitest';
import { tailorResume } from '@/lib/resume-tailoring/tailorResume';

const resume = Buffer.from(
  `Summary\nSeasoned engineer\nSkills\nReact\nExperience\n- Built React services\n- Maintained AWS infrastructure\nProjects\n- Created Docker tooling\n- Wrote Python scripts`,
);
const job = 'Required: React, AWS, Docker';

describe('aggressiveness knobs', () => {
  it('conservative preserves section order', async () => {
    const result = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: job, aggressiveness: 'conservative' });
    expect(result.sectionOrder).toEqual(['summary', 'skills', 'experience', 'projects', 'education']);
    expect(result.report.section_decisions.sections).toContain('preserved');
  });

  it('aggressive reorders sections to lead with skills and experience', async () => {
    const result = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: job, aggressiveness: 'aggressive' });
    expect(result.sectionOrder[0]).toBe('skills');
    expect(result.sectionOrder.indexOf('experience')).toBeLessThan(result.sectionOrder.indexOf('summary'));
    expect(result.report.section_decisions.sections).toContain('reordered');
  });

  it('records real section decisions reflecting applied transformations', async () => {
    const result = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: job, aggressiveness: 'balanced' });
    expect(result.report.section_decisions).toHaveProperty('bullets');
    expect(result.report.section_decisions).toHaveProperty('projects');
    expect(result.report.section_decisions).toHaveProperty('skills');
    expect(result.report.section_decisions.summary).toContain('prioritize_keywords');
  });

  it('prioritizes required skills first when reorderSkills is enabled', async () => {
    const result = await tailorResume({ resumeBuffer: resume, resumeFilename: 'resume.txt', jobPostingText: 'Required: AWS', aggressiveness: 'balanced' });
    expect(result.report.matched_skills[0]).toBe('AWS');
  });
});
