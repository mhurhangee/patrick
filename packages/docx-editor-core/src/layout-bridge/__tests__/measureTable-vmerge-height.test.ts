import { describe, expect, it } from 'bun:test';
import { measureTableBlock } from '../measureTable';
import type { FlowBlock, Measure, ParagraphBlock, TableBlock } from '../../layout-engine/types';

const LINE = 20;

/** Stub measureBlock: every paragraph is `lines` tall (tracked via WeakMap). */
const lineCounts = new WeakMap<object, number>();
function p(text: string, lines: number): ParagraphBlock {
  const block = {
    kind: 'paragraph',
    id: `p-${text}`,
    runs: [{ kind: 'text', text }],
  } as unknown as ParagraphBlock;
  lineCounts.set(block, lines);
  return block;
}

const measureBlock = (block: FlowBlock, _w: number): Measure => {
  const n = lineCounts.get(block) ?? 1;
  return {
    kind: 'paragraph',
    lines: Array.from({ length: n }, () => ({
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 10,
      ascent: LINE * 0.8,
      descent: LINE * 0.2,
      lineHeight: LINE,
    })),
    totalHeight: n * LINE,
  };
};

/** 3-row, 2-col table: col 0 is a rowSpan=3 merged cell with `mergeLines` of content. */
function buildVMergeTable(mergeLines: number): TableBlock {
  return {
    kind: 'table',
    id: 't1',
    columnWidths: [100, 100],
    rows: [
      {
        id: 'r0',
        cells: [
          { id: 'c00', rowSpan: 3, blocks: [p('M', mergeLines)] },
          { id: 'c01', blocks: [p('A', 1)] },
        ],
      },
      { id: 'r1', cells: [{ id: 'c11', blocks: [p('B', 1)] }] },
      { id: 'r2', cells: [{ id: 'c21', blocks: [p('C', 1)] }] },
    ],
  } as unknown as TableBlock;
}

describe('measureTable vertical-merge row heights (Word fidelity)', () => {
  it('does not inflate the restart row; rows keep their own single-cell height', () => {
    // Merged cell content (3 lines) fits within the 3 spanned rows (3 * 1 line).
    const m = measureTableBlock(buildVMergeTable(3), 200, measureBlock);
    expect(m.rows[0].height).toBe(LINE); // restart row stays 1 line (its own cell "A")
    expect(m.rows[1].height).toBe(LINE);
    expect(m.rows[2].height).toBe(LINE);
  });

  it('pushes merged-cell overflow into the LAST spanned row', () => {
    // Merged cell is 7 lines but the 3 rows naturally hold only 3 lines.
    const m = measureTableBlock(buildVMergeTable(7), 200, measureBlock);
    expect(m.rows[0].height).toBe(LINE); // A — unchanged
    expect(m.rows[1].height).toBe(LINE); // B — unchanged
    // Last row absorbs the deficit: 7 - (1 + 1) = 5 lines.
    expect(m.rows[2].height).toBe(5 * LINE);
    // Total region equals the merged content height.
    expect(m.rows[0].height + m.rows[1].height + m.rows[2].height).toBe(7 * LINE);
  });

  it('collapses adjacent-paragraph spacing within a cell (not additive)', () => {
    const SP = 8; // before == after on every paragraph
    // A measureBlock whose paragraph height bundles before + lines + after,
    // like the real measureParagraph.
    const para = (id: string): ParagraphBlock =>
      ({
        kind: 'paragraph',
        id,
        runs: [{ kind: 'text', text: id }],
        attrs: { spacing: { before: SP, after: SP } },
      }) as unknown as ParagraphBlock;
    const mb = (): Measure => ({
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 0,
          width: 10,
          ascent: 16,
          descent: 4,
          lineHeight: LINE,
        },
      ],
      totalHeight: SP + LINE + SP, // before + 1 line + after
    });
    const block = {
      kind: 'table',
      id: 't',
      columnWidths: [100],
      rows: [{ id: 'r', cells: [{ id: 'c', blocks: [para('a'), para('b'), para('c')] }] }],
    } as unknown as TableBlock;

    const m = measureTableBlock(block, 100, mb);
    // Collapse + trailing after (painter renders it as paddingBottom):
    //   before(8) + line(20) + max(8,8)=8 + line(20) + 8 + line(20) + after(8) = 92.
    // Additive (the old bug) would have been 3 * (8 + 20 + 8) = 108.
    expect(m.rows[0].height).toBe(SP + LINE + SP + LINE + SP + LINE + SP);
  });
});
