import type { AggressivenessLevel } from './types';

/**
 * Tailoring is additive: no resume content is ever removed or reordered. These
 * knobs control HOW MUCH job-posting terminology is woven into the existing
 * resume, not how much is pruned. Removing content risks dropping relevant
 * experience and breaking layout; additive keyword alignment improves
 * ATS/recruiter keyword match while preserving the candidate's full, truthful
 * history and the document's formatting.
 */
export type AggressivenessConfig = {
  // Replace generic terms with the posting's terminology (e.g. developer →
  // software engineer) on non-protected lines.
  substituteTerminology: boolean;
  // Append missing job keywords to existing experience bullets.
  augmentBullets: boolean;
  // Also augment project entries (and title-like lines), not just experience.
  augmentTitlesAndProjects: boolean;
  // Append posting skills (supported by the resume) to the skills section.
  appendSkills: boolean;
  // How the summary is enriched with keywords.
  summaryStrategy: 'preserve' | 'prioritize_keywords' | 'maximize_relevance';
  // Maximum number of keywords inserted into any single bullet.
  maxInsertionsPerBullet: number;
};

export const AGGRESSIVENESS_CONFIG: Record<AggressivenessLevel, AggressivenessConfig> = {
  conservative: {
    substituteTerminology: true,
    augmentBullets: false,
    augmentTitlesAndProjects: false,
    appendSkills: true,
    summaryStrategy: 'preserve',
    maxInsertionsPerBullet: 0,
  },
  balanced: {
    substituteTerminology: true,
    augmentBullets: true,
    augmentTitlesAndProjects: false,
    appendSkills: true,
    summaryStrategy: 'prioritize_keywords',
    maxInsertionsPerBullet: 1,
  },
  aggressive: {
    substituteTerminology: true,
    augmentBullets: true,
    augmentTitlesAndProjects: true,
    appendSkills: true,
    summaryStrategy: 'maximize_relevance',
    maxInsertionsPerBullet: 1,
  },
  max: {
    substituteTerminology: true,
    augmentBullets: true,
    augmentTitlesAndProjects: true,
    appendSkills: true,
    summaryStrategy: 'maximize_relevance',
    maxInsertionsPerBullet: 2,
  },
};
