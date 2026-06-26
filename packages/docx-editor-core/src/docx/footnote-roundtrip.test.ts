import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import { parseDocx } from './parser';
import { repackDocx } from './rezip';
import type { Paragraph } from '../types/document';

/**
 * Footnote serialization round-trip (PR #646 F4 — symmetry gap).
 *
 * The endnote path is covered by `endnote-roundtrip.test.ts` against the
 * binary `e2e/fixtures/endnotes-tracked-changes.docx`. There is no committed
 * footnote analogue, so this suite builds an equivalent footnote-bearing DOCX
 * in-memory and asserts the same parse→edit→repack→reparse guarantees, plus a
 * `w:del`/`w:delText` deletion round-trip that exercises a DISTINCT emit path
 * from the `w:ins` insertion already covered on the endnote side.
 *
 * Fixture provenance: synthesized here (no binary). The XML mirrors
 * `endnotes-tracked-changes.docx` part-for-part — separator + continuation
 * separator notes, two normal notes, an `EndnoteText`→`FootnoteText` style and
 * `endnoteRef`→`footnoteRef` auto-number mark, and one tracked change — with
 * `w:endnote*` renamed to `w:footnote*` and the body's tracked `w:ins` swapped
 * for a `w:del`/`w:delText` deletion. `repackDocx` round-trips through
 * `doc.originalBuffer`, which `parseDocx` populates from these bytes, so no
 * on-disk fixture is required.
 */

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';

const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="${NS_CT}">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>` +
  `</Types>`;

const PACKAGE_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const DOCUMENT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>` +
  `</Relationships>`;

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles xmlns:w="${NS_W}">` +
  `<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/></w:style>` +
  `<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/></w:style>` +
  `</w:styles>`;

const DOCUMENT_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>` +
  `<w:p>` +
  `<w:r><w:t xml:space="preserve">First claim</w:t></w:r>` +
  `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r>` +
  `<w:r><w:t xml:space="preserve"> and second claim</w:t></w:r>` +
  `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="2"/></w:r>` +
  `<w:r><w:t>.</w:t></w:r>` +
  `</w:p>` +
  `<w:sectPr>` +
  `<w:pgSz w:w="12240" w:h="15840"/>` +
  `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>` +
  `</w:sectPr>` +
  `</w:body></w:document>`;

// Footnote 1: clean. Footnote 2: a tracked DELETION (w:del/w:delText) — the
// distinct emit path this suite is here to cover (endnotes already cover w:ins).
const FOOTNOTES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:footnotes xmlns:w="${NS_W}">` +
  `<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>` +
  `<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>` +
  `<w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>` +
  `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>` +
  `<w:r><w:t xml:space="preserve"> First footnote, clean.</w:t></w:r></w:p></w:footnote>` +
  `<w:footnote w:id="2"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>` +
  `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>` +
  `<w:r><w:t xml:space="preserve"> Second footnote with a </w:t></w:r>` +
  `<w:del w:id="200" w:author="Reviewer" w:date="2024-01-01T00:00:00Z">` +
  `<w:r><w:delText>tracked deletion</w:delText></w:r></w:del>` +
  `<w:r><w:t>.</w:t></w:r></w:p></w:footnote>` +
  `</w:footnotes>`;

async function buildFootnoteDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', PACKAGE_RELS_XML);
  zip.file('word/document.xml', DOCUMENT_XML);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS_XML);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/footnotes.xml', FOOTNOTES_XML);
  return new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
}

async function footnotesXmlOf(buf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/footnotes.xml')!.async('text');
}

function noteText(note: { content: unknown[] }): string {
  const para = note.content.find((b) => (b as Paragraph).type === 'paragraph') as Paragraph;
  return para.content
    .flatMap((item) => {
      if (item.type === 'run') return item.content;
      if (item.type === 'insertion' || item.type === 'deletion') {
        return item.content.flatMap((r) => (r.type === 'run' ? r.content : []));
      }
      return [];
    })
    .filter((c): c is { type: 'text'; text: string } => (c as { type: string }).type === 'text')
    .map((c) => c.text)
    .join('');
}

describe('footnote round-trip (synthetic fixture)', () => {
  test('parses normal footnotes and separators separately', async () => {
    const doc = await parseDocx(await buildFootnoteDocx(), { preloadFonts: false });
    expect(doc.package.footnotes?.length).toBe(2);
    expect(doc.package.footnoteSeparators?.length).toBe(2);
    const sepTypes = doc.package.footnoteSeparators!.map((s) => s.noteType).sort();
    expect(sepTypes).toEqual(['continuationSeparator', 'separator']);
  });

  test('an edit to a footnote body persists through repack and reparse', async () => {
    const doc = await parseDocx(await buildFootnoteDocx(), { preloadFonts: false });
    const target = doc.package.footnotes!.find((f) => f.id === 1)!;
    const para = target.content.find((b) => b.type === 'paragraph') as Paragraph;
    para.content.push({
      type: 'run',
      content: [{ type: 'text', text: ' EDITED', preserveSpace: true }],
    });

    const out = new Uint8Array(await repackDocx(doc));
    const xml = await footnotesXmlOf(out);
    expect(xml).toContain('EDITED');

    const reparsed = await parseDocx(out, { preloadFonts: false });
    expect(reparsed.package.footnotes?.length).toBe(2);
    expect(reparsed.package.footnoteSeparators?.length).toBe(2);
    const reEdited = reparsed.package.footnotes!.find((f) => f.id === 1)!;
    expect(noteText(reEdited)).toContain('EDITED');
  });

  test('the body footnote references are unchanged by a note-only edit', async () => {
    const doc = await parseDocx(await buildFootnoteDocx(), { preloadFonts: false });
    const out = new Uint8Array(await repackDocx(doc));
    const zip = await JSZip.loadAsync(out);
    const bodyXml = await zip.file('word/document.xml')!.async('text');
    expect((bodyXml.match(/<w:footnoteReference/g) ?? []).length).toBe(2);
  });
});

describe('tracked w:del inside a note survives repack', () => {
  test('a w:del/w:delText deletion in a footnote round-trips', async () => {
    const doc = await parseDocx(await buildFootnoteDocx(), { preloadFonts: false });

    // The deletion is modeled, not verbatim-copied.
    const target = doc.package.footnotes!.find((f) => f.id === 2)!;
    const para = target.content.find((b) => b.type === 'paragraph') as Paragraph;
    expect(para.content.some((c) => c.type === 'deletion')).toBe(true);

    const out = new Uint8Array(await repackDocx(doc));
    const xml = await footnotesXmlOf(out);

    // Deletion markup — a DISTINCT emit path from w:ins: <w:del> wrapper plus
    // the run text rewritten from <w:t> to <w:delText>.
    expect(xml).toContain('<w:del');
    expect(xml).toContain('w:author="Reviewer"');
    expect(xml).toContain('<w:delText');
    expect(xml).toContain('tracked deletion');
    // The deleted text must NOT survive as a plain <w:t> run.
    expect(xml).not.toContain('<w:t>tracked deletion');
    // The footnoteRef auto-number mark is preserved, not dropped.
    expect(xml).toContain('<w:footnoteRef/>');

    // Re-parse: the deletion is still a modeled deletion carrying the text.
    const reparsed = await parseDocx(out, { preloadFonts: false });
    const reTarget = reparsed.package.footnotes!.find((f) => f.id === 2)!;
    const rePara = reTarget.content.find((b) => b.type === 'paragraph') as Paragraph;
    expect(rePara.content.some((c) => c.type === 'deletion')).toBe(true);
    expect(noteText(reTarget)).toContain('tracked deletion');
  });
});
