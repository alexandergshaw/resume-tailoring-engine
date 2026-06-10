import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { DocxDocument } from './docxEditor';
import type { ScoredBullet } from './types';

type RenderInput = {
  templateBuffer?: Buffer;
  header?: string[];
  summary: string;
  skills: string[];
  experienceBullets: string[];
  projects: string[];
  education: string;
  sectionOrder?: string[];
};

const DEFAULT_SECTION_ORDER = ['summary', 'skills', 'experience', 'projects', 'education'];

type InPlaceInput = {
  doc: DocxDocument;
  selected: ScoredBullet[];
  summaryText?: string;
  summaryBlockId?: number;
  appendSkills?: string[];
  skillsBlockId?: number;
};

/**
 * Renders a tailored resume by editing the uploaded DOCX in place rather than
 * regenerating it. This preserves the source document's formatting and styling
 * (fonts, headings, bullet/number styles, spacing, tables) because the original
 * OOXML parts are kept verbatim and only paragraph text is mutated.
 *
 * Tailoring is strictly additive: no paragraph is ever removed or reordered.
 * Only the text within existing paragraphs is enriched with job-posting
 * terminology, so the candidate's full history and the document layout survive.
 */
export function renderInPlace(input: InPlaceInput): Buffer {
  const { doc } = input;

  // 1. Update enriched bullet text (keyword insertion / terminology) in place.
  for (const bullet of input.selected) {
    if (bullet.sourceBlockId === undefined) continue;
    if (doc.getText(bullet.sourceBlockId) !== bullet.text) {
      doc.setText(bullet.sourceBlockId, bullet.text);
    }
  }

  // 2. Optionally rewrite the summary paragraph (enriched, never the header).
  if (input.summaryText !== undefined && input.summaryBlockId !== undefined) {
    doc.setText(input.summaryBlockId, input.summaryText);
  }

  // 3. Append job-posting skills to the existing skills paragraph, preserving
  //    the original skills and their formatting.
  if (input.appendSkills && input.appendSkills.length > 0 && input.skillsBlockId !== undefined) {
    const existing = doc.getText(input.skillsBlockId).trim();
    const merged = existing ? `${existing}, ${input.appendSkills.join(', ')}` : input.appendSkills.join(', ');
    doc.setText(input.skillsBlockId, merged);
  }

  return doc.toBuffer();
}

export function renderDocx(input: RenderInput): Buffer {
  if (input.templateBuffer) {
    try {
      const zip = new PizZip(input.templateBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      doc.render({
        SUMMARY: input.summary,
        SKILLS: input.skills.join(', '),
        EXPERIENCE_BULLETS: input.experienceBullets.join('\n'),
        PROJECTS: input.projects.join('\n'),
        EDUCATION: input.education,
      });
      return doc.getZip().generate({ type: 'nodebuffer' });
    } catch {
      // fall through to default renderer
    }
  }

  return buildDefaultDocx(input);
}

function buildDefaultDocx(input: RenderInput): Buffer {
  const order = input.sectionOrder ?? DEFAULT_SECTION_ORDER;
  const sectionContent: Record<string, { heading: string; lines: string[] }> = {
    summary: { heading: 'Summary', lines: input.summary ? [input.summary] : [] },
    skills: { heading: 'Skills', lines: input.skills.length > 0 ? [input.skills.join(', ')] : [] },
    experience: { heading: 'Experience', lines: input.experienceBullets },
    projects: { heading: 'Projects', lines: input.projects },
    education: { heading: 'Education', lines: input.education ? [input.education] : [] },
  };

  const paragraphs: string[] = [];
  // Render the header (name/contact) as a leading block, not under a heading.
  for (const line of input.header ?? []) {
    if (line.trim()) paragraphs.push(bodyParagraph(line));
  }
  for (const key of order) {
    const section = sectionContent[key];
    if (!section || section.lines.length === 0) continue;
    paragraphs.push(headingParagraph(section.heading));
    for (const line of section.lines) {
      paragraphs.push(bodyParagraph(line));
    }
  }

  if (paragraphs.length === 0) {
    paragraphs.push(headingParagraph('Tailored Resume'));
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join('')}<w:sectPr/></w:body></w:document>`;

  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', ROOT_RELS_XML);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS_XML);
  return zip.generate({ type: 'nodebuffer' });
}

function headingParagraph(text: string): string {
  return `<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function bodyParagraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
