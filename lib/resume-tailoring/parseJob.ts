import { extractSkills } from './extractSkills';
import type { ParsedJob } from './types';

const RESPONSIBILITY_PREFIX = /(responsibilities|you will|what you'll do|what you will do)/i;
const SENIORITY_PATTERNS: Exclude<ParsedJob['seniority'], 'unknown'>[] = ['junior', 'mid', 'senior', 'staff'];
const SENIORITY_REGEX: Record<Exclude<ParsedJob['seniority'], 'unknown'>, RegExp> = {
  junior: /\b(junior|entry level|associate)\b/i,
  mid: /\b(mid|intermediate|3\+ years|4\+ years)\b/i,
  senior: /\b(senior|lead|5\+ years|6\+ years)\b/i,
  staff: /\b(staff|principal|architect)\b/i,
};

export function parseJob(jobPostingText: string): ParsedJob {
  const lines = jobPostingText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const requiredSkills = collectByHint(lines, /(required|must have|minimum qualifications)/i);
  const preferredSkills = collectByHint(lines, /(preferred|nice to have|bonus)/i);
  const tools = extractSkills(jobPostingText);
  const domainKeywords = extractKeywordCandidates(jobPostingText, ['healthcare', 'finance', 'saas', 'ecommerce', 'ai']);
  const titleKeywords = extractKeywordCandidates(jobPostingText, ['engineer', 'developer', 'manager', 'architect']);
  const responsibilities = lines.filter((line) => RESPONSIBILITY_PREFIX.test(line) || line.startsWith('-')).slice(0, 12);
  const seniority = inferSeniority(jobPostingText);

  return {
    requiredSkills: uniq([...requiredSkills, ...extractSkills(requiredSkills.join(' '))]),
    preferredSkills: uniq([...preferredSkills, ...extractSkills(preferredSkills.join(' '))]),
    tools,
    domainKeywords,
    titleKeywords,
    responsibilities,
    seniority,
  };
}

function collectByHint(lines: string[], hint: RegExp): string[] {
  const candidates = lines.filter((line) => hint.test(line) || line.startsWith('-')).join(' ');
  return extractSkills(candidates);
}

function extractKeywordCandidates(text: string, words: string[]): string[] {
  const lower = text.toLowerCase();
  return words.filter((word) => lower.includes(word));
}

function inferSeniority(text: string): ParsedJob['seniority'] {
  for (const level of SENIORITY_PATTERNS) {
    if (SENIORITY_REGEX[level].test(text)) {
      return level;
    }
  }

  return 'unknown';
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}
