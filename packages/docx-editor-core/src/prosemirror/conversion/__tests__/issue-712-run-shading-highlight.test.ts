/**
 * Regression test for #712 — run-level shading (`w:shd`) used as a background
 * must import as the highlight mark.
 *
 * The editor serializes custom (non-OOXML-named) highlight colors as
 * `<w:shd w:fill="...">` because `w:highlight` only accepts a fixed palette
 * (§17.18.40). Before the fix the importer parsed that shading into
 * `formatting.shading` but never projected it onto a mark, so the background
 * silently vanished on reload even though Word/Google Docs still showed it.
 */
import { describe, test, expect } from 'bun:test';
import { textFormattingToMarks } from '../toProseDoc/marks';
import type { TextFormatting } from '../../../types/document';

function highlightColor(formatting: TextFormatting): string | undefined {
  const mark = textFormattingToMarks(formatting).find((m) => m.type.name === 'highlight');
  return mark?.attrs.color as string | undefined;
}

describe('Issue #712 — run shading fill imports as a highlight', () => {
  test('solid w:shd fill becomes a highlight mark', () => {
    expect(highlightColor({ shading: { fill: { rgb: '00B050' } } })).toBe('#00B050');
  });

  test('an explicit w:highlight name still wins and is untouched', () => {
    expect(highlightColor({ highlight: 'green', shading: { fill: { rgb: '00B050' } } })).toBe(
      'green'
    );
  });

  test('auto fill (no real color) does not synthesize a highlight', () => {
    expect(highlightColor({ shading: { fill: { auto: true } } })).toBeUndefined();
  });

  test('a theme-only fill is left alone (not representable as a highlight)', () => {
    expect(highlightColor({ shading: { fill: { themeColor: 'accent1' } } })).toBeUndefined();
  });

  test('a pattern overlay (pct25) is not flattened to a solid highlight', () => {
    expect(
      highlightColor({ shading: { pattern: 'pct25', fill: { rgb: 'FFFF00' } } })
    ).toBeUndefined();
  });

  test('an explicit clear pattern with a fill still maps', () => {
    expect(highlightColor({ shading: { pattern: 'clear', fill: { rgb: '00B050' } } })).toBe(
      '#00B050'
    );
  });

  test('no shading and no highlight yields no highlight mark', () => {
    expect(highlightColor({ bold: true })).toBeUndefined();
  });
});
