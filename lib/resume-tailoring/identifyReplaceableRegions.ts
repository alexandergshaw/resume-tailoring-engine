/**
 * First-pass region classifier for the destructive "top" tailoring level.
 *
 * Walks the parsed resume and flags only high-value TERMINOLOGY regions that are
 * safe to replace wholesale: job titles, skill-category labels, and individual
 * skill items. These carry no factual claims, so swapping their wording for
 * posting-aligned terminology does not misrepresent the candidate.
 *
 * HARD EXCLUSIONS (never replaceable): the document header (name/contact), and
 * anything matching the shared factual-claim protection (employers, dates,
 * metrics, credentials, compensation, locations) via isProtected(). Experience
 * and project BULLET sentences are also excluded — only the title line of an
 * experience entry is a candidate, never the achievement bullets.
 *
 * Deterministic: relies on section structure + light heuristics, so it needs no
 * model and never throws.
 */
import { isProtected } from './claimExpansion';
import type { ParsedResume } from './types';

export type RegionKind = 'job_title' | 'skill_category_label' | 'skill_item';

export type ReplaceableRegion = {
  blockId: number;
  kind: RegionKind;
  originalText: string;
  charCount: number;
  lineCount: number;
  // Present for sub-span regions (e.g. one skill item inside a comma list).
  start?: number;
  end?: number;
};

const HEADER_SECTION = 'header';

// A skills line shaped like "Languages: Python, Go" → label + items.
const CATEGORY_LABEL_RE = /^([A-Z][A-Za-z /&+-]{1,30}):\s*(.*)$/;

// Looks like a role/title rather than an achievement sentence: contains a title
// noun, is short, and does not read as an accomplishment.
const TITLE_LIKE_RE = /\b(engineer|developer|manager|architect|analyst|designer|consultant|administrator|lead|director|specialist|scientist|intern)\b/i;

// Achievement bullets typically begin with a past-tense action verb; titles do
// not. Used to avoid misclassifying a bullet as a title.
const ACTION_VERB_START = /^(led|built|designed|developed|created|managed|delivered|implemented|drove|owned|launched|improved|increased|reduced|architected|engineered|maintained|supported|collaborated|spearheaded|oversaw|coordinated|established|optimized|automated|migrated|deployed|analyzed|researched|wrote|tested|monitored|orchestrated|mentored|guided|built|handled|performed)\b/i;

export function identifyReplaceableRegions(parsed: ParsedResume): ReplaceableRegion[] {
  if (!parsed.docx || !parsed.sectionBlocks) return [];

  const regions: ReplaceableRegion[] = [];
  const paragraphsById = new Map(parsed.docx.getParagraphs().map((p) => [p.id, p.text]));

  for (const [section, blockIds] of Object.entries(parsed.sectionBlocks)) {
    if (section === HEADER_SECTION) continue;

    for (const blockId of blockIds) {
      const raw = paragraphsById.get(blockId) ?? '';
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (isProtected(trimmed)) continue; // never touch factual/quantified claims

      if (section === 'skills') {
        const labelMatch = trimmed.match(CATEGORY_LABEL_RE);
        if (labelMatch) {
          const label = labelMatch[1];
          // Offsets are relative to the raw (untrimmed) paragraph text so
          // sub-span edits map correctly onto the live document text.
          const labelStart = raw.indexOf(label);
          if (labelStart >= 0) {
            regions.push(makeRegion(blockId, 'skill_category_label', label, labelStart, labelStart + label.length));
          }
        }
        // Each comma-separated skill (after any "Label:" prefix) is its own item.
        collectSkillItems(blockId, raw, regions);
        continue;
      }

      if (section === 'experience' || section === 'projects') {
        // Only a short, verb-less, title-like line qualifies — never an
        // achievement bullet (those start with an action verb / are long).
        const words = trimmed.split(/\s+/).filter(Boolean).length;
        if (
          words <= 6 &&
          !/[.]$/.test(trimmed) &&
          !/^[-*•]/.test(trimmed) &&
          !ACTION_VERB_START.test(trimmed) &&
          TITLE_LIKE_RE.test(trimmed)
        ) {
          const start = raw.indexOf(trimmed);
          regions.push(makeRegion(blockId, 'job_title', trimmed, start, start + trimmed.length));
        }
      }
    }
  }

  return regions;
}

// Splits a skills line into individual comma/•/| separated item sub-spans.
function collectSkillItems(
  blockId: number,
  rawLine: string,
  regions: ReplaceableRegion[],
): void {
  // Work on the portion after any "Label:" prefix.
  const colonIndex = rawLine.indexOf(':');
  const itemsStart = colonIndex >= 0 ? colonIndex + 1 : 0;
  const itemsText = rawLine.slice(itemsStart);

  const re = /[^,•|]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(itemsText)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length < 2) continue;
    if (isProtected(trimmed)) continue;
    const leading = raw.length - raw.trimStart().length;
    const start = itemsStart + match.index + leading;
    const end = start + trimmed.length;
    regions.push(makeRegion(blockId, 'skill_item', trimmed, start, end));
  }
}

function makeRegion(
  blockId: number,
  kind: RegionKind,
  text: string,
  start: number,
  end: number,
): ReplaceableRegion {
  return {
    blockId,
    kind,
    originalText: text,
    charCount: text.length,
    lineCount: countLines(text),
    start,
    end,
  };
}

function countLines(text: string): number {
  return text.split('\n').length;
}
