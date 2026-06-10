import mammoth from 'mammoth';
import { DocxDocument } from './docxEditor';
import { extractSkills } from './extractSkills';
import type { ParsedResume, ResumeBullet } from './types';

// Heading text (lower-cased) → canonical section key. Lets "Profile"/"Objective"
// map to the summary section without absorbing the document header.
const SECTION_HEADER_ALIASES: Record<string, string> = {
  summary: 'summary',
  profile: 'summary',
  objective: 'summary',
  'professional summary': 'summary',
  skills: 'skills',
  'technical skills': 'skills',
  experience: 'experience',
  'work experience': 'experience',
  'professional experience': 'experience',
  projects: 'projects',
  education: 'education',
  certifications: 'certifications',
};

// Everything before the first recognized section heading (name, contact info,
// links) lives in this region. It is never rewritten, reordered, or merged into
// the summary.
const HEADER_SECTION = 'header';

function resolveSectionKey(line: string): string | null {
  const maybe = line.trim().toLowerCase().replace(/:$/, '');
  if (!maybe) return null;
  return SECTION_HEADER_ALIASES[maybe] ?? null;
}

export async function parseResume(input: { buffer: Buffer; filename: string }): Promise<ParsedResume> {
  if (input.filename.toLowerCase().endsWith('.docx')) {
    const doc = DocxDocument.fromBuffer(input.buffer);
    if (doc) {
      return parseFromDocx(doc);
    }
  }

  const rawText = await readResumeText(input.buffer, input.filename);
  const sections = splitSections(rawText);
  const bullets: ResumeBullet[] = [];

  for (const [section, lines] of Object.entries(sections)) {
    if (section === HEADER_SECTION) continue;
    for (const line of lines) {
      if (!line.trim()) continue;
      const normalized = line.replace(/^[-*•]\s*/, '').trim();
      if (line.match(/^[-*•]\s+/) || section === 'experience' || section === 'projects') {
        bullets.push({
          text: normalized,
          section,
          detectedSkills: extractSkills(normalized),
        });
      }
    }
  }

  return { rawText, sections, bullets };
}

/**
 * Parse a DOCX while keeping a back-reference (block id) to each source
 * paragraph, so the renderer can edit text in place and preserve formatting.
 */
function parseFromDocx(doc: DocxDocument): ParsedResume {
  const paragraphs = doc.getParagraphs();
  const sections: Record<string, string[]> = {};
  const sectionBlocks: Record<string, number[]> = {};
  const bullets: ResumeBullet[] = [];
  // Start in the header region so the name/contact block is never treated as
  // summary content.
  let current = HEADER_SECTION;

  for (const paragraph of paragraphs) {
    const line = paragraph.text;
    const resolved = resolveSectionKey(line);
    if (resolved) {
      current = resolved;
      sections[current] ??= [];
      sectionBlocks[current] ??= [];
      continue;
    }

    sections[current] ??= [];
    sectionBlocks[current] ??= [];
    sectionBlocks[current].push(paragraph.id);
    if (line.trim()) {
      sections[current].push(line.trim());
    }

    if (current === HEADER_SECTION) continue;

    const normalized = line.replace(/^[-*•]\s*/, '').trim();
    if (normalized && (line.match(/^[-*•]\s+/) || current === 'experience' || current === 'projects')) {
      bullets.push({
        text: normalized,
        section: current,
        detectedSkills: extractSkills(normalized),
        sourceBlockId: paragraph.id,
      });
    }
  }

  const rawText = paragraphs.map((paragraph) => paragraph.text).join('\n');
  return { rawText, sections, bullets, docx: doc, sectionBlocks };
}

async function readResumeText(buffer: Buffer, filename: string): Promise<string> {
  if (filename.toLowerCase().endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  return buffer.toString('utf8');
}

function splitSections(rawText: string): Record<string, string[]> {
  const lines = rawText.split(/\r?\n/);
  const output: Record<string, string[]> = {};
  // Pre-heading content (name/contact) starts in the header region.
  let current = HEADER_SECTION;

  for (const line of lines) {
    const resolved = resolveSectionKey(line);
    if (resolved) {
      current = resolved;
      output[current] ??= [];
      continue;
    }

    output[current] ??= [];
    output[current].push(line);
  }

  return output;
}
