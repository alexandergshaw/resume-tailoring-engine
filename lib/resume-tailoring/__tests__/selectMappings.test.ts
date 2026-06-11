import { describe, expect, it } from 'vitest';
import {
  experienceMappingLibrary,
  projectMappingLibrary,
  skillsMappingLibrary,
} from '@/lib/resume-tailoring/mappings';
import {
  resolveExperience,
  resolveProjects,
  resolveSkillsSections,
  scoreMapping,
  selectActiveExperienceMappings,
  selectActiveSkillsMappings,
  type JobPostingSignals,
} from '@/lib/resume-tailoring/mappings/selectMappings';

const SCORE_FORMULA = skillsMappingLibrary.skills_section_mapping_library.selection_logic.score_formula;

describe('mapping library validation', () => {
  it('loads and validates all three JSON libraries', () => {
    expect(skillsMappingLibrary.skills_section_mapping_library.mappings.length).toBeGreaterThan(0);
    expect(experienceMappingLibrary.experience_section_mapping_library.mappings.length).toBeGreaterThan(0);
    expect(projectMappingLibrary.project_section_mapping_library.mappings.length).toBeGreaterThan(0);
  });
});

describe('scoreMapping', () => {
  it('rewards exact buzzword and required-skill matches', () => {
    const signals: JobPostingSignals = {
      text: 'We need a React developer for frontend work.',
      requiredSkills: ['React'],
    };
    const score = scoreMapping(['React', 'frontend'], 'frontend_engineering', signals, SCORE_FORMULA);
    // React: exact(5) + required(8); frontend: exact(5) = 18
    expect(score).toBe(
      SCORE_FORMULA.exact_buzzword_match * 2 + SCORE_FORMULA.required_skill_match,
    );
  });

  it('applies the protected_claim_conflict penalty when evidence is missing', () => {
    const signals: JobPostingSignals = {
      text: 'Looking for a Java Spring Boot backend engineer.',
      profileEvidence: ['Python'], // no overlap with backend mapping buzzwords
    };
    const score = scoreMapping(
      ['Java', 'Spring Boot', 'backend'],
      'backend_api_engineering',
      signals,
      SCORE_FORMULA,
    );
    expect(score).toBeLessThan(0);
  });

  it('does not penalize an evidence-gated mapping when evidence overlaps', () => {
    const signals: JobPostingSignals = {
      text: 'Looking for a Java Spring Boot backend engineer.',
      profileEvidence: ['Java'],
    };
    const score = scoreMapping(
      ['Java', 'Spring Boot', 'backend'],
      'backend_api_engineering',
      signals,
      SCORE_FORMULA,
    );
    expect(score).toBeGreaterThan(0);
  });
});

describe('skills resolution', () => {
  it('respects max caps and deduplicates skills', () => {
    const lib = skillsMappingLibrary.skills_section_mapping_library;
    const logic = lib.selection_logic;
    const signals: JobPostingSignals = {
      text: 'Full stack React TypeScript developer building REST APIs and SQL workflows with frontend and backend.',
    };

    const active = selectActiveSkillsMappings(signals);
    expect(active.length).toBeGreaterThan(0);

    const sections = resolveSkillsSections(signals);
    expect(sections.length).toBeLessThanOrEqual(logic.max_active_skill_sections);

    const all = sections.flatMap((s) => s.skills.map((sk) => sk.toLowerCase()));
    expect(new Set(all).size).toBe(all.length); // deduplicated
  });

  it('filters protected skills lacking profile evidence', () => {
    const signals: JobPostingSignals = {
      text: 'Healthcare integration engineer working with FHIR and HL7.',
      profileEvidence: [], // no evidence => no concrete protected skills inserted
    };
    const sections = resolveSkillsSections(signals);
    const flat = sections.flatMap((s) => s.skills.map((sk) => sk.toLowerCase()));
    expect(flat).not.toContain('fhir');
    expect(flat).not.toContain('hl7');
  });
});

describe('experience resolution', () => {
  const signals: JobPostingSignals = {
    text: 'Senior full stack engineer: React, TypeScript, REST APIs, SQL, technical leadership and mentorship.',
    profileEvidence: ['React', 'TypeScript', 'SQL', 'REST APIs'],
  };

  it('enforces top > medium > low rank ordering', () => {
    const exp = resolveExperience(signals);
    const lib = experienceMappingLibrary.experience_section_mapping_library;
    expect(exp.job1.title.rank).toBe(lib.shared_rank_terms.top[0]);
    expect(exp.job2.title.rank).toBe(lib.shared_rank_terms.medium[0]);
    expect(exp.job3.title.rank).toBe(lib.shared_rank_terms.low[0]);
  });

  it('always pins the adjunct slot to education_instruction', () => {
    const exp = resolveExperience(signals);
    expect(exp.adjunct.mappingId).toBe('education_instruction');
    expect(exp.adjunct.courseTopics3.length).toBeGreaterThan(0);
  });

  it('excludes the adjunct mapping from scored technical selection', () => {
    const active = selectActiveExperienceMappings(signals);
    expect(active.every((entry) => entry.mapping.id !== 'education_instruction')).toBe(true);
  });

  it('fills every bullet placeholder with a non-empty fragment', () => {
    const exp = resolveExperience(signals);
    for (const value of Object.values(exp.job1.bullets)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('project resolution', () => {
  it('does not reuse a mapping across slots when enough mappings activate', () => {
    const signals: JobPostingSignals = {
      text:
        'Full stack React engineer building REST APIs, SQL databases, cloud platform work, ' +
        'curriculum design and technical instruction for students.',
      profileEvidence: ['React', 'SQL', 'REST APIs', 'AWS'],
    };
    const projects = resolveProjects(signals);
    const ids = [projects.project1.mappingId, projects.project2.mappingId, projects.project3.mappingId];
    expect(new Set(ids).size).toBe(3);
  });

  it('prefers teaching mappings for the Metropolitan College slots when present', () => {
    const signals: JobPostingSignals = {
      text:
        'Instructor and curriculum designer: course development, instructional design, ' +
        'project-based learning, plus React and SQL application development.',
      profileEvidence: ['React', 'SQL'],
    };
    const projects = resolveProjects(signals);
    const collegeIds = [projects.project2.mappingId, projects.project3.mappingId];
    expect(collegeIds.some((id) => id === 'curriculum_design' || id === 'education_instruction')).toBe(true);
  });
});
