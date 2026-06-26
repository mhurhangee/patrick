/**
 * Painter: a continuation fragment that BOTH repeats a header row AND resumes a
 * body row that broke mid-content (topClip) must not let the already-shown top
 * slice of that body row paint on top of the repeated header.
 *
 * The repeated header sits in [0, headerHeight]; the body row resumes at
 * `headerHeight - topClip` (negative relative to the header). With a single
 * table-level overflow:hidden the [headerHeight - topClip, headerHeight] slice
 * stays visible and overlaps the header. The body must therefore live in its own
 * clip box that starts at `headerHeight`, sending that slice to negative-y where
 * it is clipped. Regression for the "repeating header overlays body" report.
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

// 2-row, 1-col table: row 0 is a repeating header (1 line), row 1 is a tall body
// row (10 lines) that breaks across pages.
function build(): { block: TableBlock; measure: TableMeasure } {
  const block = {
    kind: 'table',
    id: 't',
    columnWidths: [200],
    rows: [
      {
        id: 0,
        isHeader: true,
        cells: [{ id: 1, blocks: [{ kind: 'paragraph', id: 1, runs: [] }] }],
      },
      { id: 2, cells: [{ id: 3, blocks: [{ kind: 'paragraph', id: 3, runs: [] }] }] },
    ],
  } as unknown as TableBlock;

  const measure: TableMeasure = {
    kind: 'table',
    columnWidths: [200],
    totalWidth: 200,
    totalHeight: LINE + 10 * LINE,
    rows: [
      { height: LINE, cells: [{ blocks: [pm(1)], width: 200, height: LINE }] },
      { height: 10 * LINE, cells: [{ blocks: [pm(10)], width: 200, height: 10 * LINE }] },
    ],
  };
  return { block, measure };
}

describe('renderTableFragment — repeated header + mid-row topClip', () => {
  test('clips the resumed body row so it does not overlap the repeated header', () => {
    const { block, measure } = build();

    // Continuation fragment: repeats header (row 0) and resumes row 1 from 80px
    // (4 lines already shown on the previous page).
    const fragment: TableFragment = {
      kind: 'table',
      blockId: 't',
      x: 0,
      y: 0,
      width: 200,
      height: LINE + (10 * LINE - 4 * LINE), // headerOverhead + visible body
      fromRow: 1,
      toRow: 2,
      continuesFromPrev: true,
      continuesOnNext: false,
      headerRowCount: 1,
      topClip: 4 * LINE,
    };

    const el = renderTableFragment(fragment, block, measure, ctx);

    // The header is re-emitted at the very top of the fragment, in the table el.
    const header = el.querySelector('[data-repeated-header="true"]') as HTMLElement;
    expect(header).toBeTruthy();
    expect(header.parentElement).toBe(el);
    expect(header.style.top).toBe('0px');

    // The resumed body row lives inside a dedicated clip box, NOT directly in the
    // table element. Without this box the row is a child of `el` and its
    // already-shown slice paints over the header.
    const bodyRow = el.querySelector('[data-row-index="1"]') as HTMLElement;
    expect(bodyRow).toBeTruthy();
    const clip = bodyRow.parentElement as HTMLElement;
    expect(clip).not.toBe(el);
    // The clip box starts exactly below the header and hides vertical overflow.
    expect(clip.style.top).toBe(`${LINE}px`);
    expect(clip.style.overflowY).toBe('hidden');

    // Inside the clip box the body row's already-shown slice is at negative-y, so
    // it is clipped instead of bleeding up into the header region.
    expect(parseFloat(bodyRow.style.top)).toBeLessThan(0);
    // headerHeight(20) - topClip(80) - headerOrigin(20) = -80
    expect(parseFloat(bodyRow.style.top)).toBeCloseTo(-80, 0);
  });

  test('no clip box is added when the fragment has no repeated header', () => {
    const { block, measure } = build();
    // Continuation fragment resuming the body row WITHOUT a repeated header.
    const fragment: TableFragment = {
      kind: 'table',
      blockId: 't',
      x: 0,
      y: 0,
      width: 200,
      height: 10 * LINE - 4 * LINE,
      fromRow: 1,
      toRow: 2,
      continuesFromPrev: true,
      continuesOnNext: false,
      topClip: 4 * LINE,
    };

    const el = renderTableFragment(fragment, block, measure, ctx);
    const bodyRow = el.querySelector('[data-row-index="1"]') as HTMLElement;
    // Headerless window: the table's own overflow:hidden suffices — body row is a
    // direct child of the table element (no extra wrapper).
    expect(bodyRow.parentElement).toBe(el);
  });
});
