import { describe, test, expect } from 'bun:test';

import { layoutDocument } from '../index';
import type {
  FlowBlock,
  Measure,
  ParagraphBlock,
  ParagraphMeasure,
  TableBlock,
  TableFragment,
  TableMeasure,
} from '../types';
import { makeLayoutOptions } from './helpers';

const LINE = 20;

function para(id: number): ParagraphBlock {
  return {
    kind: 'paragraph',
    id,
    runs: [{ kind: 'text', text: 'x' }],
  } as unknown as ParagraphBlock;
}

function paraMeasure(lines: number): ParagraphMeasure {
  return {
    kind: 'paragraph',
    lines: Array.from({ length: lines }, () => ({
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 10,
      ascent: LINE * 0.8,
      descent: LINE * 0.2,
      lineHeight: LINE,
    })),
    totalHeight: lines * LINE,
  };
}

/**
 * A 3-row, 2-col table. Col 0 is a rowSpan=3 merged cell with `mergeLines`
 * of content; col 1 has one line per row. Row heights are supplied directly
 * in the measure (as the real measurer would, after Word vmerge distribution).
 */
function buildTable(
  mergeLines: number,
  rowHeights: number[]
): { block: TableBlock; measure: TableMeasure } {
  const block = {
    kind: 'table',
    id: 100,
    columnWidths: [100, 100],
    rows: [
      {
        id: 0,
        cells: [
          { id: 1, rowSpan: 3, blocks: [para(1)] },
          { id: 2, blocks: [para(2)] },
        ],
      },
      { id: 3, cells: [{ id: 4, blocks: [para(4)] }] },
      { id: 5, cells: [{ id: 6, blocks: [para(6)] }] },
    ],
  } as unknown as TableBlock;

  const measure: TableMeasure = {
    kind: 'table',
    columnWidths: [100, 100],
    totalWidth: 200,
    totalHeight: rowHeights.reduce((a, b) => a + b, 0),
    rows: [
      {
        height: rowHeights[0],
        cells: [
          { blocks: [paraMeasure(mergeLines)], width: 100, height: mergeLines * LINE, rowSpan: 3 },
          { blocks: [paraMeasure(1)], width: 100, height: LINE },
        ],
      },
      { height: rowHeights[1], cells: [{ blocks: [paraMeasure(1)], width: 100, height: LINE }] },
      { height: rowHeights[2], cells: [{ blocks: [paraMeasure(1)], width: 100, height: LINE }] },
    ],
  };

  return { block, measure };
}

describe('Layout engine — table row breaking (Word fidelity)', () => {
  test('breaks a tall merged row across pages with clips', () => {
    // Last row holds the merged-cell overflow (Word distribution): 1, 1, 38 lines.
    const { block, measure } = buildTable(40, [LINE, LINE, 38 * LINE]);
    const blocks: FlowBlock[] = [block];
    const measures: Measure[] = [measure];

    // Small page so the 800px-tall table must split mid-row.
    const layout = layoutDocument(
      blocks,
      measures,
      makeLayoutOptions({
        pageSize: { w: 816, h: 600 },
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
      })
    );

    const tableFrags = layout.pages
      .flatMap((p) => p.fragments)
      .filter((f): f is TableFragment => f.kind === 'table');

    expect(tableFrags.length).toBeGreaterThanOrEqual(2);

    // The table spans more than one page.
    expect(layout.pages.length).toBeGreaterThanOrEqual(2);

    // First fragment starts at row 0 and breaks mid-content (bottomClip set).
    const first = tableFrags[0];
    expect(first.fromRow).toBe(0);
    expect(first.continuesOnNext).toBe(true);
    expect(first.bottomClip).toBeGreaterThan(0);

    // A continuation fragment picks up inside the last row (topClip set).
    const continuation = tableFrags.find((f) => (f.topClip ?? 0) > 0);
    expect(continuation).toBeDefined();
    expect(continuation!.continuesFromPrev).toBe(true);
    expect(continuation!.fromRow).toBe(2); // the tall last row

    // Break points are whole lines (multiples of the line height).
    expect(first.bottomClip! % LINE).toBe(0);
  });

  test('keeps a w:cantSplit row whole (moves it to the next page instead of breaking)', () => {
    // Two single-cell rows: a short one, then a tall cantSplit row that does
    // not fit in the space left after the short row but fits on a fresh page.
    const block = {
      kind: 'table',
      id: 200,
      columnWidths: [100],
      rows: [
        { id: 0, cells: [{ id: 1, blocks: [para(1)] }] },
        { id: 2, cantSplit: true, cells: [{ id: 3, blocks: [para(3)] }] },
      ],
    } as unknown as TableBlock;
    const measure: TableMeasure = {
      kind: 'table',
      columnWidths: [100],
      totalWidth: 100,
      totalHeight: 21 * LINE,
      rows: [
        { height: LINE, cells: [{ blocks: [paraMeasure(1)], width: 100, height: LINE }] },
        {
          height: 20 * LINE,
          cells: [{ blocks: [paraMeasure(20)], width: 100, height: 20 * LINE }],
        },
      ],
    };

    const layout = layoutDocument(
      [block],
      [measure],
      makeLayoutOptions({
        pageSize: { w: 816, h: 500 },
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
      })
    );

    const tableFrags = layout.pages
      .flatMap((p) => p.fragments)
      .filter((f): f is TableFragment => f.kind === 'table');

    // The cantSplit row was never broken: no fragment carries a clip.
    for (const f of tableFrags) {
      expect(f.topClip).toBeUndefined();
      expect(f.bottomClip).toBeUndefined();
    }
    // The cantSplit row sits on its own fragment, whole (rows [1,2)).
    const tallFrag = tableFrags.find((f) => f.fromRow === 1);
    expect(tallFrag).toBeDefined();
    expect(tallFrag!.toRow).toBe(2);
  });

  test('does not split a table that fits', () => {
    const { block, measure } = buildTable(3, [LINE, LINE, LINE]);
    const layout = layoutDocument([block], [measure], makeLayoutOptions());
    const tableFrags = layout.pages.flatMap((p) => p.fragments).filter((f) => f.kind === 'table');
    expect(tableFrags.length).toBe(1);
    expect((tableFrags[0] as TableFragment).bottomClip).toBeUndefined();
    expect((tableFrags[0] as TableFragment).topClip).toBeUndefined();
  });
});
