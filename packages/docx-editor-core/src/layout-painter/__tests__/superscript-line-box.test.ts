import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { TextRun } from '../../layout-engine/types';
import { renderTextRun } from '../renderParagraph/runs';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function makeRun(overrides: Partial<TextRun>): TextRun {
  return {
    kind: 'text',
    text: '12',
    fontSize: 11,
    fontFamily: 'Calibri',
    ...overrides,
  } as TextRun;
}

describe('superscript/subscript painter recipe', () => {
  // Regression guard for the footnote-superscript line-height bug: the painter
  // must raise/lower the glyph with a paint-only `position: relative` offset,
  // NOT `vertical-align: super/sub` (which grows the CSS line box and makes the
  // painted line taller than Word — and taller than the base-font line the
  // measurement engine reserved). happy-dom does no layout, so we assert the
  // recipe rather than a measured height; line-box neutrality itself is a
  // real-browser visual check.
  test('superscript uses a paint-only offset, never vertical-align:super', () => {
    const el = renderTextRun(makeRun({ superscript: true }), document);

    expect(el.style.position).toBe('relative');
    expect(el.style.top).toBe('-0.4em');
    expect(el.style.fontSize).toBe('0.75em');
    // The bug: vertical-align grows the line box. It must not be set to super.
    expect(el.style.verticalAlign).not.toBe('super');
  });

  test('subscript uses a paint-only offset, never vertical-align:sub', () => {
    const el = renderTextRun(makeRun({ subscript: true }), document);

    expect(el.style.position).toBe('relative');
    expect(el.style.top).toBe('0.2em');
    expect(el.style.fontSize).toBe('0.75em');
    expect(el.style.verticalAlign).not.toBe('sub');
  });

  test('a plain run sets neither position nor a super/subscript font-size', () => {
    const el = renderTextRun(makeRun({}), document);

    expect(el.style.position).toBe('');
    expect(el.style.verticalAlign).toBe('');
  });
});
