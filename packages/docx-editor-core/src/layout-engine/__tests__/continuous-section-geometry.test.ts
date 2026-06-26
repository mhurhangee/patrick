/** ECMA-376 §17.6.22: a `continuous` section break does not force a page,
 *  but the next page (when one is naturally created) must use the new
 *  section's geometry. The previous version skipped `updatePageLayout`
 *  for `continuous` and the next overflow page kept the old size/margins. */

import { describe, test, expect } from 'bun:test';
import { layoutDocument } from '../index';
import type {
  FlowBlock,
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
  SectionBreakBlock,
} from '../types';

function para(id: string, height: number): { block: ParagraphBlock; measure: ParagraphMeasure } {
  return {
    block: {
      kind: 'paragraph',
      id,
      pmStart: 0,
      pmEnd: 0,
      runs: [{ kind: 'text', text: id }],
      attrs: {},
    },
    measure: {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 0,
          width: 100,
          ascent: 10,
          descent: 3,
          lineHeight: height,
        },
      ],
      totalHeight: height,
    },
  };
}

function paraLines(
  id: string,
  count: number,
  lineHeight: number
): { block: ParagraphBlock; measure: ParagraphMeasure } {
  return {
    block: {
      kind: 'paragraph',
      id,
      pmStart: 0,
      pmEnd: count,
      runs: [{ kind: 'text', text: id.repeat(count) }],
      attrs: {},
    },
    measure: {
      kind: 'paragraph',
      lines: Array.from({ length: count }, (_, i) => ({
        fromRun: 0,
        fromChar: i,
        toRun: 0,
        toChar: i + 1,
        width: 100,
        ascent: 10,
        descent: 3,
        lineHeight,
      })),
      totalHeight: count * lineHeight,
    },
  };
}

describe('continuous section break geometry', () => {
  test('current page keeps OLD section geometry; only the next created page picks up the new size', () => {
    // Half-page of content, then a continuous break that swaps to landscape.
    // The page containing the break stays portrait; overflow lands in landscape.
    const A = para('a', 200);
    const sb: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb',
      type: 'continuous',
      pageSize: { w: 800, h: 1000 },
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
    };
    const B = para('b', 200);
    // C is taller than the new section's content area (landscape 700h with
    // 50/50 margins → 600). Exercises the paginator's oversized-fragment
    // guard across a deferred geometry swap: without the in-loop re-check,
    // `ensureFits` looped forever creating empty pages.
    const C = para('c', 800);

    const blocks: FlowBlock[] = [A.block, sb, B.block, C.block];
    const measures = [A.measure, { kind: 'sectionBreak' }, B.measure, C.measure] as never;

    const result = layoutDocument(blocks, measures, {
      pageSize: { w: 800, h: 1000 },
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      finalPageSize: { w: 1200, h: 700 },
      finalMargins: { top: 50, right: 50, bottom: 50, left: 50 },
    });

    // First page started before the break — must keep the OLD geometry.
    expect(result.pages[0].size.w).toBe(800);
    // Last page (created from overflow after the break) — NEW geometry.
    const lastPage = result.pages[result.pages.length - 1];
    expect(lastPage.size.w).toBe(1200);
    expect(lastPage.size.h).toBe(700);
  });

  test("next overflow page uses the continuous section's page size", () => {
    const A = para('a', 700); // fills first portrait page
    const sb: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb',
      type: 'continuous',
      pageSize: { w: 1200, h: 700 }, // landscape
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
    };
    const B = para('b', 500); // forces a second page after the section break
    const C = para('c', 500); // overflows to a third page (landscape)

    const blocks: FlowBlock[] = [A.block, sb, B.block, C.block];
    const measures = [A.measure, { kind: 'sectionBreak' }, B.measure, C.measure] as never;

    const result = layoutDocument(blocks, measures, {
      pageSize: { w: 800, h: 1000 },
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      finalPageSize: { w: 1200, h: 700 },
      finalMargins: { top: 50, right: 50, bottom: 50, left: 50 },
    });

    // Pages after the continuous break must adopt the new geometry.
    const lastPage = result.pages[result.pages.length - 1];
    expect(lastPage.size.w).toBe(1200);
    expect(lastPage.size.h).toBe(700);
  });

  test('balances a terminal continuous multi-column text section that fits on the current page', () => {
    const A = para('intro', 80);
    const sb: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb',
      type: 'continuous',
    };
    const B = paraLines('two-column', 6, 20);

    const blocks: FlowBlock[] = [A.block, sb, B.block];
    const measures = [A.measure, { kind: 'sectionBreak' }, B.measure] as never;

    const result = layoutDocument(blocks, measures, {
      pageSize: { w: 500, h: 500 },
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      columns: { count: 2, gap: 20 },
      bodyBreakType: 'continuous',
    });

    const balancedFragments = result.pages[0].fragments.filter(
      (f): f is ParagraphFragment => f.kind === 'paragraph' && f.blockId === 'two-column'
    );

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].columns?.count).toBe(2);
    expect(balancedFragments).toHaveLength(2);
    expect(balancedFragments.map((f) => [f.fromLine, f.toLine])).toEqual([
      [0, 3],
      [3, 6],
    ]);
    expect(balancedFragments.map((f) => f.x)).toEqual([50, 260]);
  });

  test('continuous break that changes orientation is promoted to a page break (Word/LibreOffice)', () => {
    // Mirrors a memo with a landscape table sandwiched between portrait prose:
    //   portrait A → [continuous, landscape] → B (wide table) → [continuous, portrait] → C
    // Word/LibreOffice cannot place two orientations on one physical sheet, so
    // each orientation change is promoted to a page break. A, B, and C must
    // each land on their own correctly-oriented page — B (the table) isolated,
    // and C (e.g. the "Discussion") must NOT trail onto the landscape page.
    const PORTRAIT = { w: 800, h: 1000 };
    const LANDSCAPE = { w: 1200, h: 700 };
    const M = { top: 50, right: 50, bottom: 50, left: 50 };

    const A = para('a', 100);
    // sb1 terminates the portrait section containing A; the section that BEGINS
    // after it (containing B) is landscape, supplied by sb2's pageSize below.
    const sb1: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb1',
      type: 'continuous',
      pageSize: PORTRAIT,
      margins: M,
    };
    const B = para('b', 100);
    // sb2 terminates the landscape section containing B; the final (Discussion)
    // section that begins after it is portrait (finalPageSize below).
    const sb2: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb2',
      type: 'continuous',
      pageSize: LANDSCAPE,
      margins: M,
    };
    const C = para('c', 100);

    const blocks: FlowBlock[] = [A.block, sb1, B.block, sb2, C.block];
    const measures = [
      A.measure,
      { kind: 'sectionBreak' },
      B.measure,
      { kind: 'sectionBreak' },
      C.measure,
    ] as never;

    const result = layoutDocument(blocks, measures, {
      pageSize: PORTRAIT,
      margins: M,
      finalPageSize: PORTRAIT,
      finalMargins: M,
    });

    // Three pages: portrait (A) → landscape (B) → portrait (C).
    expect(result.pages.length).toBe(3);
    expect(result.pages[0].size).toEqual(PORTRAIT);
    expect(result.pages[1].size).toEqual(LANDSCAPE);
    expect(result.pages[2].size).toEqual(PORTRAIT);
  });
});
