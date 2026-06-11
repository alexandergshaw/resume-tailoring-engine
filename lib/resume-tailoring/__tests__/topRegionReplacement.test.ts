import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { AGGRESSIVENESS_CONFIG } from '@/lib/resume-tailoring/aggressiveness';
import { identifyReplaceableRegions } from '@/lib/resume-tailoring/identifyReplaceableRegions';
import {
  applyReplacementsToText,
  fitToLock,
  generateReplacements,
} from '@/lib/resume-tailoring/lengthPreservingReplace';
import { parseResume } from '@/lib/resume-tailoring/parseResume';
import { tailorResume } from '@/lib/resume-tailoring/tailorResume';
import { AGGRESSIVENESS_LEVELS } from '@/lib/resume-tailoring/types';

// ---------------------------------------------------------------------------
// Styled DOCX fixture: bold section headings + Garamond-styled, numbered
// bullets, a skills line, an experience title line, a date line, and a genuine
// quantified-result bullet. Used to exercise the full pipeline offline.
// ---------------------------------------------------------------------------
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

function bold(text: string): string {
  return `<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}
function plain(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}
function styledBullet(text: string): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Garamond" w:hAnsi="Garamond"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function buildResumeDocx(): Buffer {
  const body = [
    bold('Jane Q. Candidate'),
    plain('555-123-4567 | jane@example.com'),
    bold('Skills'),
    plain('Languages: Python, JavaScript'),
    bold('Experience'),
    plain('Software Developer'),
    styledBullet('Built software applications for enterprise clients'),
    styledBullet('Reduced infrastructure costs by 35% across regions'),
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

function countParagraphs(documentXml: string): number {
  return (documentXml.match(/<w:p[ >]/g) ?? []).length;
}

const TOP_POSTING =
  'Required skills: JavaScript, React, Docker. Seeking a Software Engineer to design and deliver scalable services.';

describe('aggressiveness "top" level', () => {
  it('sits above "max" in the ordered levels', () => {
    expect(AGGRESSIVENESS_LEVELS).toContain('top');
    expect(AGGRESSIVENESS_LEVELS.indexOf('top')).toBe(AGGRESSIVENESS_LEVELS.indexOf('max') + 1);
    expect(AGGRESSIVENESS_LEVELS.indexOf('top')).toBe(AGGRESSIVENESS_LEVELS.length - 1);
  });

  it('enables region replacement only at "top"', () => {
    expect(AGGRESSIVENESS_CONFIG.top.replaceRegions).toBe(true);
    expect(AGGRESSIVENESS_CONFIG.top.groundedReplacementsOnly).toBe(true);
    for (const level of ['conservative', 'balanced', 'aggressive', 'max'] as const) {
      expect(AGGRESSIVENESS_CONFIG[level].replaceRegions ?? false).toBe(false);
    }
  });
});

describe('identifyReplaceableRegions', () => {
  it('flags titles and skill items but never the header or quantified bullets', async () => {
    const parsed = await parseResume({ buffer: buildResumeDocx(), filename: 'resume.docx' });
    const regions = identifyReplaceableRegions(parsed);

    const titles = regions.filter((region) => region.kind === 'job_title').map((region) => region.originalText);
    const labels = regions.filter((region) => region.kind === 'skill_category_label').map((region) => region.originalText);
    const items = regions.filter((region) => region.kind === 'skill_item').map((region) => region.originalText);

    expect(titles).toContain('Software Developer');
    expect(labels).toContain('Languages');
    expect(items).toEqual(expect.arrayContaining(['Python', 'JavaScript']));

    const allText = regions.map((region) => region.originalText);
    // Header (name/contact) is never replaceable.
    expect(allText).not.toContain('Jane Q. Candidate');
    expect(allText.some((text) => text.includes('555-123-4567'))).toBe(false);
    // The quantified-result bullet is protected and never flagged.
    expect(allText.some((text) => text.includes('35%'))).toBe(false);
    // Achievement bullets (action-verb led) are never flagged as titles.
    expect(allText.some((text) => text.startsWith('Built software'))).toBe(false);
  });

  it('returns nothing for plain-text resumes (no docx structure)', async () => {
    const parsed = await parseResume({
      buffer: Buffer.from('Jane\nSkills\nPython\nExperience\nSoftware Developer'),
      filename: 'resume.txt',
    });
    expect(identifyReplaceableRegions(parsed)).toEqual([]);
  });
});

describe('fitToLock', () => {
  it('returns text unchanged when it already matches the exact width', () => {
    expect(fitToLock('Engineer', 8, 1)).toBe('Engineer');
  });

  it('pads a shorter candidate with trailing spaces to the exact width', () => {
    const fitted = fitToLock('Go', 6, 1);
    expect(fitted).toBe('Go    ');
    expect(fitted).toHaveLength(6);
  });

  it('truncates a longer candidate at a word boundary, then pads', () => {
    const fitted = fitToLock('Senior Platform Engineer', 12, 1);
    expect(fitted).not.toBeNull();
    expect(fitted).toHaveLength(12);
    expect(fitted!.trimEnd().length).toBeLessThanOrEqual(12);
  });

  it('refuses an unfittable single long word (no readable truncation)', () => {
    // A single long token cannot be cut at a word boundary into a tiny slot.
    expect(fitToLock('Microservices', 4, 1)).toBeNull();
  });

  it('refuses any multi-line lock', () => {
    expect(fitToLock('Engineer', 8, 2)).toBeNull();
    expect(fitToLock('Eng\nineer', 8, 1)).toBeNull();
  });
});

describe('generateReplacements grounding guard', () => {
  const region = {
    blockId: 1,
    kind: 'skill_item' as const,
    originalText: 'JavaScript',
    charCount: 10,
    lineCount: 1,
    start: 0,
    end: 10,
  };

  it('never uses a posting term the resume does not support when grounded', async () => {
    const result = await generateReplacements({
      regions: [region],
      candidates: { jobTitles: [], skills: ['TypeScript'] },
      groundedTerms: new Set<string>(), // resume supports nothing
      groundedOnly: true,
      embedderOverride: null,
    });
    expect(result).toHaveLength(0);
  });

  it('uses a grounded candidate that fits the layout lock', async () => {
    const result = await generateReplacements({
      regions: [region],
      candidates: { jobTitles: [], skills: ['TypeScript'] },
      groundedTerms: new Set<string>(['typescript']),
      groundedOnly: true,
      embedderOverride: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].newText).toHaveLength(region.charCount);
    expect(result[0].lockHeld).toBe(true);
  });
});

describe('applyReplacementsToText', () => {
  it('applies sub-span replacements right-to-left, preserving length', () => {
    const original = 'Languages: Python, JavaScript';
    const out = applyReplacementsToText(original, [
      { start: 11, end: 17, newText: 'GoLang' }, // "Python" (6) -> "GoLang" (6)
      { start: 19, end: 29, newText: 'TypeScrip!' }, // "JavaScript" (10) -> same length
    ]);
    expect(out).toHaveLength(original.length);
    expect(out).toBe('Languages: GoLang, TypeScrip!');
  });
});

describe('tailorResume "top" region replacement (E2E, offline)', () => {
  it('performs layout-locked replacements and preserves structure/formatting', async () => {
    const resumeBuffer = buildResumeDocx();
    const inputXml = new PizZip(resumeBuffer).file('word/document.xml')!.asText();
    const inputParagraphs = countParagraphs(inputXml);

    const result = await tailorResume({
      resumeBuffer,
      resumeFilename: 'resume.docx',
      jobPostingText: TOP_POSTING,
      aggressiveness: 'top',
      trustedClaimExpansion: true,
    });

    const zip = new PizZip(result.outputBuffer);
    const outXml = zip.file('word/document.xml')?.asText() ?? '';

    // Structure is untouched: same number of paragraphs/blocks.
    expect(countParagraphs(outXml)).toBe(inputParagraphs);
    // Styling parts survive verbatim.
    expect(zip.file('word/styles.xml')?.asText()).toBe(STYLES);
    expect(zip.file('word/numbering.xml')?.asText()).toBe(NUMBERING);
    expect(outXml).toContain('w:ascii="Garamond"');
    expect(outXml).toContain('w:numId w:val="1"');
    // Header and the quantified-result bullet are never touched.
    expect(outXml).toContain('Jane Q. Candidate');
    expect(outXml).toContain('Reduced infrastructure costs by 35% across regions');

    // At least one layout-locked replacement was recorded, lock confirmed.
    expect(result.report.replacements).toBeDefined();
    expect(result.report.replacements!.length).toBeGreaterThan(0);
    for (const replacement of result.report.replacements!) {
      expect(replacement.lock_held).toBe(true);
      // Replacement text exactly matches the original region's footprint.
      expect(replacement.new_text.length).toBe(replacement.char_count);
      expect(replacement.line_count).toBe(1);
    }
  });

  it('performs NO replacements at "max" (strictly additive)', async () => {
    const result = await tailorResume({
      resumeBuffer: buildResumeDocx(),
      resumeFilename: 'resume.docx',
      jobPostingText: TOP_POSTING,
      aggressiveness: 'max',
      trustedClaimExpansion: true,
    });
    expect(result.report.replacements).toBeUndefined();
  });
});
