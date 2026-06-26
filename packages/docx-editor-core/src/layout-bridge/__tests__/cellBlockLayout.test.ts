import { describe, expect, it } from 'bun:test';
import { layoutCellContent } from '../cellBlockLayout';
import type { FlowBlock, Measure, ParagraphBlock } from '../../layout-engine/types';

const LINE = 20;
const SP = 8;

function para(spacing?: { before?: number; after?: number }): ParagraphBlock {
  return {
    kind: 'paragraph',
    id: 'p',
    runs: [{ kind: 'text', text: 'x' }],
    attrs: spacing ? { spacing } : undefined,
  } as unknown as ParagraphBlock;
}

function pm(lines: number, spacing?: { before?: number; after?: number }): Measure {
  const before = spacing?.before ?? 0;
  const after = spacing?.after ?? 0;
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
    totalHeight: before + lines * LINE + after,
  } as Measure;
}

describe('layoutCellContent (shared cell vertical geometry)', () => {
  it('collapses adjacent paragraph spacing and stacks lines from each block top', () => {
    const sp = { before: SP, after: SP };
    const blocks: FlowBlock[] = [para(sp), para(sp), para(sp)];
    const measures: Measure[] = [pm(1, sp), pm(1, sp), pm(1, sp)];

    const layout = layoutCellContent(blocks, measures, 0);

    // line tops: 8, then 8+20+max(8,8)=36, then 36+20+8=64
    expect(layout.lineTops[0]).toEqual([SP]);
    expect(layout.lineTops[1]).toEqual([SP + LINE + SP]);
    expect(layout.lineTops[2]).toEqual([SP + LINE + SP + LINE + SP]);
    expect(layout.flatBottoms).toEqual([
      SP + LINE,
      SP + LINE + SP + LINE,
      SP + LINE + SP + LINE + SP + LINE,
    ]);
    // content height includes the trailing after (painter paddingBottom)
    expect(layout.contentHeight).toBe(SP + LINE + SP + LINE + SP + LINE + SP);
  });

  it('treats a non-paragraph (nested table) block as one atomic break point', () => {
    const blocks: FlowBlock[] = [
      para({ before: SP, after: SP }),
      { kind: 'table', id: 'nested' } as unknown as FlowBlock,
    ];
    const measures: Measure[] = [
      pm(1, { before: SP, after: SP }),
      { kind: 'table', totalHeight: 50 } as unknown as Measure,
    ];
    const layout = layoutCellContent(blocks, measures, 0);
    // paragraph line bottom at 8+20=28; nested table atomic: gap = prevAfter(8) + 50
    expect(layout.lineTops[0]).toEqual([SP]);
    expect(layout.lineTops[1]).toEqual([]); // atomic block has no per-line tops
    expect(layout.flatBottoms).toEqual([SP + LINE, SP + LINE + SP + 50]);
    expect(layout.contentHeight).toBe(SP + LINE + SP + 50);
  });

  it('honors startY and multi-line blocks', () => {
    const blocks: FlowBlock[] = [para(), para()];
    const measures: Measure[] = [pm(2), pm(1)];
    const layout = layoutCellContent(blocks, measures, 5);
    // block 0: tops 5, 25 (two lines); block 1: top 45
    expect(layout.lineTops[0]).toEqual([5, 5 + LINE]);
    expect(layout.lineTops[1]).toEqual([5 + 2 * LINE]);
    expect(layout.contentHeight).toBe(3 * LINE);
  });
});
