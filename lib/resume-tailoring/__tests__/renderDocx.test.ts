import mammoth from 'mammoth';
import { describe, expect, it } from 'vitest';
import { renderDocx } from '@/lib/resume-tailoring/renderDocx';

describe('renderDocx', () => {
  it('produces a valid docx readable by mammoth with all sections', async () => {
    const buffer = renderDocx({
      summary: 'Experienced engineer',
      skills: ['React', 'AWS'],
      experienceBullets: ['Built React apps', 'Deployed to AWS'],
      projects: ['Internal tooling'],
      education: 'B.S. Computer Science',
    });

    const { value } = await mammoth.extractRawText({ buffer });
    expect(value).toContain('Experienced engineer');
    expect(value).toContain('React, AWS');
    expect(value).toContain('Built React apps');
    expect(value).toContain('Internal tooling');
    expect(value).toContain('B.S. Computer Science');
  });

  it('honors a custom section order', async () => {
    const buffer = renderDocx({
      summary: 'Summary text',
      skills: ['React'],
      experienceBullets: ['Experience line'],
      projects: [],
      education: 'Education line',
      sectionOrder: ['skills', 'experience', 'summary', 'education'],
    });

    const { value } = await mammoth.extractRawText({ buffer });
    const skillsIndex = value.indexOf('React');
    const summaryIndex = value.indexOf('Summary text');
    expect(skillsIndex).toBeGreaterThanOrEqual(0);
    expect(summaryIndex).toBeGreaterThan(skillsIndex);
  });
});
