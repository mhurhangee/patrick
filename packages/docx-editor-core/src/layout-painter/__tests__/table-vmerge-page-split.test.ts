/**
 * Painter: a vertically-merged cell whose restart row is on an earlier page
 * fragment must reappear (and flow its content) on the continuation fragment,
 * and the other columns must keep their grid alignment — Word fidelity for
 * issue #666 ("name cell not found on the next page").
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderTableFragment } from '../renderTable';
import type {
  ParagraphMeasure,
  TableBlock,
  TableFragment,
  TableMeasure,
} from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const ctx: RenderContext = { pageNumber: 1, totalPages: 1, section: 'body' };
const LINE = 20;

function pm(lines: number): ParagraphMeasure {
  return {
    kind: 'paragraph',
    lines: Array.from({ length: lines }, () => ({
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 10,
      ascent: 16,
      descent: 4,
      lineHeight: LINE,
    })),
    totalHeight: lines * LINE,
  };
}

// 3-row 2-col table: col 0 = rowSpan-3 merged cell, col 1 = one line per row.
function build(): { block: TableBlock; measure: TableMeasure } {
  const block = {
    kind: 'table',
    id: 't',
    columnWidths: [100, 100],
    rows: [
      {
        id: 0,
        cells: [
          { id: 1, rowSpan: 3, blocks: [{ kind: 'paragraph', id: 1, runs: [] }] },
          { id: 2, blocks: [{ kind: 'paragraph', id: 2, runs: [] }] },
        ],
      },
      { id: 3, cells: [{ id: 4, blocks: [{ kind: 'paragraph', id: 4, runs: [] }] }] },
      { id: 5, cells: [{ id: 6, blocks: [{ kind: 'paragraph', id: 6, runs: [] }] }] },
    ],
  } as unknown as TableBlock;

  const measure: TableMeasure = {
    kind: 'table',
    columnWidths: [100, 100],
    totalWidth: 200,
    totalHeight: 3 * LINE,
    rows: [
      {
        height: LINE,
        cells: [
          { blocks: [pm(3)], width: 100, height: 3 * LINE, rowSpan: 3 },
          { blocks: [pm(1)], width: 100, height: LINE },
        ],
      },
      { height: LINE, cells: [{ blocks: [pm(1)], width: 100, height: LINE }] },
      { height: LINE, cells: [{ blocks: [pm(1)], width: 100, height: LINE }] },
    ],
  };
  return { block, measure };
}

describe('renderTableFragment — vMerge continuation across a page split', () => {
  test('continuation fragment re-emits the merged column and aligns body cells', () => {
    const { block, measure } = build();

    // Continuation fragment: rows 1..3 (the merged cell's restart row 0 is on
    // the previous fragment).
    const fragment: TableFragment = {
      kind: 'table',
      blockId: 't',
      x: 0,
      y: 0,
      width: 200,
      height: 2 * LINE,
      fromRow: 1,
      toRow: 3,
      continuesFromPrev: true,
      continuesOnNext: false,
    };

    const el = renderTableFragment(fragment, block, measure, ctx);

    // The merged column reappears as a continuation slice.
    const continuation = el.querySelectorAll('[data-vmerge-continuation="true"]');
    expect(continuation.length).toBe(1);
    const slice = continuation[0] as HTMLElement;
    expect(slice.dataset.columnIndex).toBe('0');
    // Positioned at its true (negative) top so the already-shown portion clips.
    expect(parseFloat(slice.style.top)).toBeLessThan(0);
    // Continuation slices are not directly selectable.
    expect(slice.dataset.pmStart).toBeUndefined();

    // Body cells (rows 1 and 2) keep column 1 — they do NOT collapse into
    // column 0 where the merged cell lives.
    const bodyCells = [...el.querySelectorAll('.layout-table-cell')].filter(
      (c) => !(c as HTMLElement).dataset.vmergeContinuation
    ) as HTMLElement[];
    expect(bodyCells.length).toBe(2);
    for (const c of bodyCells) {
      expect(c.dataset.columnIndex).toBe('1');
      // x offset equals column 0 width (100), i.e. shifted right past the merge.
      expect(parseFloat(c.style.left)).toBeCloseTo(100, 0);
    }
  });

  test('draws cut-edge borders at a mid-row page break', () => {
    // Single bordered row tall enough to break across pages.
    const border = { width: 1, color: '#000000', style: 'solid' };
    // Two columns: col 0 bordered, col 1 borderless. The cut edge is emitted
    // per column, so only the bordered column gets a cut rule.
    const block = {
      kind: 'table',
      id: 'cut',
      columnWidths: [200, 200],
      rows: [
        {
          id: 0,
          cells: [
            {
              id: 1,
              borders: { top: border, bottom: border, left: border, right: border },
              blocks: [{ kind: 'paragraph', id: 1, runs: [] }],
            },
            { id: 2, blocks: [{ kind: 'paragraph', id: 2, runs: [] }] },
          ],
        },
      ],
    } as unknown as TableBlock;
    const measure: TableMeasure = {
      kind: 'table',
      columnWidths: [200, 200],
      totalWidth: 400,
      totalHeight: 10 * LINE,
      rows: [
        {
          height: 10 * LINE,
          cells: [
            { blocks: [pm(10)], width: 200, height: 10 * LINE },
            { blocks: [pm(10)], width: 200, height: 10 * LINE },
          ],
        },
      ],
    };

    // Bottom fragment: row 0 shown from the top, cut before its end.
    const top = renderTableFragment(
      {
        kind: 'table',
        blockId: 'cut',
        x: 0,
        y: 0,
        width: 400,
        height: 4 * LINE,
        fromRow: 0,
        toRow: 1,
        continuesOnNext: true,
        bottomClip: 4 * LINE,
      } as TableFragment,
      block,
      measure,
      ctx
    );
    // Only the bordered column emits a cut rule (borderless column is skipped).
    const topCuts = top.querySelectorAll('.layout-table-cut-border');
    expect(topCuts.length).toBe(1);
    expect((topCuts[0] as HTMLElement).style.width).toBe('200px');

    // Continuation fragment: row 0 resumed mid-content (topClip).
    const bottom = renderTableFragment(
      {
        kind: 'table',
        blockId: 'cut',
        x: 0,
        y: 0,
        width: 200,
        height: 6 * LINE,
        fromRow: 0,
        toRow: 1,
        continuesFromPrev: true,
        topClip: 4 * LINE,
      } as TableFragment,
      block,
      measure,
      ctx
    );
    expect(bottom.querySelectorAll('.layout-table-cut-border').length).toBe(1);
  });

  test('first fragment renders the merged cell from its restart row', () => {
    const { block, measure } = build();
    const fragment: TableFragment = {
      kind: 'table',
      blockId: 't',
      x: 0,
      y: 0,
      width: 200,
      height: LINE,
      fromRow: 0,
      toRow: 1,
      continuesOnNext: true,
      bottomClip: LINE,
    };
    const el = renderTableFragment(fragment, block, measure, ctx);
    // No continuation slices — the restart row is in this fragment.
    expect(el.querySelectorAll('[data-vmerge-continuation="true"]').length).toBe(0);
  });

  test('clean-boundary last fragment is sized to the rounded row stack, not the (smaller) fragment height', () => {
    // A 3-row, 1-col table whose last row has a fractional height. The engine's
    // fragment.height rounds DOWN below the painter's rounded row stack; the
    // table element must use the row stack so the last row's bottom border isn't
    // clipped off by overflow:hidden (the "missing bottom border" bug).
    const block = {
      kind: 'table',
      id: 'cb',
      columnWidths: [200],
      rows: [
        { id: 0, cells: [{ id: 1, blocks: [{ kind: 'paragraph', id: 1, runs: [] }] }] },
        { id: 2, cells: [{ id: 3, blocks: [{ kind: 'paragraph', id: 3, runs: [] }] }] },
        { id: 4, cells: [{ id: 5, blocks: [{ kind: 'paragraph', id: 5, runs: [] }] }] },
      ],
    } as unknown as TableBlock;
    const measure: TableMeasure = {
      kind: 'table',
      columnWidths: [200],
      totalWidth: 200,
      totalHeight: 40 + 83.6,
      rows: [
        { height: 20, cells: [{ blocks: [pm(1)], width: 200, height: 20 }] },
        { height: 20, cells: [{ blocks: [pm(1)], width: 200, height: 20 }] },
        { height: 83.6, cells: [{ blocks: [pm(4)], width: 200, height: 83.6 }] },
      ],
    };
    // Continuation fragment = the last row only. rowYPositions rounds the stack
    // to [0,20,40,124] → window height 124-40 = 84; fragment.height = 83.4.
    const el = renderTableFragment(
      {
        kind: 'table',
        blockId: 'cb',
        x: 0,
        y: 0,
        width: 200,
        height: 83.4,
        fromRow: 2,
        toRow: 3,
        continuesFromPrev: true,
      } as TableFragment,
      block,
      measure,
      ctx
    );
    // Sized to the rounded row stack (84), not Math.round(83.4) = 83.
    expect(el.style.height).toBe('84px');
  });
});
