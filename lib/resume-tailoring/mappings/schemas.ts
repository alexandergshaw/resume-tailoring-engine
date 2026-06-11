import { z } from 'zod';

/**
 * Zod schemas for the three resume-tailoring mapping libraries. Validation is
 * strict on the parts the engine consumes (mappings, buzzwords, content banks,
 * score formula) and lenient on purely descriptive metadata blocks (model
 * docs, fixed_anchors prose) so future documentation tweaks never break loads.
 */

const nonEmptyString = z.string().min(1);

export const scoreFormulaSchema = z.object({
  exact_buzzword_match: z.number(),
  alias_match: z.number(),
  job_title_match: z.number(),
  required_skill_match: z.number(),
  preferred_skill_match: z.number(),
  resume_evidence_match: z.number(),
  domain_match: z.number(),
  protected_claim_conflict: z.number(),
});

export const protectedRulesSchema = z.object({
  never_insert_without_profile_evidence: z.array(z.string()),
  allowed_to_generalize: z.array(z.string()),
  preserve_aliases_if_posting_uses_them: z.boolean(),
});

/* --------------------------------- Skills --------------------------------- */

export const skillGroupSchema = z.object({
  group_name: nonEmptyString,
  skills: z.array(nonEmptyString),
});

export const skillsSectionOutputSchema = z.object({
  section_name_options: z.array(nonEmptyString).min(1),
  section_priority: z.number(),
  skill_groups: z.array(skillGroupSchema),
  summary_capability_phrases: z.array(z.string()).optional(),
});

export const skillsMappingSchema = z.object({
  id: nonEmptyString,
  buzzwords: z.array(nonEmptyString),
  skills_section_output: skillsSectionOutputSchema,
});

export const skillsSelectionLogicSchema = z.object({
  score_formula: scoreFormulaSchema,
  minimum_score_to_activate_mapping: z.number(),
  max_active_skill_sections: z.number(),
  max_groups_per_section: z.number(),
  max_skills_per_group: z.number(),
  deduplicate_skills: z.boolean(),
  prefer_posting_language_aliases: z.boolean().optional(),
  section_order_rules: z.array(z.string()).optional(),
});

export const skillsMappingLibrarySchema = z.object({
  skills_section_mapping_library: z.object({
    version: z.string(),
    purpose: z.string(),
    protected_rules: protectedRulesSchema,
    mappings: z.array(skillsMappingSchema).min(1),
    selection_logic: skillsSelectionLogicSchema,
  }),
});

/* ------------------------------- Experience ------------------------------- */

export const titleComponentsSchema = z.object({
  specialization_options: z.array(nonEmptyString),
  function_options: z.array(nonEmptyString),
  areas_of_emphasis_options: z.array(nonEmptyString),
});

const bulletFragmentsSchema = z.record(z.string(), z.array(z.string()));

export const experienceMappingSchema = z.object({
  id: nonEmptyString,
  buzzwords: z.array(nonEmptyString),
  mapping_priority: z.number(),
  applies_to: z.array(z.string()).optional(),
  title_components: titleComponentsSchema.optional(),
  bullet_fragments: bulletFragmentsSchema,
});

export const sharedRankTermsSchema = z.object({
  top: z.array(nonEmptyString).min(1),
  medium: z.array(nonEmptyString).min(1),
  low: z.array(nonEmptyString).min(1),
});

export const experienceMappingLibrarySchema = z.object({
  experience_section_mapping_library: z.object({
    version: z.string(),
    purpose: z.string(),
    protected_rules: protectedRulesSchema.loose(),
    shared_rank_terms: sharedRankTermsSchema,
    mappings: z.array(experienceMappingSchema).min(1),
    selection_logic: z.looseObject({
      score_formula: scoreFormulaSchema,
      minimum_score_to_activate_mapping: z.number(),
    }),
  }).loose(),
});

/* -------------------------------- Projects -------------------------------- */

export const projectNameComponentsSchema = z.object({
  project_type_options: z.array(nonEmptyString),
  primary_capability_options: z.array(nonEmptyString),
  strategic_outcome_options: z.array(nonEmptyString),
});

export const projectMappingSchema = z.object({
  id: nonEmptyString,
  buzzwords: z.array(nonEmptyString),
  mapping_priority: z.number(),
  preferred_slots: z.array(z.string()).optional(),
  name_components: projectNameComponentsSchema,
  bullet_fragments: bulletFragmentsSchema,
});

export const projectMappingLibrarySchema = z.object({
  project_section_mapping_library: z.object({
    version: z.string(),
    purpose: z.string(),
    protected_rules: protectedRulesSchema.loose(),
    shared_scope_terms: z.array(nonEmptyString).min(1),
    mappings: z.array(projectMappingSchema).min(1),
    selection_logic: z.looseObject({
      score_formula: scoreFormulaSchema,
      minimum_score_to_activate_mapping: z.number(),
    }),
  }).loose(),
});

/* --------------------------------- Types ---------------------------------- */

export type ScoreFormula = z.infer<typeof scoreFormulaSchema>;
export type ProtectedRules = z.infer<typeof protectedRulesSchema>;

export type SkillGroup = z.infer<typeof skillGroupSchema>;
export type SkillsMapping = z.infer<typeof skillsMappingSchema>;
export type SkillsMappingLibrary = z.infer<typeof skillsMappingLibrarySchema>;

export type TitleComponents = z.infer<typeof titleComponentsSchema>;
export type ExperienceMapping = z.infer<typeof experienceMappingSchema>;
export type ExperienceMappingLibrary = z.infer<typeof experienceMappingLibrarySchema>;

export type ProjectNameComponents = z.infer<typeof projectNameComponentsSchema>;
export type ProjectMapping = z.infer<typeof projectMappingSchema>;
export type ProjectMappingLibrary = z.infer<typeof projectMappingLibrarySchema>;
