import experienceJson from './experienceMappingLibrary.json';
import projectJson from './projectMappingLibrary.json';
import skillsJson from './skillsMappingLibrary.json';
import {
  experienceMappingLibrarySchema,
  projectMappingLibrarySchema,
  skillsMappingLibrarySchema,
  type ExperienceMappingLibrary,
  type ProjectMappingLibrary,
  type SkillsMappingLibrary,
} from './schemas';
import type { z } from 'zod';

function validate<T>(schema: z.ZodType<T>, data: unknown, fileName: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') || '(root)';
    throw new Error(`Invalid ${fileName}: ${first?.message ?? 'validation failed'} at ${path}`);
  }
  return result.data;
}

export const skillsMappingLibrary: SkillsMappingLibrary = validate(
  skillsMappingLibrarySchema,
  skillsJson,
  'skillsMappingLibrary.json',
);

export const experienceMappingLibrary: ExperienceMappingLibrary = validate(
  experienceMappingLibrarySchema,
  experienceJson,
  'experienceMappingLibrary.json',
);

export const projectMappingLibrary: ProjectMappingLibrary = validate(
  projectMappingLibrarySchema,
  projectJson,
  'projectMappingLibrary.json',
);

export * from './schemas';
