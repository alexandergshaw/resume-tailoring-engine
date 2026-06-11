import { DocxDocument } from '../docxEditor';
import {
  resolveExperience,
  resolveProjects,
  resolveSkillsSections,
  type JobPostingSignals,
  type ResolvedExperience,
  type ResolvedProjects,
  type ResolvedSkillSection,
} from './selectMappings';

/**
 * Fixed candidate facts. These never change between postings; only the
 * descriptive wording around them is tailored. profileEvidence gates the
 * insertion of concrete protected skills (see PROTECTED_SKILL_TERMS).
 */
export const CANDIDATE_PROFILE = {
  yearsOfExperience: '7',
  userScale: '10,000+',
  eventScale: '75,000+',
  defaultEnvironment: 'enterprise',
  profileEvidence: [
    'React',
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
    'REST APIs',
    'Git',
    'GitHub',
    'Jira',
    'Docker',
    'AWS',
    'Microsoft Teams',
    'Zoom',
    'Google Workspace',
    'Excel',
  ],
} as const;

type Section = 'header' | 'summary' | 'experience' | 'projects' | 'skills' | 'education';
type ExperienceSlot = 'job1' | 'job2' | 'job3' | 'adjunct';
type ProjectSlot = 'project1' | 'project2' | 'project3';

const SECTION_HEADINGS: Record<string, Section> = {
  summary: 'summary',
  'professional experience': 'experience',
  experience: 'experience',
  projects: 'projects',
  skills: 'skills',
  education: 'education',
};

const SKILL_CATEGORY_TOKENS = [
  'Role-Specific Expertise',
  'Core Professional Capabilities',
  'Methods, Systems & Technologies',
  'Leadership, Delivery & Collaboration',
  'Supporting Tools & Knowledge',
];

const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}|\{\s*([^{}]+?)\s*\}/g;

function ensureSignals(signals: JobPostingSignals): JobPostingSignals {
  return {
    ...signals,
    profileEvidence: signals.profileEvidence ?? [...CANDIDATE_PROFILE.profileEvidence],
  };
}

/** Splits a flat skill list into exactly two comma-separated lines. */
function toTwoLines(skills: string[]): [string, string] {
  if (skills.length === 0) return ['', ''];
  const mid = Math.ceil(skills.length / 2);
  return [skills.slice(0, mid).join(', '), skills.slice(mid).join(', ')];
}

/**
 * Builds the flat, globally-unique summary placeholder map. Repeated section
 * placeholders (experience/project/skills) are resolved positionally during the
 * document walk, not here.
 */
export function buildPlaceholderMap(rawSignals: JobPostingSignals): Record<string, string> {
  const signals = ensureSignals(rawSignals);
  const experience = resolveExperience(signals);
  const skills = resolveSkillsSections(signals);

  const job1 = experience.job1;
  const primaryFunction = `${job1.title.specialization} ${job1.title.function}`.trim();
  const techPool = skills.flatMap((section) => section.skills);
  const jobRelevantTech = techPool.slice(0, 6).join(', ');
  const environment = rawSignals.domains?.[0] ?? CANDIDATE_PROFILE.defaultEnvironment;

  return {
    RANK: job1.title.rank,
    PRIMARY_FUNCTION: primaryFunction || 'Software Engineer',
    YEARS_OF_EXPERIENCE: CANDIDATE_PROFILE.yearsOfExperience,
    SCALE_DESCRIPTOR: 'enterprise-scale',
    SOLUTION_TYPES: job1.bullets.job_relevant_solutions || 'enterprise applications',
    USER_SCALE: CANDIDATE_PROFILE.userScale,
    EVENT_SCALE: CANDIDATE_PROFILE.eventScale,
    ENVIRONMENT_TYPES: environment,
    LEADERSHIP_LEVEL: 'Proven track record',
    LEADERSHIP_SCOPE: 'cross-functional engineering teams',
    LEADERSHIP_CAPABILITIES: 'mentorship, technical direction, and delivery coordination',
    JOB_RELEVANT_TECHNOLOGIES: jobRelevantTech || job1.bullets.job_relevant_technologies || 'modern application frameworks',
    TECHNICAL_CAPABILITIES: job1.bullets.technical_capabilities || 'technical solution design',
    DELIVERY_PRACTICES: 'Agile delivery, code reviews, and CI/CD',
    DOMAIN_CAPABILITIES: job1.bullets.strategic_outcomes || 'operational efficiency',
  };
}

