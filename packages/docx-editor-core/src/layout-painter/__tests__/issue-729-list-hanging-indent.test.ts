/**
 * Regression test for #729 — a numbered list whose direct paragraph indent has
 * `hanging` greater than `left` must hang its marker into the left margin (as
 * Word does), not clamp it to the content edge.
 *
 * The marker line keeps `text-indent: 0` (Chrome folds a negative text-indent
 * into the marker inline-block and breaks its min-width slot), so the hang
 * comes from padding-left. CSS padding can't be negative, so when
 * `left - hanging < 0` the negative portion rides on the marker's own
 * `margin-left` — without it the old `Math.max(0, left - hanging)` clamp pinned
 * the marker to the content edge, shifting the numbers right of the text above.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderParagraphFragment } from '../renderParagraph';
import type {
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
} from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const ctx: RenderContext = { pageNumber: 1, totalPages: 1, section: 'body' };

function renderListItem(indent: { left: number; hanging: number }): HTMLElement {
  const block: ParagraphBlock = {
    kind: 'paragraph',
    id: 'p1',
    runs: [{ kind: 'text', text: 'TEST1' }],
    attrs: {
      numPr: { numId: 2, ilvl: 0 },
      listMarker: '1.',
      indent,
    },
  };
  const measure: ParagraphMeasure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 5,
        width: 40,
        ascent: 10,
        descent: 3,
        lineHeight: 14,
      },
    ],
    totalHeight: 14,
  };
  const fragment: ParagraphFragment = {
    kind: 'paragraph',
    blockId: 'p1',
    x: 0,
    y: 0,
    width: 400,
    height: 14,
    fromLine: 0,
    toLine: 1,
  };
  return renderParagraphFragment(fragment, block, measure, ctx);
}

function marker(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>('[class*="marker"]');
}
function line(el: HTMLElement): HTMLElement {
  return el.querySelector<HTMLElement>('.layout-line')!;
}

describe('Issue #729 — list hanging indent exceeding left indent', () => {
  test('hanging > left: marker hangs into the margin via negative margin-left', () => {
    // 15px left, 38px hanging — marker should start at 15 - 38 = -23px.
    const el = renderListItem({ left: 15, hanging: 38 });
    const m = marker(el);
    expect(m).not.toBeNull();
    expect(parseFloat(m!.style.marginLeft)).toBeCloseTo(-23, 1);
    // padding clamps to 0 (can't be negative); text-indent stays 0.
    expect(line(el).style.paddingLeft).toBe('0px');
    expect(line(el).style.textIndent).toBe('0px');
  });

  test('hanging <= left: existing path unchanged (padding, no marker margin)', () => {
    // 48px left, 24px hanging — marker starts at 48 - 24 = 24px via padding.
    const el = renderListItem({ left: 48, hanging: 24 });
    const m = marker(el);
    expect(m!.style.marginLeft).toBe('');
    expect(line(el).style.paddingLeft).toBe('24px');
    expect(line(el).style.textIndent).toBe('0px');
  });

  test('left == 0 with hanging: no negative margin (continuation lines sit at hanging)', () => {
    // Gating on indentLeft > 0 avoids misaligning the first line with the
    // continuation lines, which the body-line branch places at `hanging`.
    const el = renderListItem({ left: 0, hanging: 24 });
    const m = marker(el);
    expect(m!.style.marginLeft).toBe('');
    expect(line(el).style.paddingLeft).toBe('0px');
  });
});
