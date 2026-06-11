import PizZip from 'pizzip';

type Block = {
  id: number;
  isParagraph: boolean;
  xml: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Splits the direct children of <w:body> into top-level element strings,
 * preserving each element verbatim. Inter-element whitespace is insignificant
 * in OOXML body content, so only element nodes are captured.
 */
function splitTopLevelElements(xml: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  const tagRe = /<(\/?)([a-zA-Z0-9:]+)([^>]*?)(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(xml)) !== null) {
    const isClose = match[1] === '/';
    const isSelfClose = match[4] === '/';
    const tagStart = match.index;
    const tagEnd = tagRe.lastIndex;

    if (isSelfClose) {
      if (depth === 0) blocks.push(xml.slice(tagStart, tagEnd));
      continue;
    }
    if (!isClose) {
      if (depth === 0) start = tagStart;
      depth += 1;
      continue;
    }
    // closing tag
    depth -= 1;
    if (depth === 0 && start !== -1) {
      blocks.push(xml.slice(start, tagEnd));
      start = -1;
    }
  }

  return blocks;
}

function paragraphText(pXml: string): string {
  // Capture visible text (<w:t>) AND hard line breaks (<w:br/>) in document
  // order, so the returned string reflects the paragraph's true line count.
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:br\b[^>]*>[\s\S]*?<\/w:br>/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(pXml)) !== null) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else out += '\n';
  }
  return out;
}

/**
 * Rewrites a paragraph's visible text while preserving its original paragraph
 * properties (<w:pPr>, including numbering/bullet style) and the run
 * properties (<w:rPr>, e.g. font/bold) of its first run. Internal newlines in
 * `newText` are re-emitted as <w:br/> hard breaks between <w:t> elements, so a
 * replacement with the same number of lines keeps the same vertical footprint.
 */
function setParagraphText(pXml: string, newText: string): string {
  const open = pXml.match(/^<w:p\b[^>]*>/)?.[0] ?? '<w:p>';
  const pPr = pXml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';

  let rPr = '';
  const firstRun = pXml.match(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/);
  if (firstRun) {
    rPr = firstRun[1].match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
  }

  const inner = newText
    .split('\n')
    .map((line) => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join('<w:br/>');

  return `${open}${pPr}<w:r>${rPr}${inner}</w:r></w:p>`;
}

/**
 * In-place editor for an uploaded DOCX. It opens the original package with
 * PizZip and mutates only the text content of existing paragraphs in
 * word/document.xml. Every other part (styles.xml, numbering.xml, theme,
 * headers/footers, section properties) is preserved verbatim so the tailored
 * output keeps the source resume's formatting and styling.
 */
export class DocxDocument {
  private readonly zip: PizZip;
  private readonly prefix: string;
  private readonly suffix: string;
  private blocks: Block[];

  private constructor(zip: PizZip, prefix: string, suffix: string, blocks: Block[]) {
    this.zip = zip;
    this.prefix = prefix;
    this.suffix = suffix;
    this.blocks = blocks;
  }

  static fromBuffer(buffer: Buffer): DocxDocument | null {
    try {
      const zip = new PizZip(buffer);
      const documentXml = zip.file('word/document.xml')?.asText();
      if (!documentXml) return null;

      const bodyOpen = documentXml.match(/<w:body\b[^>]*>/);
      const bodyCloseIndex = documentXml.lastIndexOf('</w:body>');
      if (!bodyOpen || bodyOpen.index === undefined || bodyCloseIndex === -1) return null;

      const bodyStart = bodyOpen.index + bodyOpen[0].length;
      const prefix = documentXml.slice(0, bodyStart);
      const suffix = documentXml.slice(bodyCloseIndex);
      const bodyInner = documentXml.slice(bodyStart, bodyCloseIndex);

      const blocks: Block[] = splitTopLevelElements(bodyInner).map((xml, index) => ({
        id: index,
        isParagraph: /^<w:p\b/.test(xml) && !/^<w:pPr\b/.test(xml),
        xml,
      }));

      return new DocxDocument(zip, prefix, suffix, blocks);
    } catch {
      return null;
    }
  }

  /** Paragraph blocks in document order, with their current visible text. */
  getParagraphs(): Array<{ id: number; text: string }> {
    return this.blocks
      .filter((block) => block.isParagraph)
      .map((block) => ({ id: block.id, text: paragraphText(block.xml) }));
  }

  getText(id: number): string {
    const block = this.blocks.find((b) => b.id === id);
    return block ? paragraphText(block.xml) : '';
  }

  setText(id: number, text: string): void {
    const block = this.blocks.find((b) => b.id === id);
    if (block) block.xml = setParagraphText(block.xml, text);
  }

  /** Visible lines of a paragraph, split on its hard <w:br/> breaks. */
  getParagraphLines(id: number): string[] {
    return this.getText(id).split('\n');
  }

  /**
   * Writes a paragraph from explicit lines, re-emitting one <w:br/> between each
   * so the original line-break count is preserved. Use for layout-locked
   * replacements that must keep the paragraph's exact vertical footprint.
   */
  setTextPreservingBreaks(id: number, lines: string[]): void {
    const block = this.blocks.find((b) => b.id === id);
    if (block) block.xml = setParagraphText(block.xml, lines.join('\n'));
  }

  remove(id: number): void {
    this.blocks = this.blocks.filter((block) => block.id !== id);
  }

  /**
   * Reorders the blocks identified by `orderedIds` among the document
   * positions they currently occupy, leaving all other blocks in place.
   */
  reorder(orderedIds: number[]): void {
    const present = orderedIds.filter((id) => this.blocks.some((b) => b.id === id));
    if (present.length < 2) return;

    const slots = this.blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => present.includes(block.id))
      .map(({ index }) => index)
      .sort((a, b) => a - b);

    const byId = new Map(this.blocks.map((block) => [block.id, block]));
    present.forEach((id, position) => {
      const block = byId.get(id);
      if (block) this.blocks[slots[position]] = block;
    });
  }

  toBuffer(): Buffer {
    const body = this.blocks.map((block) => block.xml).join('');
    this.zip.file('word/document.xml', `${this.prefix}${body}${this.suffix}`);
    return this.zip.generate({ type: 'nodebuffer' });
  }
}
