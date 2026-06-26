/**
 * Regression test for #728 & #727 — Hebrew/RTL text ignores complex-script font size (w:szCs) & family (w:cs).
 */
import { describe, test, expect } from 'bun:test';
import { textFormattingToMarks } from '../toProseDoc/marks';
import { marksToTextFormatting } from '../fromProseDoc/marks';
import { schema } from '../../schema';
import { paragraphToRuns } from '../../../layout-bridge/toFlowBlocks/runs';
import type { TextFormatting } from '../../../types/document';

describe('Issue #728 & #727 — Hebrew/RTL text complex script styling and round-trip preservation', () => {
  test('round-trip preserves both fontSize and fontSizeCs separately without data loss', () => {
    const original: TextFormatting = {
      fontSize: 24,
      fontSizeCs: 36,
    };
    const marks = textFormattingToMarks(original);
    const roundTripped = marksToTextFormatting(marks);
    expect(roundTripped.fontSize).toBe(24);
    expect(roundTripped.fontSizeCs).toBe(36);
  });

  test('round-trip preserves fontFamily attributes separately without data loss', () => {
    const original: TextFormatting = {
      fontFamily: {
        ascii: 'Arial',
        hAnsi: 'Arial',
        cs: 'David',
      },
    };
    const marks = textFormattingToMarks(original);
    const roundTripped = marksToTextFormatting(marks);
    expect(roundTripped.fontFamily?.ascii).toBe('Arial');
    expect(roundTripped.fontFamily?.cs).toBe('David');
  });

  test('round-trip preserves sizeCs only when size is absent', () => {
    const original: TextFormatting = {
      fontSizeCs: 36,
    };
    const marks = textFormattingToMarks(original);
    const roundTripped = marksToTextFormatting(marks);
    expect(roundTripped.fontSize).toBeUndefined();
    expect(roundTripped.fontSizeCs).toBe(36);
  });

  test('layout-bridge resolves fontSize to fontSizeCs for RTL runs', () => {
    // PM node representing an RTL run
    const fontSizeMark = schema.marks.fontSize.create({ size: 24, sizeCs: 36 });
    const rtlMark = schema.marks.rtl.create();
    const pmNode = schema.text('בדיקה1', [fontSizeMark, rtlMark]);
    const pmParagraph = schema.node('paragraph', null, [pmNode]);

    const runs = paragraphToRuns(pmParagraph, 0, {});
    expect((runs[0] as any).fontSize).toBe(18); // 36 half-points / 2 = 18pt
  });

  test('layout-bridge resolves fontSize to fontSizeCs for RTL runs when normal size is absent', () => {
    const fontSizeMark = schema.marks.fontSize.create({ size: null, sizeCs: 36 });
    const rtlMark = schema.marks.rtl.create();
    const pmNode = schema.text('בדיקה1', [fontSizeMark, rtlMark]);
    const pmParagraph = schema.node('paragraph', null, [pmNode]);

    const runs = paragraphToRuns(pmParagraph, 0, {});
    expect((runs[0] as any).fontSize).toBe(18); // 36 half-points / 2 = 18pt
  });

  test('layout-bridge resolves fontSize to normal size for non-RTL runs', () => {
    const fontSizeMark = schema.marks.fontSize.create({ size: 24, sizeCs: 36 });
    const pmNode = schema.text('test', [fontSizeMark]);
    const pmParagraph = schema.node('paragraph', null, [pmNode]);

    const runs = paragraphToRuns(pmParagraph, 0, {});
    expect((runs[0] as any).fontSize).toBe(12); // 24 half-points / 2 = 12pt
  });

  test('layout-bridge resolves fontFamily to cs for RTL runs', () => {
    const fontFamilyMark = schema.marks.fontFamily.create({ ascii: 'Arial', cs: 'David' });
    const rtlMark = schema.marks.rtl.create();
    const pmNode = schema.text('אני1', [fontFamilyMark, rtlMark]);
    const pmParagraph = schema.node('paragraph', null, [pmNode]);

    const runs = paragraphToRuns(pmParagraph, 0, {});
    expect((runs[0] as any).fontFamily).toBe('David');
  });

  test('layout-bridge resolves fontFamily to ascii for non-RTL runs', () => {
    const fontFamilyMark = schema.marks.fontFamily.create({ ascii: 'Arial', cs: 'David' });
    const pmNode = schema.text('test', [fontFamilyMark]);
    const pmParagraph = schema.node('paragraph', null, [pmNode]);

    const runs = paragraphToRuns(pmParagraph, 0, {});
    expect((runs[0] as any).fontFamily).toBe('Arial');
  });
});