function isHeading(text: string): Section | null {
  const key = text.trim().replace(/[#*]/g, '').trim().toLowerCase();
  return SECTION_HEADINGS[key] ?? null;
}

type WalkState = {
  section: Section;
  expSlot: ExperienceSlot | null;
  projSlot: ProjectSlot | null;
  curSkill: ResolvedSkillSection | null;
  projPointer: number;
  skillPointer: number;
};

function makeResolver(
  state: WalkState,
  summaryMap: Record<string, string>,
  experience: ResolvedExperience,
  projects: ResolvedProjects,
) {
  // Per-paragraph occurrence counters (e.g. two "{Area of Emphasis}" tokens).
  const occ = new Map<string, number>();
  const nextOcc = (key: string): number => {
    const i = occ.get(key) ?? 0;
    occ.set(key, i + 1);
    return i;
  };

  return function resolve(name: string): string | null {
    const upper = name.toUpperCase();
    const lower = name.toLowerCase();

    if (/^2 lines/i.test(name)) {
      return state.curSkill ? toTwoLines(state.curSkill.skills).join('\n') : '';
    }
    const category = SKILL_CATEGORY_TOKENS.find((c) => name.includes(c));
    if (category) return state.curSkill?.sectionName ?? category;

    if (lower === 'top rank' || lower === 'medium rank' || lower === 'low rank') {
      return state.expSlot && state.expSlot !== 'adjunct' ? experience[state.expSlot].title.rank : null;
    }
    if (lower === 'specialization') {
      return state.expSlot && state.expSlot !== 'adjunct' ? experience[state.expSlot].title.specialization : null;
    }
    if (lower === 'function') {
      return state.expSlot && state.expSlot !== 'adjunct' ? experience[state.expSlot].title.function : null;
    }
    if (lower === 'areas of emphasis') {
      return state.expSlot && state.expSlot !== 'adjunct' ? experience[state.expSlot].title.areasOfEmphasis : null;
    }
    if (lower === 'area of emphasis') {
      return experience.adjunct.areasOfEmphasis[nextOcc('area_of_emphasis')] ?? '';
    }
    if (/^list of 3/i.test(name)) return experience.adjunct.courseTopics3.join(', ');
    if (/^list of 4/i.test(name)) return experience.adjunct.courseTopics4.join(', ');

    if (state.section === 'projects' && state.projSlot) {
      const project = projects[state.projSlot];
      if (upper === 'PROJECT_SCOPE') return project.name.scope;
      if (upper === 'PROJECT_TYPE') return project.name.type;
      if (upper === 'PRIMARY_CAPABILITY') return project.name.primaryCapability;
      if (upper === 'STRATEGIC_OUTCOME') return project.name.strategicOutcome;
      const bullet = project.bullets[lower];
      if (bullet !== undefined) return bullet;
    }

    if (state.section === 'experience' && state.expSlot && state.expSlot !== 'adjunct') {
      const bullet = experience[state.expSlot].bullets[lower];
      if (bullet !== undefined) return bullet;
    }

    if (summaryMap[upper] !== undefined) return summaryMap[upper];

    return null;
  };
}

/**
 * Fills a resume TEMPLATE DOCX whose paragraphs contain {{PLACEHOLDER}} (and
 * single-brace {Placeholder}) tokens, using deterministic mappings selected from
 * the job posting. Formatting is preserved (only paragraph text is rewritten).
 *
 * Unknown placeholders are left untouched (so unmapped tokens stay visible);
 * known-but-empty placeholders are replaced with an empty string.
 */
export function fillTemplateDocx(templateBuffer: Buffer, rawSignals: JobPostingSignals): Buffer {
  const doc = DocxDocument.fromBuffer(templateBuffer);
  if (!doc) throw new Error('Template is not a readable .docx file.');

  const signals = ensureSignals(rawSignals);
  const summaryMap = buildPlaceholderMap(signals);
  const experience = resolveExperience(signals);
  const projects = resolveProjects(signals);
  const skills = resolveSkillsSections(signals);

  const state: WalkState = {
    section: 'header',
    expSlot: null,
    projSlot: null,
    curSkill: null,
    projPointer: 0,
    skillPointer: 0,
  };

  const projectSlots: ProjectSlot[] = ['project1', 'project2', 'project3'];

  for (const { id, text } of doc.getParagraphs()) {
    const heading = isHeading(text);
    if (heading && !text.includes('{')) {
      state.section = heading;
      state.expSlot = null;
      state.projSlot = null;
      state.curSkill = null;
      continue;
    }

    if (!text.includes('{')) continue;

    if (state.section === 'experience') {
      if (text.includes('{{Top Rank}}')) state.expSlot = 'job1';
      else if (text.includes('{{Medium Rank}}')) state.expSlot = 'job2';
      else if (text.includes('{{Low Rank}}')) state.expSlot = 'job3';
      else if (/adjunct/i.test(text)) state.expSlot = 'adjunct';
    }

    if (state.section === 'projects' && text.includes('{{PROJECT_SCOPE}}')) {
      state.projSlot = projectSlots[Math.min(state.projPointer, projectSlots.length - 1)];
      state.projPointer += 1;
    }

    if (state.section === 'skills' && SKILL_CATEGORY_TOKENS.some((c) => text.includes(c))) {
      state.curSkill = skills[state.skillPointer] ?? null;
      state.skillPointer += 1;
    }

    const resolve = makeResolver(state, summaryMap, experience, projects);
    const newText = text.replace(TOKEN_RE, (full, dbl?: string, sgl?: string) => {
      const tokenName = dbl ?? sgl ?? '';
      const value = resolve(tokenName);
      return value === null ? full : value;
    });

    if (newText !== text) doc.setText(id, newText);
  }

  return doc.toBuffer();
}
