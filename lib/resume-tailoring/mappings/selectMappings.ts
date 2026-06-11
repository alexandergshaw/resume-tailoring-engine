import {
  experienceMappingLibrary,
  projectMappingLibrary,
  skillsMappingLibrary,
  type ExperienceMapping,
  type ProjectMapping,
  type ScoreFormula,
  type SkillsMapping,
} from './index';

export type JobPostingSignals = {
  /** Full job posting text. Matched case-insensitively. */
  text: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  jobTitles?: string[];
  domains?: string[];
  /** Terms the candidate can actually claim; gates protected (concrete) skills. */
  profileEvidence?: string[];
};

export type ScoredMapping<T> = { mapping: T; score: number };

/**
 * Mapping ids whose buzzwords/skills are concrete protected claims
 * (languages, frameworks, cloud, databases, security tooling, healthcare
 * standards). When profileEvidence is supplied and shares no term with one of
 * these mappings, the mapping is penalized so it cannot be inserted unsupported.
 */
const EVIDENCE_GATED_MAPPING_IDS = new Set<string>([
  'frontend_engineering',
  'backend_api_engineering',
  'full_stack_engineering',
  'database_sql',
  'cloud_platform',
  'devops_cicd',
  'healthcare_integration',
  'cybersecurity',
]);

