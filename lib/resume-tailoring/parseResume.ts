import mammoth from 'mammoth';
import { extractSkills } from './extractSkills';
import type { ParsedResume, ResumeBullet } from './types';

const SECTION_HEADERS = ['summary', 'skills', 'experience', 'projects', 'education', 'certifications'];

export async function parseResume(input: { buffer: Buffer; filename: string }): Promise<ParsedResume> {
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
