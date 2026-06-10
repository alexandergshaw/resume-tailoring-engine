import type { AggressivenessLevel } from './types';

export type AggressivenessConfig = {
  reorderSections: boolean;
  reorderBullets: boolean;
  reorderSkills: boolean;
  removeLowRelevanceBullets: boolean;
  projectSwaps: boolean;
  minBulletScore: number;
  summaryStrategy: 'preserve' | 'prioritize_keywords' | 'maximize_relevance';
  maxChangeRatio: number;
};

export const AGGRESSIVENESS_CONFIG: Record<AggressivenessLevel, AggressivenessConfig> = {
  conservative: {
    reorderSections: false,
    reorderBullets: false,
    reorderSkills: true,
    removeLowRelevanceBullets: false,
    projectSwaps: false,
    minBulletScore: 0,
    summaryStrategy: 'preserve',
    maxChangeRatio: 0.15,
  },
  balanced: {
    reorderSections: false,
    reorderBullets: true,
    reorderSkills: true,
    removeLowRelevanceBullets: true,
    projectSwaps: true,
    minBulletScore: 1,
    summaryStrategy: 'prioritize_keywords',
    maxChangeRatio: 0.35,
  },
  aggressive: {
    reorderSections: true,
    reorderBullets: true,
    reorderSkills: true,
    removeLowRelevanceBullets: true,
    projectSwaps: true,
    minBulletScore: 2,
    summaryStrategy: 'maximize_relevance',
    maxChangeRatio: 0.5,
  },
  max: {
    reorderSections: true,
    reorderBullets: true,
    reorderSkills: true,
    removeLowRelevanceBullets: true,
    projectSwaps: true,
    minBulletScore: 2,
    summaryStrategy: 'maximize_relevance',
    maxChangeRatio: 0.65,
  },
};