/** Concrete skill terms that must not be inserted without profile evidence. */
const PROTECTED_SKILL_TERMS = new Set<string>(
  [
    'React',
    'React.js',
    'JavaScript',
    'TypeScript',
    'HTML5',
    'CSS3',
    'SCSS',
    'Java',
    'Spring Boot',
    'SQL',
    'PostgreSQL',
    'SQL Server',
    'AWS',
    'Azure',
    'GCP',
    'Docker',
    'Kubernetes',
    'Jenkins',
    'GitHub Actions',
    'FHIR',
    'HL7',
    'CCD',
    'C-CDA',
    'Git',
    'GitHub',
    'Jira',
    'Zoom',
    'Microsoft Teams',
    'Google Workspace',
    'Excel',
  ].map((s) => s.toLowerCase()),
);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(haystack: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(term.toLowerCase())}([^a-z0-9]|$)`, 'i').test(haystack);
}

function listIncludes(list: string[] | undefined, term: string): boolean {
  if (!list) return false;
  const lower = term.toLowerCase();
  return list.some((entry) => entry.toLowerCase() === lower || containsTerm(entry.toLowerCase(), lower));
}

/**
 * Deterministic score for a mapping against the posting signals. Buzzword
 * matches are word-boundary, case-insensitive substring matches (robust to
 * punctuation like "CI/CD" or "React.js"). Conflicts on evidence-gated mappings
 * apply the protected_claim_conflict penalty.
 */
export function scoreMapping(
  buzzwords: string[],
  mappingId: string,
  signals: JobPostingSignals,
  formula: ScoreFormula,
): number {
  const text = signals.text.toLowerCase();
  let score = 0;
  let evidenceOverlap = false;

  for (const buzzword of buzzwords) {
    if (containsTerm(text, buzzword)) score += formula.exact_buzzword_match;
    if (listIncludes(signals.requiredSkills, buzzword)) score += formula.required_skill_match;
    if (listIncludes(signals.preferredSkills, buzzword)) score += formula.preferred_skill_match;
    if (listIncludes(signals.jobTitles, buzzword)) score += formula.job_title_match;
    if (listIncludes(signals.domains, buzzword)) score += formula.domain_match;
    if (listIncludes(signals.profileEvidence, buzzword)) {
      score += formula.resume_evidence_match;
      evidenceOverlap = true;
    }
  }

  const hasEvidenceSignal = (signals.profileEvidence?.length ?? 0) > 0;
  if (hasEvidenceSignal && EVIDENCE_GATED_MAPPING_IDS.has(mappingId) && !evidenceOverlap) {
    score += formula.protected_claim_conflict;
  }

  return score;
}

function selectActive<T extends { id: string; buzzwords: string[] }>(
  mappings: T[],
  signals: JobPostingSignals,
  formula: ScoreFormula,
  minimumScore: number,
  priorityOf: (mapping: T) => number,
): ScoredMapping<T>[] {
  return mappings
    .map((mapping) => ({ mapping, score: scoreMapping(mapping.buzzwords, mapping.id, signals, formula) }))
    .filter((entry) => entry.score >= minimumScore)
    .sort((a, b) => b.score - a.score || priorityOf(b.mapping) - priorityOf(a.mapping));
}

function isProtectedSkill(skill: string): boolean {
  return PROTECTED_SKILL_TERMS.has(skill.toLowerCase());
}

/* --------------------------------- Skills --------------------------------- */

export type ResolvedSkillSection = { sectionName: string; skills: string[] };

export function selectActiveSkillsMappings(signals: JobPostingSignals): ScoredMapping<SkillsMapping>[] {
  const lib = skillsMappingLibrary.skills_section_mapping_library;
  return selectActive(
    lib.mappings,
    signals,
    lib.selection_logic.score_formula,
    lib.selection_logic.minimum_score_to_activate_mapping,
    (m) => m.skills_section_output.section_priority,
  );
}

export function resolveSkillsSections(signals: JobPostingSignals): ResolvedSkillSection[] {
  const lib = skillsMappingLibrary.skills_section_mapping_library;
  const logic = lib.selection_logic;
  const active = selectActiveSkillsMappings(signals).slice(0, logic.max_active_skill_sections);

  const seen = new Set<string>();
  const sections: ResolvedSkillSection[] = [];

  for (const { mapping } of active) {
    const output = mapping.skills_section_output;
    const groups = output.skill_groups.slice(0, logic.max_groups_per_section);
    const skills: string[] = [];

    for (const group of groups) {
      let added = 0;
      for (const skill of group.skills) {
        if (added >= logic.max_skills_per_group) break;
        if (isProtectedSkill(skill) && !listIncludes(signals.profileEvidence, skill)) continue;
        const key = skill.toLowerCase();
        if (logic.deduplicate_skills && seen.has(key)) continue;
        seen.add(key);
        skills.push(skill);
        added += 1;
      }
    }

    if (skills.length > 0) {
      sections.push({ sectionName: output.section_name_options[0], skills });
    }
  }

  return sections;
}

/* ------------------------------- Experience ------------------------------- */

export type ResolvedTitle = {
  rank: string;
  specialization: string;
  function: string;
  areasOfEmphasis: string;
};

export type ResolvedJob = {
  mappingId: string;
  title: ResolvedTitle;
  bullets: Record<string, string>;
};

export type ResolvedAdjunct = {
  mappingId: string;
  areasOfEmphasis: [string, string];
  courseTopics3: string[];
  courseTopics4: string[];
};

export type ResolvedExperience = {
  job1: ResolvedJob;
  job2: ResolvedJob;
  job3: ResolvedJob;
  adjunct: ResolvedAdjunct;
};

const ADJUNCT_MAPPING_ID = 'education_instruction';
const EXPERIENCE_FALLBACK_IDS = ['full_stack_engineering', 'software_engineering_core'];

/** Template experience placeholders mapped to the bullet_fragments bank key. */
const EXPERIENCE_PLACEHOLDER_TO_BANK: Record<string, string> = {
  initiative_type: 'initiative_type',
  job_relevant_solutions: 'job_relevant_solutions',
  technical_capabilities: 'technical_capabilities',
  strategic_outcomes: 'strategic_outcomes',
  action: 'action_verbs',
  solution_or_initiative: 'solution_or_initiative',
  technical_or_business_result: 'technical_or_business_result',
  job_relevant_technologies: 'job_relevant_technologies',
  measurable_impact: 'measurable_impact',
  scope_or_stakeholders: 'scope_or_stakeholders',
  solution_or_process: 'solution_or_initiative',
  action_or_implementation: 'action_verbs',
  resulting_capability: 'strategic_outcomes',
  users_or_stakeholders: 'scope_or_stakeholders',
  initiative_or_responsibility: 'initiative_type',
  scope_or_team: 'scope_or_stakeholders',
  action_result: 'technical_or_business_result',
  solution_or_capability: 'solution_or_initiative',
  problem_or_requirement: 'job_relevant_solutions',
  business_or_technical_outcome: 'strategic_outcomes',
};

const EXPERIENCE_JOB_PLACEHOLDERS: Record<'job1' | 'job2' | 'job3', string[]> = {
  job1: [
    'initiative_type',
    'job_relevant_solutions',
    'technical_capabilities',
    'strategic_outcomes',
    'action',
    'solution_or_initiative',
    'technical_or_business_result',
    'job_relevant_technologies',
    'measurable_impact',
    'scope_or_stakeholders',
  ],
  job2: [
    'solution_or_process',
    'action_or_implementation',
    'job_relevant_technologies',
    'resulting_capability',
    'measurable_impact',
    'users_or_stakeholders',
    'initiative_or_responsibility',
    'scope_or_team',
    'technical_capabilities',
    'action_result',
  ],
  job3: [
    'solution_or_capability',
    'job_relevant_technologies',
    'problem_or_requirement',
    'measurable_impact',
    'business_or_technical_outcome',
    'action',
    'solution_or_initiative',
    'technical_or_business_result',
    'technical_capabilities',
    'scope_or_stakeholders',
  ],
};

function experienceMappingById(id: string): ExperienceMapping | undefined {
  return experienceMappingLibrary.experience_section_mapping_library.mappings.find((m) => m.id === id);
}

function pickFragment(bank: Record<string, string[]>, key: string, index: number): string {
  const values = bank[key];
  if (!values || values.length === 0) return '';
  return values[index % values.length];
}

function buildJobBullets(mapping: ExperienceMapping, placeholders: string[]): Record<string, string> {
  const bank = mapping.bullet_fragments;
  const bankUsage = new Map<string, number>();
  const bullets: Record<string, string> = {};

  for (const placeholder of placeholders) {
    const bankKey = EXPERIENCE_PLACEHOLDER_TO_BANK[placeholder] ?? placeholder;
    const used = bankUsage.get(bankKey) ?? 0;
    bullets[placeholder] = pickFragment(bank, bankKey, used);
    bankUsage.set(bankKey, used + 1);
  }

  return bullets;
}

function buildTitle(mapping: ExperienceMapping, rank: string): ResolvedTitle {
  const tc = mapping.title_components;
  return {
    rank,
    specialization: tc?.specialization_options[0] ?? '',
    function: tc?.function_options[0] ?? 'Engineer',
    areasOfEmphasis: (tc?.areas_of_emphasis_options ?? []).slice(0, 2).join(', '),
  };
}

export function selectActiveExperienceMappings(signals: JobPostingSignals): ScoredMapping<ExperienceMapping>[] {
  const lib = experienceMappingLibrary.experience_section_mapping_library;
  return selectActive(
    lib.mappings.filter((m) => m.id !== ADJUNCT_MAPPING_ID),
    signals,
    lib.selection_logic.score_formula,
    lib.selection_logic.minimum_score_to_activate_mapping,
    (m) => m.mapping_priority,
  );
}

export function resolveExperience(signals: JobPostingSignals): ResolvedExperience {
  const lib = experienceMappingLibrary.experience_section_mapping_library;
  const ranks = lib.shared_rank_terms;
  const active = selectActiveExperienceMappings(signals).map((entry) => entry.mapping);

  // Build an ordered list of three distinct technical mappings, falling back to
  // foundational mappings so all three slots are always filled.
  const ordered: ExperienceMapping[] = [...active];
  for (const fallbackId of EXPERIENCE_FALLBACK_IDS) {
    if (ordered.length >= 3) break;
    const fallback = experienceMappingById(fallbackId);
    if (fallback && !ordered.some((m) => m.id === fallback.id)) ordered.push(fallback);
  }
  while (ordered.length < 3 && ordered.length > 0) ordered.push(ordered[ordered.length - 1]);

  const job1Mapping = ordered[0];
  const job2Mapping = ordered[1] ?? ordered[0];
  const job3Mapping = ordered[2] ?? ordered[ordered.length - 1];

  const adjunctMapping = experienceMappingById(ADJUNCT_MAPPING_ID);
  const adjunctAreas = adjunctMapping?.title_components?.areas_of_emphasis_options ?? [];
  const courseTopics = adjunctMapping?.bullet_fragments['course_topics_relevant'] ?? [];
  const peopleTopics = adjunctMapping?.bullet_fragments['people_skill_topics'] ?? [];

  return {
    job1: {
      mappingId: job1Mapping.id,
      title: buildTitle(job1Mapping, ranks.top[0]),
      bullets: buildJobBullets(job1Mapping, EXPERIENCE_JOB_PLACEHOLDERS.job1),
    },
    job2: {
      mappingId: job2Mapping.id,
      title: buildTitle(job2Mapping, ranks.medium[0]),
      bullets: buildJobBullets(job2Mapping, EXPERIENCE_JOB_PLACEHOLDERS.job2),
    },
    job3: {
      mappingId: job3Mapping.id,
      title: buildTitle(job3Mapping, ranks.low[0]),
      bullets: buildJobBullets(job3Mapping, EXPERIENCE_JOB_PLACEHOLDERS.job3),
    },
    adjunct: {
      mappingId: ADJUNCT_MAPPING_ID,
      areasOfEmphasis: [adjunctAreas[0] ?? 'Technical Instruction', adjunctAreas[1] ?? 'Project-Based Learning'],
      courseTopics3: courseTopics.slice(0, 3),
      courseTopics4: [...courseTopics.slice(3, 7), ...peopleTopics].slice(0, 4),
    },
  };
}

/* -------------------------------- Projects -------------------------------- */

export type ResolvedProjectName = {
  scope: string;
  type: string;
  primaryCapability: string;
  strategicOutcome: string;
};

export type ResolvedProject = {
  mappingId: string;
  name: ResolvedProjectName;
  bullets: Record<string, string>;
};

export type ResolvedProjects = {
  project1: ResolvedProject;
  project2: ResolvedProject;
  project3: ResolvedProject;
};

const PROJECT_BULLET_PLACEHOLDERS: Record<'designed' | 'modernized', string[]> = {
  designed: ['project_solution', 'job_relevant_technologies', 'new_capability', 'measurable_impact'],
  modernized: ['existing_system_or_process', 'technical_approach', 'performance_or_business_metric', 'measurable_impact'],
};

function buildProjectName(mapping: ProjectMapping, scope: string): ResolvedProjectName {
  const nc = mapping.name_components;
  return {
    scope,
    type: nc.project_type_options[0] ?? '',
    primaryCapability: nc.primary_capability_options[0] ?? '',
    strategicOutcome: nc.strategic_outcome_options[0] ?? '',
  };
}

function buildProjectBullets(mapping: ProjectMapping, shape: 'designed' | 'modernized'): Record<string, string> {
  const bank = mapping.bullet_fragments;
  const bankUsage = new Map<string, number>();
  const bullets: Record<string, string> = {};
  for (const placeholder of PROJECT_BULLET_PLACEHOLDERS[shape]) {
    const used = bankUsage.get(placeholder) ?? 0;
    bullets[placeholder] = pickFragment(bank, placeholder, used);
    bankUsage.set(placeholder, used + 1);
  }
  return bullets;
}

export function selectActiveProjectMappings(signals: JobPostingSignals): ScoredMapping<ProjectMapping>[] {
  const lib = projectMappingLibrary.project_section_mapping_library;
  return selectActive(
    lib.mappings,
    signals,
    lib.selection_logic.score_formula,
    lib.selection_logic.minimum_score_to_activate_mapping,
    (m) => m.mapping_priority,
  );
}

export function resolveProjects(signals: JobPostingSignals): ResolvedProjects {
  const lib = projectMappingLibrary.project_section_mapping_library;
  const scopes = lib.shared_scope_terms;
  const active = selectActiveProjectMappings(signals).map((entry) => entry.mapping);

  const all = lib.mappings;
  const pool = active.length > 0 ? [...active] : [...all];

  // project1 (Mutual of Omaha): top technical mapping.
  const project1Mapping = pool[0] ?? all[0];
  const used = new Set<string>([project1Mapping.id]);

  // project2 / project3 (Metropolitan College): prefer teaching-oriented mappings
  // (preferred_slots include project2/project3), else fall back to next pool entry.
  function takeCollegeMapping(slot: string): ProjectMapping {
    const preferred = pool.find((m) => !used.has(m.id) && (m.preferred_slots ?? []).includes(slot));
    if (preferred) {
      used.add(preferred.id);
      return preferred;
    }
    const next = pool.find((m) => !used.has(m.id));
    if (next) {
      used.add(next.id);
      return next;
    }
    // Fewer than three activated: reuse is permitted.
    return project1Mapping;
  }

  const project2Mapping = takeCollegeMapping('project2');
  const project3Mapping = takeCollegeMapping('project3');

  return {
    project1: {
      mappingId: project1Mapping.id,
      name: buildProjectName(project1Mapping, scopes[0]),
      bullets: buildProjectBullets(project1Mapping, 'designed'),
    },
    project2: {
      mappingId: project2Mapping.id,
      name: buildProjectName(project2Mapping, scopes[1] ?? scopes[0]),
      bullets: buildProjectBullets(project2Mapping, 'modernized'),
    },
    project3: {
      mappingId: project3Mapping.id,
      name: buildProjectName(project3Mapping, scopes[2] ?? scopes[0]),
      bullets: buildProjectBullets(project3Mapping, 'modernized'),
    },
  };
}
