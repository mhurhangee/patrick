/**
 * Reproduction for #806 — the React DocxEditor save() flow
 * (PM state -> fromProseDoc -> serializeDocument) drops the per-run
 * `<w:rtl/>` flag, so RTL text (Arabic/Hebrew/etc.) round-trips as LTR.
 *
 * The parser sets `formatting.rtl = true` on the run (runParser.ts) and the
 * headless repackDocx() path preserves it (runSerializer.ts emits `<w:rtl/>`).
 * This test exercises the PM round-trip specifically:
 *
 *   Document -> toProseDoc -> fromProseDoc -> serializeDocument
 *
 * Fixture (built in-memory, no .docx asset needed):
 *   para1 = single run, rtl=true, Arabic "مرحبا بالعالم"
 *   para2 = single run, no rtl,   CJK    "你好世界"
 *
 * Expected after the PM round-trip:
 *   - the Arabic run keeps formatting.rtl === true
 *   - the CJK run has formatting.rtl === undefined
 */
import { describe, test, expect } from 'bun:test';
import { toProseDoc, fromProseDoc } from '../../prosemirror/conversion';
import { serializeDocument } from '../serializer/documentSerializer';
import { schema } from '../../prosemirror/schema';
import { textFormattingToMarks } from '../../prosemirror/extensions/marks/markUtils';
import type { Document, Run, Paragraph } from '../../types/document';

function textRun(text: string, rtl: boolean): Run {
  return {
    type: 'run',
    formatting: rtl ? { rtl: true } : undefined,
    content: [{ type: 'text', text }],
  };
}

function findRunByText(doc: Document, needle: string): Run | undefined {
  for (const block of doc.package.document.content ?? []) {
    if (block.type !== 'paragraph') continue;
    for (const child of block.content) {
      if (child.type !== 'run') continue;
      const text = child.content
        .filter((c): c is Extract<typeof c, { type: 'text' }> => c.type === 'text')
        .map((c) => c.text)
        .join('');
      if (text === needle) return child;
    }
  }
  return undefined;
}

const ARABIC = 'مرحبا بالعالم';
const CJK = '你好世界';

describe('Issue #806 — per-run <w:rtl/> survives the PM round-trip', () => {
  test('rtl run keeps rtl, non-rtl run stays ltr through toProseDoc -> fromProseDoc', () => {
    const para1: Paragraph = { type: 'paragraph', content: [textRun(ARABIC, true)] };
    const para2: Paragraph = { type: 'paragraph', content: [textRun(CJK, false)] };
    const doc: Document = { package: { document: { content: [para1, para2] } } };

    // Sanity: the source model carries rtl exactly where expected.
    expect(findRunByText(doc, ARABIC)?.formatting?.rtl).toBe(true);
    expect(findRunByText(doc, CJK)?.formatting?.rtl).toBeUndefined();

    // The save() flow: PM state -> back to the Document model.
    const pmDoc = toProseDoc(doc);
    const rebuilt = fromProseDoc(pmDoc, doc);

    const arabicRun = findRunByText(rebuilt, ARABIC);
    const cjkRun = findRunByText(rebuilt, CJK);

    expect(arabicRun).toBeDefined();
    expect(cjkRun).toBeDefined();

    // The bug: rtl is dropped on the rebuilt Arabic run.
    expect(arabicRun?.formatting?.rtl).toBe(true);
    // The CJK run must not gain a spurious rtl flag.
    expect(cjkRun?.formatting?.rtl).toBeUndefined();
  });

  test('serialized document.xml still emits <w:rtl/> for the Arabic run only', () => {
    const para1: Paragraph = { type: 'paragraph', content: [textRun(ARABIC, true)] };
    const para2: Paragraph = { type: 'paragraph', content: [textRun(CJK, false)] };
    const doc: Document = { package: { document: { content: [para1, para2] } } };

    const pmDoc = toProseDoc(doc);
    const rebuilt = fromProseDoc(pmDoc, doc);
    const xml = serializeDocument(rebuilt);

    // Exactly one <w:rtl/> — on the Arabic run.
    const rtlCount = (xml.match(/<w:rtl\/>/g) ?? []).length;
    expect(rtlCount).toBe(1);

    // The <w:rtl/> must sit in the run that contains the Arabic text.
    const arabicIdx = xml.indexOf(ARABIC);
    expect(arabicIdx).toBeGreaterThan(0);
    const runStart = xml.lastIndexOf('<w:r>', arabicIdx);
    const runEnd = xml.indexOf('</w:r>', arabicIdx) + '</w:r>'.length;
    const arabicRunXml = xml.slice(runStart, runEnd);
    expect(arabicRunXml).toContain('<w:rtl/>');
  });

  // The markUtils mark<->formatting helpers back the live-edit commands and
  // clipboard flows (separate from the conversion/ save path above). They were
  // missing the rtl case entirely, so rtl was lost whenever formatting routed
  // through them. Fixes #806 (secondary gap).
  test('textFormattingToMarks emits an rtl mark for rtl formatting', () => {
    const marks = textFormattingToMarks({ rtl: true }, schema);
    expect(marks.some((m) => m.type.name === 'rtl')).toBe(true);

    const ltrMarks = textFormattingToMarks({ bold: true }, schema);
    expect(ltrMarks.some((m) => m.type.name === 'rtl')).toBe(false);
  });
});
