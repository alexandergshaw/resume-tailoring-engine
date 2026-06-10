import mammoth from 'mammoth';
import { DocxDocument } from './docxEditor';
import { extractSkills } from './extractSkills';
import type { ParsedResume, ResumeBullet } from './types';

const SECTION_HEADERS = ['summary', 'skills', 'experience', 'projects', 'education', 'certifications'];

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
  let current = 'summary';

  for (const paragraph of paragraphs) {
    const line = paragraph.text;
    const maybe = line.trim().toLowerCase().replace(/:$/, '');
    if (SECTION_HEADERS.includes(maybe)) {
      current = maybe;
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
  let current = 'summary';

  for (const line of lines) {
    const maybe = line.trim().toLowerCase().replace(/:$/, '');
    if (SECTION_HEADERS.includes(maybe)) {
      current = maybe;
      output[current] ??= [];
      continue;
    }

    output[current] ??= [];
    output[current].push(line);
  }

  return output;
}
