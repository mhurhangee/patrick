import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import { parseDocx } from './parser';
import { repackDocx } from './rezip';
import { isValidLongHexId } from '../utils/hexId';
import type { Hyperlink, Paragraph } from '../types/document';

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';

const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="${NS_CT}">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const PACKAGE_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

// rId50 is an INTERNAL hyperlink relationship (no TargetMode="External").
const DOCUMENT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rId50" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="OtherFile.docx"/>` +
  `</Relationships>`;

const DOCUMENT_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="${NS_W}" xmlns:w14="${NS_W14}" xmlns:r="${NS_R}"><w:body>` +
  // Out-of-range paraId (> 0x7FFFFFFF) + valid textId.
  `<w:p w14:paraId="F2345678" w14:textId="0000ABCD"><w:r><w:t>valid-text</w:t></w:r></w:p>` +
  // Orphan comment range (no comments.xml → no matching comment).
  `<w:p><w:commentRangeStart w:id="100"/><w:r><w:t>orphan</w:t></w:r><w:commentRangeEnd w:id="100"/></w:p>` +
  // Internal-target hyperlink (must survive untouched on re-export).
  `<w:p><w:hyperlink r:id="rId50"><w:r><w:t>internal</w:t></w:r></w:hyperlink></w:p>` +
  `</w:body></w:document>`;

async function buildDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', PACKAGE_RELS_XML);
  zip.file('word/document.xml', DOCUMENT_XML);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS_XML);
  return new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
}

// A footnote whose hyperlink points at an rId with no relationship entry.
const FOOTNOTE_CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="${NS_CT}">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>` +
  `</Types>`;

const FOOTNOTE_DOCUMENT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>` +
  `</Relationships>`;

const FOOTNOTE_DOCUMENT_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>` +
  `<w:p><w:r><w:t>body</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p>` +
  `</w:body></w:document>`;

const FOOTNOTES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:footnotes xmlns:w="${NS_W}" xmlns:r="${NS_R}">` +
  `<w:footnote w:id="1"><w:p>` +
  `<w:hyperlink r:id="rIdGhost"><w:r><w:t>stale</w:t></w:r></w:hyperlink>` +
  `</w:p></w:footnote>` +
  `</w:footnotes>`;

// An external hyperlink whose Target carries a raw apostrophe (Word does not
// escape it inside a double-quoted attribute), to prove no duplicate rel churn.
const APOS_DOCUMENT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rId60" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/it's" TargetMode="External"/>` +
  `</Relationships>`;

const APOS_DOCUMENT_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>` +
  `<w:p><w:hyperlink r:id="rId60"><w:r><w:t>link</w:t></w:r></w:hyperlink></w:p>` +
  `</w:body></w:document>`;

async function buildAposDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', PACKAGE_RELS_XML);
  zip.file('word/document.xml', APOS_DOCUMENT_XML);
  zip.file('word/_rels/document.xml.rels', APOS_DOCUMENT_RELS_XML);
  return new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
}

async function buildFootnoteDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', FOOTNOTE_CONTENT_TYPES_XML);
  zip.file('_rels/.rels', PACKAGE_RELS_XML);
  zip.file('word/document.xml', FOOTNOTE_DOCUMENT_XML);
  zip.file('word/_rels/document.xml.rels', FOOTNOTE_DOCUMENT_RELS_XML);
  zip.file('word/footnotes.xml', FOOTNOTES_XML);
  // No word/_rels/footnotes.xml.rels → rIdGhost does not resolve.
  return new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
}

function paragraphs(content: unknown[]): Paragraph[] {
  return content.filter((b): b is Paragraph => (b as Paragraph).type === 'paragraph');
}

describe('parse-time export normalization', () => {
  test('out-of-range w14:paraId is replaced with a valid id; valid textId is kept', async () => {
    const doc = await parseDocx(await buildDocx(), { preloadFonts: false });
    const [first] = paragraphs(doc.package.document.content);

    expect(first.paraId).not.toBe('F2345678');
    expect(isValidLongHexId(first.paraId)).toBe(true);
    expect(first.textId).toBe('0000ABCD');
  });

  test('orphan comment-range markers are dropped at parse time', async () => {
    const doc = await parseDocx(await buildDocx(), { preloadFonts: false });
    const hasOrphan = doc.package.document.content.some(
      (b) =>
        b.type === 'paragraph' &&
        b.content.some((i) => i.type === 'commentRangeStart' || i.type === 'commentRangeEnd')
    );
    expect(hasOrphan).toBe(false);
  });

  test('an internal-target hyperlink is not rewritten into an external URL on re-export', async () => {
    const doc = await parseDocx(await buildDocx(), { preloadFonts: false });
    const link = paragraphs(doc.package.document.content)
      .flatMap((p) => p.content)
      .find((i): i is Hyperlink => i.type === 'hyperlink');
    expect(link?.rId).toBe('rId50');
    expect(link?.anchor).toBeUndefined();

    const out = await repackDocx(doc);
    const zip = await JSZip.loadAsync(out);
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('text');
    const documentXml = await zip.file('word/document.xml')!.async('text');

    // Still bound to the original internal relationship, not converted.
    expect(documentXml).toContain('r:id="rId50"');
    expect(rels).toContain('Id="rId50"');
    expect(rels).not.toContain('Target="OtherFile.docx" TargetMode="External"');
    // No duplicate external relationship was minted for the same target.
    expect((rels.match(/Target="OtherFile.docx"/g) ?? []).length).toBe(1);
  });

  test('an external hyperlink with a raw apostrophe in its target does not churn rels', async () => {
    const doc = await parseDocx(await buildAposDocx(), { preloadFonts: false });
    const out = await repackDocx(doc);
    const zip = await JSZip.loadAsync(out);
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('text');
    const documentXml = await zip.file('word/document.xml')!.async('text');

    // Still bound to the original rId; no duplicate relationship minted.
    expect(documentXml).toContain('r:id="rId60"');
    expect((rels.match(/Type="[^"]*\/hyperlink"/g) ?? []).length).toBe(1);
  });

  test('a stale hyperlink inside a footnote is cleaned on re-export (no dangling rId)', async () => {
    const doc = await parseDocx(await buildFootnoteDocx(), { preloadFonts: false });
    const out = await repackDocx(doc);
    const zip = await JSZip.loadAsync(out);
    const footnotesXml = await zip.file('word/footnotes.xml')!.async('text');

    expect(footnotesXml).not.toContain('rIdGhost');
    expect(footnotesXml).not.toContain('<w:hyperlink');
    expect(footnotesXml).toContain('stale'); // run text preserved
  });
});
