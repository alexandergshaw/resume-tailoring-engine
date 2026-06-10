import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { DocxDocument } from './docxEditor';
import type { ScoredBullet } from './types';

type RenderInput = {
  templateBuffer?: Buffer;
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
  rejected: ScoredBullet[];
  summaryText?: string;
  summaryBlockId?: number;
  skillsText?: string;
  skillsBlockId?: number;
};

/**
 * Renders a tailored resume by editing the uploaded DOCX in place rather than
 * regenerating it. This preserves the source document's formatting and styling
 * (fonts, headings, bullet/number styles, spacing, tables) because the original
 * OOXML parts are kept verbatim and only paragraph text is mutated.
 *
 * Note: section-level reordering is intentionally NOT applied here. Moving whole
 * heading+content groups in place is high-risk for layout fidelity, and the goal
 * is strict adherence to the original formatting. Bullets are still reordered
 * within their section and low-relevance bullets removed.
 */
export function renderInPlace(input: InPlaceInput): Buffer {
  const { doc } = input;

  // 1. Update rewritten bullet text (e.g. claim expansion) in place.
  for (const bullet of input.selected) {
    if (bullet.sourceBlockId === undefined) continue;
    if (doc.getText(bullet.sourceBlockId) !== bullet.text) {
      doc.setText(bullet.sourceBlockId, bullet.text);
    }
  }

  // 2. Remove dropped (rejected) bullets.
  for (const bullet of input.rejected) {
    if (bullet.sourceBlockId !== undefined) {
      doc.remove(bullet.sourceBlockId);
    }
  }

  // 3. Reorder retained bullets within each section (by their selected order).
  for (const section of ['experience', 'projects']) {
    const orderedIds = input.selected
      .filter((bullet) => bullet.section === section && bullet.sourceBlockId !== undefined)
      .map((bullet) => bullet.sourceBlockId as number);
    if (orderedIds.length > 1) {
      doc.reorder(orderedIds);
    }
  }

  // 4. Optionally rewrite summary / skills text in their original paragraphs.
  if (input.summaryText !== undefined && input.summaryBlockId !== undefined) {
    doc.setText(input.summaryBlockId, input.summaryText);
  }
  if (input.skillsText !== undefined && input.skillsBlockId !== undefined) {
    doc.setText(input.skillsBlockId, input.skillsText);
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
