/**
 * Regression test for #886 — complex-script-only (RTL) runs whose font size lives
 * in `sizeCs` (not `size`) must not render/serialize as `font-size: 0pt`, and a
 * size change must populate both `size` and `sizeCs` like Word does.
 */
import { describe, test, expect } from 'bun:test';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { textFormattingToMarks, setMark } from '../markUtils';
import { schema } from '../../../schema';
import type { TextFormatting } from '../../../../types/document';

function fontSizeStyle(attrs: { size: number | null; sizeCs: number | null }): string {
  const mark = schema.marks.fontSize.create(attrs);
  const out = schema.marks.fontSize.spec.toDOM!(mark, false) as [string, { style: string }, number];
  return out[1].style;
}

describe('Issue #886 — CS-only font size never renders 0pt; size change syncs sizeCs', () => {
  test('toDOM falls back to sizeCs when size is absent (no 0pt)', () => {
    const style = fontSizeStyle({ size: null, sizeCs: 36 });
    expect(style).toContain('font-size: 18pt'); // 36 half-points / 2
    expect(style).not.toContain('font-size: 0pt');
  });

  test('toDOM falls back to Word default 12pt when both sizes are absent', () => {
    const style = fontSizeStyle({ size: null, sizeCs: null });
    expect(style).toContain('font-size: 12pt'); // 24 half-points / 2
    expect(style).not.toContain('font-size: 0pt');
  });

  test('toDOM uses the normal size when present', () => {
    const style = fontSizeStyle({ size: 28, sizeCs: 36 });
    expect(style).toContain('font-size: 14pt'); // 28 half-points / 2
  });

  test('applying only fontSize populates both size and sizeCs (Word parity)', () => {
    const formatting: TextFormatting = { fontSize: 24 };
    const marks = textFormattingToMarks(formatting, schema);
    const fontSizeMark = marks.find((m) => m.type.name === 'fontSize');
    expect(fontSizeMark?.attrs.size).toBe(24);
    expect(fontSizeMark?.attrs.sizeCs).toBe(24);
  });

  test('explicit fontSizeCs is preserved over the size fallback', () => {
    const formatting: TextFormatting = { fontSize: 24, fontSizeCs: 36 };
    const marks = textFormattingToMarks(formatting, schema);
    const fontSizeMark = marks.find((m) => m.type.name === 'fontSize');
    expect(fontSizeMark?.attrs.size).toBe(24);
    expect(fontSizeMark?.attrs.sizeCs).toBe(36);
  });

  test('distinct Latin/CS sizes survive the stored-mark read -> write round-trip', () => {
    // Empty paragraph with the cursor inside it. Applying a mark here goes
    // through saveStoredMarksToParagraph -> marksToTextFormatting, the read
    // path Greptile flagged for dropping the complex-script size.
    const doc = schema.node('doc', null, [schema.node('paragraph')]);
    let state = EditorState.create({ doc, schema });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));

    // Latin (size) and complex-script (sizeCs) deliberately differ.
    let captured: Transaction | undefined;
    setMark(schema.marks.fontSize, { size: 28, sizeCs: 36 })(state, (tr) => {
      captured = tr;
    });
    const next = state.apply(captured!);

    // The read path captured both sizes onto the paragraph, not just fontSize.
    const stored = next.doc.firstChild!.attrs.defaultTextFormatting as TextFormatting;
    expect(stored.fontSize).toBe(28);
    expect(stored.fontSizeCs).toBe(36);

    // Writing them back reproduces the distinct mark — sizeCs is not silently
    // re-aligned to fontSize, which is the regression #886's fix could have
    // introduced for documents with distinct Latin/CS sizes.
    const marks = textFormattingToMarks(stored, schema);
    const fontSizeMark = marks.find((m) => m.type.name === 'fontSize');
    expect(fontSizeMark?.attrs.size).toBe(28);
    expect(fontSizeMark?.attrs.sizeCs).toBe(36);
  });
});
