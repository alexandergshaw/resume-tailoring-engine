import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import {
  buildPlaceholderMap,
  fillTemplateDocx,
} from '@/lib/resume-tailoring/mappings/fillTemplate';
import type { JobPostingSignals } from '@/lib/resume-tailoring/mappings/selectMappings';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

function para(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

/** Minimal resume template DOCX mirroring the real template's placeholders. */
function buildTemplateDocx(): Buffer {
  const body = [
    para('Summary'),
    para(
      '{{RANK}} {{PRIMARY_FUNCTION}} with {{YEARS_OF_EXPERIENCE}} years building {{SOLUTION_TYPES}} ' +
        'using {{JOB_RELEVANT_TECHNOLOGIES}}.',
    ),
    para('Professional Experience'),
    para('{{Top Rank}} {{Specialization}} {{Function}} ({{Areas of Emphasis}}) | Mutual of Omaha | July 2023'),
    para('Led {{INITIATIVE_TYPE}} delivering {{MEASURABLE_IMPACT}} across {{SCOPE_OR_STAKEHOLDERS}}.'),
    para('Adjunct Professor ({Area of Emphasis}, {Area of Emphasis}) | Metropolitan College | Mar 2023'),
    para('{{Medium Rank}} {{Specialization}} {{Function}} ({{Areas of Emphasis}}) | Mutual of Omaha | May 2022'),
    para('Improved {{SOLUTION_OR_PROCESS}} with {{JOB_RELEVANT_TECHNOLOGIES}} achieving {{MEASURABLE_IMPACT}}.'),
    para('{{Low Rank}} {{Specialization}} {{Function}} ({{Areas of Emphasis}}) | Union Pacific | May 2019'),
    para('Designed {{SOLUTION_OR_CAPABILITY}} using {{JOB_RELEVANT_TECHNOLOGIES}}.'),
    para('Projects'),
    para('{{PROJECT_SCOPE}} {{PROJECT_TYPE}}: {{PRIMARY_CAPABILITY}} & {{STRATEGIC_OUTCOME}} | Mutual of Omaha'),
    para('Designed and implemented {{PROJECT_SOLUTION}} using {{JOB_RELEVANT_TECHNOLOGIES}}.'),
    para('{{PROJECT_SCOPE}} {{PROJECT_TYPE}}: {{PRIMARY_CAPABILITY}} & {{STRATEGIC_OUTCOME}} | Metropolitan College'),
    para('Modernized {{EXISTING_SYSTEM_OR_PROCESS}} through {{TECHNICAL_APPROACH}}.'),
    para('{{PROJECT_SCOPE}} {{PROJECT_TYPE}}: {{PRIMARY_CAPABILITY}} & {{STRATEGIC_OUTCOME}} | Metropolitan College'),
    para('Modernized {{EXISTING_SYSTEM_OR_PROCESS}} through {{TECHNICAL_APPROACH}}.'),
    para('Skills'),
    para('{{Role-Specific Expertise }}'),
    para('{{2 lines of comma separated skills}}'),
    para('Education'),
    para('M.S. in Management Information Systems | Bellevue University | May 2026'),
  ].join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;

  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS);
  zip.file('word/styles.xml', STYLES);
  return zip.generate({ type: 'nodebuffer' });
}

const SIGNALS: JobPostingSignals = {
  text: 'Senior full stack engineer: React, TypeScript, REST APIs, SQL, technical leadership and mentorship.',
  requiredSkills: ['React', 'TypeScript', 'SQL'],
  jobTitles: ['engineer'],
  profileEvidence: ['React', 'TypeScript', 'SQL', 'REST APIs'],
};

describe('buildPlaceholderMap', () => {
  it('resolves all summary placeholders to non-empty strings', () => {
    const map = buildPlaceholderMap(SIGNALS);
    const keys = [
      'RANK',
      'PRIMARY_FUNCTION',
      'YEARS_OF_EXPERIENCE',
      'SOLUTION_TYPES',
      'JOB_RELEVANT_TECHNOLOGIES',
      'TECHNICAL_CAPABILITIES',
      'DOMAIN_CAPABILITIES',
    ];
    for (const key of keys) {
      expect(map[key], key).toBeTruthy();
    }
  });
});

describe('fillTemplateDocx', () => {
  it('replaces template tokens and returns a valid docx', async () => {
    const out = fillTemplateDocx(buildTemplateDocx(), SIGNALS);
    expect(Buffer.isBuffer(out)).toBe(true);

    const { value } = await mammoth.extractRawText({ buffer: out });
    // No unresolved tokens for the placeholders we provide values for.
    expect(value).not.toContain('{{RANK}}');
    expect(value).not.toContain('{{Top Rank}}');
    expect(value).not.toContain('{{PROJECT_SCOPE}}');
    expect(value).not.toContain('{{2 lines of comma separated skills}}');
    expect(value).not.toContain('{Area of Emphasis}');
    // Fixed facts survive.
    expect(value).toContain('Mutual of Omaha');
    expect(value).toContain('Bellevue University');
  });

  it('is deterministic for identical signals', () => {
    const a = fillTemplateDocx(buildTemplateDocx(), SIGNALS);
    const b = fillTemplateDocx(buildTemplateDocx(), SIGNALS);
    const xmlA = new PizZip(a).file('word/document.xml')?.asText();
    const xmlB = new PizZip(b).file('word/document.xml')?.asText();
    expect(xmlA).toBe(xmlB);
  });

  it('throws on a non-docx buffer', () => {
    expect(() => fillTemplateDocx(Buffer.from('not a docx'), SIGNALS)).toThrow();
  });
});
