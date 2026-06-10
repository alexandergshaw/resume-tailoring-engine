import { describe, expect, it } from 'vitest';
import { extractSkills } from '@/lib/resume-tailoring/extractSkills';

describe('extractSkills', () => {
  it('maps aliases to canonical taxonomy names', () => {
    const skills = extractSkills('Built reactjs apps on amazon web services with springboot and apache kafka.');
    expect(skills).toEqual(expect.arrayContaining(['React', 'AWS', 'Spring Boot', 'Kafka']));
  });
});
