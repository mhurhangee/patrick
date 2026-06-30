import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { TextRun } from '../../layout-engine/types';
import { renderTextRun } from '../renderParagraph/runs';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function makeRun(overrides: Partial<TextRun>): TextRun {
  return {
    kind: 'text',
    text: 'x',
    fontSize: 11,
    fontFamily: 'Calibri',
    ...overrides,
  } as TextRun;
}

describe('suppressTrackedChangeStyling (render-only headers/footers)', () => {
  // Headers/footers are render-only: their tracked changes can't be accepted
  // or rejected in-app, so the painter must NOT paint un-actionable redlines
  // there. The underlying marks still round-trip on save (this only affects
  // the painted DOM). Body content (flag unset) keeps the redline styling.

  test('an insertion run paints redline styling by default', () => {
    const el = renderTextRun(makeRun({ isInsertion: true }), document, undefined, false);
    expect(el.classList.contains('docx-insertion')).toBe(true);
  });

  test('a deletion run paints redline styling by default', () => {
    const el = renderTextRun(makeRun({ isDeletion: true }), document, undefined, false);
    expect(el.classList.contains('docx-deletion')).toBe(true);
    expect(el.style.textDecorationLine).toContain('line-through');
  });

  test('insertion styling is suppressed when the flag is set', () => {
    const el = renderTextRun(makeRun({ isInsertion: true }), document, undefined, true);
    expect(el.classList.contains('docx-insertion')).toBe(false);
    expect(el.style.backgroundColor).toBe('');
    // The text itself still renders.
    expect(el.textContent).toBe('x');
  });

  test('deletion styling is suppressed when the flag is set', () => {
    const el = renderTextRun(makeRun({ isDeletion: true }), document, undefined, true);
    expect(el.classList.contains('docx-deletion')).toBe(false);
    expect(el.style.textDecorationLine).not.toContain('line-through');
    expect(el.style.color).toBe('');
    expect(el.textContent).toBe('x');
  });
});
