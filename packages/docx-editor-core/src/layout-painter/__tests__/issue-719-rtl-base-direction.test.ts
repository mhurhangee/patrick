/**
 * Regression test for #719 — a paragraph that carries right-to-left runs
 * (`w:rtl`) but no explicit `w:bidi` flag must still lay out right-to-left.
 *
 * The painter renders each run as its own `dir`-marked, bidi-isolated span, so
 * without a base direction on the fragment the runs stay in logical (LTR)
 * order and reversed Hebrew/Arabic reads backwards. We set the fragment `dir`
 * from first-strong base-direction detection (the `dir="auto"` rule), gated to
 * paragraphs that actually contain RTL runs so pure-LTR content is untouched.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderParagraphFragment } from '../renderParagraph';
import type {
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
  Run,
} from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const baseContext: RenderContext = { pageNumber: 1, totalPages: 1, section: 'body' };

function render(runs: Run[], attrs?: ParagraphBlock['attrs']): HTMLElement {
  const block: ParagraphBlock = { kind: 'paragraph', id: 'p1', runs, attrs };
  const totalChars = runs.reduce((n, r) => n + ('text' in r ? r.text.length : 0), 0);
  const measure: ParagraphMeasure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: Math.max(0, runs.length - 1),
        toChar: totalChars,
        width: 100,
        ascent: 10,
        descent: 3,
        lineHeight: 13,
      },
    ],
    totalHeight: 13,
  };
  const fragment: ParagraphFragment = {
    kind: 'paragraph',
    blockId: 'p1',
    x: 0,
    y: 0,
    width: 200,
    height: 13,
    fromLine: 0,
    toLine: 1,
  };
  return renderParagraphFragment(fragment, block, measure, baseContext);
}

function renderDir(runs: Run[], attrs?: ParagraphBlock['attrs']): string | null {
  return render(runs, attrs).getAttribute('dir');
}

describe('Issue #719 — RTL base direction detection', () => {
  test('Hebrew-led paragraph with rtl runs renders dir="rtl"', () => {
    expect(renderDir([{ kind: 'text', text: 'בדיקה 1', rtl: true }])).toBe('rtl');
  });

  test('explicit w:bidi paragraph still renders dir="rtl"', () => {
    expect(renderDir([{ kind: 'text', text: 'hello' }], { bidi: true })).toBe('rtl');
  });

  test('English-led paragraph with an embedded rtl word stays LTR (no dir)', () => {
    expect(
      renderDir([
        { kind: 'text', text: 'Hello ' },
        { kind: 'text', text: 'שלום', rtl: true },
      ])
    ).toBeNull();
  });

  test('pure-LTR paragraph is untouched (no dir attribute)', () => {
    expect(renderDir([{ kind: 'text', text: 'plain text' }])).toBeNull();
  });

  test('detected-RTL paragraph with no explicit alignment defaults to right-align', () => {
    // The detection must drive the same alignment/indent paths as an explicit
    // w:bidi paragraph, not just the `dir` attribute.
    const el = render([{ kind: 'text', text: 'בדיקה', rtl: true }]);
    expect(el.getAttribute('dir')).toBe('rtl');
    expect(el.style.textAlign).toBe('right');
  });
});
