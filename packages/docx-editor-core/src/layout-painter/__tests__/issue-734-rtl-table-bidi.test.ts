/**
 * Painter: an RTL table (`w:bidiVisual`) must lay out its columns in reversed
 * visual order — logical column 0 renders at the RIGHT edge, matching Word
 * (issue #734: a Hebrew label in cell 0 appeared on the wrong side of the
 * underline field in cell 1). The mirror is geometry-only; cell content,
 * column widths, and the saved document are unchanged.
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

// 1-row, 2-col table. Column 0 (width 100) holds the label, column 1 (width
// 150) the field. tableWidth = 250.
function build(bidi: boolean): {
  block: TableBlock;
  measure: TableMeasure;
  fragment: TableFragment;
} {
  const block = {
    kind: 'table',
    id: 't',
    bidi,
    columnWidths: [100, 150],
    rows: [
      {
        id: 0,
        cells: [
          { id: 1, blocks: [{ kind: 'paragraph', id: 1, runs: [] }] },
          { id: 2, blocks: [{ kind: 'paragraph', id: 2, runs: [] }] },
        ],
      },
    ],
  } as unknown as TableBlock;

  const measure: TableMeasure = {
    kind: 'table',
    columnWidths: [100, 150],
    totalWidth: 250,
    totalHeight: LINE,
    rows: [
      {
        height: LINE,
        cells: [
          { blocks: [pm(1)], width: 100, height: LINE },
          { blocks: [pm(1)], width: 150, height: LINE },
        ],
      },
    ],
  };

  const fragment: TableFragment = {
    kind: 'table',
    blockId: 't',
    x: 0,
    y: 0,
    width: 250,
    height: LINE,
    fromRow: 0,
    toRow: 1,
  };
  return { block, measure, fragment };
}

function leftByColumn(el: HTMLElement): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of [...el.querySelectorAll('.layout-table-cell')] as HTMLElement[]) {
    if (c.dataset.vmergeContinuation) continue;
    out[c.dataset.columnIndex ?? '?'] = parseFloat(c.style.left);
  }
  return out;
}

describe('renderTableFragment — RTL table (w:bidiVisual) column mirror', () => {
  test('LTR (no bidi): logical column 0 is leftmost', () => {
    const { block, measure, fragment } = build(false);
    const left = leftByColumn(renderTableFragment(fragment, block, measure, ctx));
    expect(left['0']).toBeCloseTo(0, 0); // label at left edge
    expect(left['1']).toBeCloseTo(100, 0); // field after it
  });

  test('RTL (bidi): logical column 0 is rightmost', () => {
    const { block, measure, fragment } = build(true);
    const left = leftByColumn(renderTableFragment(fragment, block, measure, ctx));
    // Column 0 (width 100) mirrors to tableWidth - 0 - 100 = 150 (right side).
    expect(left['0']).toBeCloseTo(150, 0);
    // Column 1 (width 150) mirrors to tableWidth - 100 - 150 = 0 (left side).
    expect(left['1']).toBeCloseTo(0, 0);
  });

  test('RTL mirrors the column resize handle to the visual boundary', () => {
    const { block, measure, fragment } = build(true);
    const el = renderTableFragment(fragment, block, measure, ctx);
    const handle = el.querySelector('.layout-table-resize-handle') as HTMLElement;
    // Boundary between the two columns sits at tableWidth - 100 = 150, minus the
    // 3px grab inset.
    expect(parseFloat(handle.style.left)).toBeCloseTo(147, 0);
  });

  test('LTR resize handle is unchanged (regression guard)', () => {
    const { block, measure, fragment } = build(false);
    const el = renderTableFragment(fragment, block, measure, ctx);
    const handle = el.querySelector('.layout-table-resize-handle') as HTMLElement;
    expect(parseFloat(handle.style.left)).toBeCloseTo(97, 0); // 100 - 3
  });

  // A `w:bidiVisual` table can live inside another table's cell; that path goes
  // through renderNestedTable, which must mirror columns too.
  test('RTL is honored for a table nested inside a cell', () => {
    const inner = build(true); // the 2-col bidi table from above
    const outerBlock = {
      kind: 'table',
      id: 'outer',
      columnWidths: [300],
      rows: [{ id: 0, cells: [{ id: 1, blocks: [inner.block] }] }],
    } as unknown as TableBlock;
    const outerMeasure: TableMeasure = {
      kind: 'table',
      columnWidths: [300],
      totalWidth: 300,
      totalHeight: LINE,
      rows: [
        {
          height: LINE,
          cells: [{ blocks: [inner.measure], width: 300, height: LINE }],
        },
      ],
    };
    const outerFragment: TableFragment = {
      kind: 'table',
      blockId: 'outer',
      x: 0,
      y: 0,
      width: 300,
      height: LINE,
      fromRow: 0,
      toRow: 1,
    };
    const el = renderTableFragment(outerFragment, outerBlock, outerMeasure, ctx);
    const nested = el.querySelector('.layout-nested-table') as HTMLElement;
    expect(nested).toBeTruthy();
    const left: Record<string, number> = {};
    for (const c of [...nested.querySelectorAll('.layout-table-cell')] as HTMLElement[]) {
      left[c.dataset.columnIndex ?? '?'] = parseFloat(c.style.left);
    }
    expect(left['0']).toBeCloseTo(150, 0); // logical column 0 mirrored to the right
    expect(left['1']).toBeCloseTo(0, 0);
  });
});
