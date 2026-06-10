import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { renderDocx } from '@/lib/resume-tailoring/renderDocx';
import { tailorResume } from '@/lib/resume-tailoring/tailorResume';

describe('renderDocx', () => {
  it('produces a valid docx readable by mammoth with all sections', async () => {
    const buffer = renderDocx({
      summary: 'Experienced engineer',
      skills: ['React', 'AWS'],
      experienceBullets: ['Built React apps', 'Deployed to AWS'],
      projects: ['Internal tooling'],
      education: 'B.S. Computer Science',
    });

    const { value } = await mammoth.extractRawText({ buffer });
    expect(value).toContain('Experienced engineer');
    expect(value).toContain('React, AWS');
    expect(value).toContain('Built React apps');
    expect(value).toContain('Internal tooling');
    expect(value).toContain('B.S. Computer Science');
  });

  it('honors a custom section order', async () => {
    const buffer = renderDocx({
      summary: 'Summary text',
      skills: ['React'],
      experienceBullets: ['Experience line'],
      projects: [],
      education: 'Education line',
      sectionOrder: ['skills', 'experience', 'summary', 'education'],
    });

    const { value } = await mammoth.extractRawText({ buffer });
    const skillsIndex = value.indexOf('React');
    const summaryIndex = value.indexOf('Summary text');
    expect(skillsIndex).toBeGreaterThanOrEqual(0);
    expect(summaryIndex).toBeGreaterThan(skillsIndex);
  });
});

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

function styledBullet(text: string): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Garamond" w:hAnsi="Garamond"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function buildStyledDocx(): Buffer {
  const body = [
    `<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Experience</w:t></w:r></w:p>`,
    styledBullet('Built React applications for enterprise clients'),
    styledBullet('Deployed Docker containers to AWS'),
  ].join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;

  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS);
  zip.file('word/styles.xml', STYLES);
  zip.file('word/numbering.xml', NUMBERING);
  return zip.generate({ type: 'nodebuffer' });
}

describe('tailorResume in-place DOCX editing', () => {
  it('preserves original OOXML parts and run formatting while editing text', async () => {
    const resumeBuffer = buildStyledDocx();
    const result = await tailorResume({
      resumeBuffer,
      resumeFilename: 'resume.docx',
      jobPostingText: 'Required skills: React, Docker, AWS. Build and deploy applications.',
      aggressiveness: 'max',
      trustedClaimExpansion: true,
    });

    const zip = new PizZip(result.outputBuffer);
    // Original styling parts are preserved verbatim.
    expect(zip.file('word/styles.xml')?.asText()).toBe(STYLES);
    expect(zip.file('word/numbering.xml')?.asText()).toBe(NUMBERING);

    const documentXml = zip.file('word/document.xml')?.asText() ?? '';
    // The bullet font (run property) survived the edit.
    expect(documentXml).toContain('w:ascii="Garamond"');
    // Numbering reference (bullet style) survived.
    expect(documentXml).toContain('w:numId w:val="1"');
    // Claim expansion rewrote bullet text in place.
    expect(documentXml).toContain('designed and delivered React applications');

    // Output remains a valid, readable DOCX.
    const { value } = await mammoth.extractRawText({ buffer: result.outputBuffer });
    expect(value).toContain('React applications');
  });
});
