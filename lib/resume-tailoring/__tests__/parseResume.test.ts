import { describe, expect, it } from 'vitest';
import { parseResume } from '@/lib/resume-tailoring/parseResume';

describe('parseResume', () => {
  it('splits sections and extracts bullets with detected skills', async () => {
    const buffer = Buffer.from(
      `Summary\nExperienced engineer\nExperience\n- Built React applications\n- Deployed Docker containers\nEducation\nB.S. Computer Science`,
    );

    const parsed = await parseResume({ buffer, filename: 'resume.txt' });

    expect(parsed.sections.experience).toBeDefined();
    expect(parsed.bullets.length).toBeGreaterThanOrEqual(2);

    const reactBullet = parsed.bullets.find((bullet) => bullet.text.includes('React'));
    expect(reactBullet?.detectedSkills).toContain('React');
    expect(reactBullet?.section).toBe('experience');
  });
});
