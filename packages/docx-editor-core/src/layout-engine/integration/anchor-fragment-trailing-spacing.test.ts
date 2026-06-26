/**
 * Regression: a paragraph that immediately follows a block with `spacing.after`
 * (e.g. a keepNext heading) must still place its first lines on the same page —
 * fragmenting across the page boundary — instead of jumping wholesale to the
 * next page and leaving a large gap.
 *
 * Root cause (pre-fix): `layoutParagraph`'s line-fitting loop reserved only the
 * paragraph's OWN `spacing.before` when counting how many lines fit, but
 * `addFragment` consumes `max(spacing.before, trailingSpacing)` — the collapsed
 * margin with the previous block's `spacing.after`. When the heading's
 * `spacing.after` exceeds the paragraph's `spacing.before`, the computed
 * fragment is too tall for the real remaining space, so `ensureFits` pushed the
 * ENTIRE first fragment to the next page (observed on the OAG sklar memo:
 * "Brief Answer" heading stranded on page 1, the whole following paragraph on
 * page 2 under a ~400px gap).
 */
import { describe, expect, test } from 'bun:test';
import { layoutDocument } from '../index';
import type { FlowBlock, Measure, ParagraphBlock } from '../types';
import { makeLine, makeParagraphMeasure, makeLayoutOptions, DEFAULT_PAGE_SIZE } from './helpers';

const LH = 35;

function para(
  id: number,
  pmStart: number,
  opts: { keepNext?: boolean; before?: number; after?: number } = {}
): ParagraphBlock {
  return {
    kind: 'paragraph',
    id,
    runs: [{ kind: 'text', text: `p${id}`, pmStart, pmEnd: pmStart + 2 }],
    attrs: {
      keepNext: opts.keepNext,
      spacing: { before: opts.before ?? 0, after: opts.after ?? 0 },
    },
    pmStart,
    pmEnd: pmStart + 3,
  };
}

describe('paragraph fragmentation after a block with trailing spacing', () => {
  test('a long paragraph after a heading with spacing.after still fills the heading page', () => {
    // Page content area: 1056 - 96 - 96 = 864px (y 96..960).
    const blocks: FlowBlock[] = [];
    const measures: Measure[] = [];

    // Filler: 15 lines (525px) → y 96..621, positioning the heading near the bottom.
    blocks.push(para(1, 1));
    measures.push(
      makeParagraphMeasure(Array.from({ length: 15 }, (_, i) => makeLine(0, i, 0, i + 1, 400, LH)))
    );

    // keepNext heading "Brief Answer" with spacing.after = 40 (the trigger).
    blocks.push(para(2, 100, { keepNext: true, before: 16, after: 40 }));
    measures.push(makeParagraphMeasure([makeLine(0, 0, 0, 1, 200, 18)]));

    // Long anchor paragraph, spacing.before = 0 (< heading's after). 20 lines.
    blocks.push(para(3, 200, { before: 0, after: 0 }));
    measures.push(
      makeParagraphMeasure(Array.from({ length: 20 }, (_, i) => makeLine(0, i, 0, i + 1, 400, LH)))
    );

    const layout = layoutDocument(blocks, measures, makeLayoutOptions());

    // Which page is the heading (block 2) on?
    const headingPage = layout.pages.find((pg) =>
      pg.fragments.some((f) => (f as { blockId: number }).blockId === 2)
    );
    expect(headingPage, 'heading is placed').toBeTruthy();

    // The long paragraph (block 3) must have at least one fragment on the heading's page.
    const anchorFragsOnHeadingPage = (headingPage!.fragments as Array<{ blockId: number }>).filter(
      (f) => f.blockId === 3
    );
    expect(
      anchorFragsOnHeadingPage.length,
      'the paragraph after the heading must fragment onto the heading page, not jump wholesale to the next page'
    ).toBeGreaterThan(0);

    // And the page must be reasonably filled (no big gap): the last fragment on
    // the heading page should reach near the content bottom (960), not stop ~300px short.
    const lastBottom = Math.max(
      ...(headingPage!.fragments as Array<{ y: number; height: number }>).map((f) => f.y + f.height)
    );
    const contentBottom = DEFAULT_PAGE_SIZE.h - 96;
    expect(
      contentBottom - lastBottom,
      'no large gap at the bottom of the heading page'
    ).toBeLessThan(LH * 2);
  });
});
