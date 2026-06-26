import { describe, test, expect } from 'bun:test';
import type { FlowBlock, TableBlock, TableRow } from '../../layout-engine/types';
import { demoteBlockLikeFloatingTables, isBlockLikeFloatingTable } from '../floatingTable';
import { resolveTableTotalWidthPx } from '../tableWidthUtils';

/**
 * Build a one-row, one-column TableBlock with explicit `columnWidths` so the
 * resolved width is deterministic (no scaling — `width`/`widthType` unset).
 */
function table(opts: {
  columnWidths: number[];
  floating?: TableBlock['floating'];
  justification?: TableBlock['justification'];
}): TableBlock {
  const cells = opts.columnWidths.map(
    () => ({ blocks: [] }) as unknown as TableRow['cells'][number]
  );
  const row: TableRow = { id: 0 as unknown as TableRow['id'], cells };
  return {
    kind: 'table',
    id: 0 as unknown as TableBlock['id'],
    rows: [row],
    columnWidths: opts.columnWidths,
    floating: opts.floating,
    justification: opts.justification,
  };
}

describe('resolveTableTotalWidthPx', () => {
  test('sums explicit column widths', () => {
    expect(resolveTableTotalWidthPx(table({ columnWidths: [200, 300] }), 800)).toBe(500);
  });

  test('falls back to content width for an empty table', () => {
    const empty: TableBlock = {
      kind: 'table',
      id: 0 as unknown as TableBlock['id'],
      rows: [],
      columnWidths: [],
    };
    expect(resolveTableTotalWidthPx(empty, 640)).toBe(640);
  });
});

describe('isBlockLikeFloatingTable', () => {
  test('non-floating table is never block-like', () => {
    expect(isBlockLikeFloatingTable(table({ columnWidths: [600] }), 620)).toBe(false);
  });

  test('full-width float with no wrap room on either side is block-like', () => {
    // 600px table in a 620px content area, left-anchored, ~9px text gaps.
    const t = table({
      columnWidths: [600],
      floating: { vertAnchor: 'text', leftFromText: 9, rightFromText: 9 },
    });
    expect(isBlockLikeFloatingTable(t, 620)).toBe(true);
  });

  test('narrow left-floated table keeps real wrap room on the right → stays floating', () => {
    const t = table({
      columnWidths: [200],
      floating: { tblpXSpec: 'left', leftFromText: 9, rightFromText: 9 },
    });
    expect(isBlockLikeFloatingTable(t, 620)).toBe(false);
  });

  test('wide float that still leaves > min room on one side is NOT block-like', () => {
    // 600px table, 700px content → 100px free on the right: text can wrap there.
    const t = table({ columnWidths: [600], floating: { leftFromText: 9, rightFromText: 9 } });
    expect(isBlockLikeFloatingTable(t, 700)).toBe(false);
  });

  test('centered full-width float is block-like (both side gaps below threshold)', () => {
    const t = table({
      columnWidths: [600],
      floating: { tblpXSpec: 'center', leftFromText: 0, rightFromText: 0 },
    });
    // x = (620 - 600) / 2 = 10 → 10px each side, both < MIN_WRAP_SEGMENT_WIDTH (24).
    expect(isBlockLikeFloatingTable(t, 620)).toBe(true);
  });
});

describe('demoteBlockLikeFloatingTables', () => {
  test('clears floating only on full-width floats, leaving narrow floats intact', () => {
    const fullWidth = table({
      columnWidths: [600],
      floating: { vertAnchor: 'text', leftFromText: 9, rightFromText: 9 },
    });
    const narrow = table({
      columnWidths: [200],
      floating: { tblpXSpec: 'left', leftFromText: 9, rightFromText: 9 },
    });
    const inline = table({ columnWidths: [600] });
    const blocks: FlowBlock[] = [fullWidth, narrow, inline];

    demoteBlockLikeFloatingTables(blocks, [620, 620, 620], 620);

    expect((blocks[0] as TableBlock).floating).toBeUndefined(); // demoted
    expect((blocks[1] as TableBlock).floating).toBeDefined(); // still floating
    expect((blocks[2] as TableBlock).floating).toBeUndefined(); // was never floating
    // The original source object is untouched (replaced with a copy).
    expect(fullWidth.floating).toBeDefined();
  });

  test('falls back to fallbackWidth when a per-block width is missing', () => {
    const fullWidth = table({
      columnWidths: [600],
      floating: { vertAnchor: 'text', leftFromText: 9, rightFromText: 9 },
    });
    const blocks: FlowBlock[] = [fullWidth];
    demoteBlockLikeFloatingTables(blocks, [], 620);
    expect((blocks[0] as TableBlock).floating).toBeUndefined();
  });
});
