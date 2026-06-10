import { describe, expect, it } from 'vitest';
import { parseJob } from '@/lib/resume-tailoring/parseJob';

describe('parseJob', () => {
  it('extracts required and preferred skills plus seniority', () => {
    const parsed = parseJob(`
      Senior Software Engineer
      Required: React, AWS, Docker
      Preferred: Kafka
      Responsibilities: build frontend systems
    `);

    expect(parsed.requiredSkills).toEqual(expect.arrayContaining(['React', 'AWS', 'Docker']));
    expect(parsed.preferredSkills).toContain('Kafka');
    expect(parsed.seniority).toBe('senior');
  });
});
