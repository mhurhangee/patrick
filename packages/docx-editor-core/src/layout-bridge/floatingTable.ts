/**
 * Detect "block-like" floating tables.
 *
 * A DOCX table with `w:tblpPr` is a positioned ("floating") table — text wraps
 * around it. But contract templates routinely make a full-width form table
 * floating (often a paste artifact), leaving NO horizontal room for text on
 * either side. Word and Google Docs treat such a table as a normal in-flow
 * block: it paginates across pages and following content flows beneath it.
 *
 * Our floating path instead places the whole table as one fragment (no
 * pagination — it overflows past the page) AND registers a text-wrap zone the
 * height of the table, so the next paragraph's first line is pushed past the
 * entire table and lands off-page. Demoting these tables to inline (see
 * `computeLayout`) fixes both: they paginate via `layoutTable` and create no
 * wrap zone.
 *
 * The predicate mirrors the geometry in `layoutFloatingTable` (the existing
 * block-like cursor-advance) and `extractFloatingTableZone`; keep the three in
 * sync. Narrow floating tables — where text genuinely wraps beside them — fall
 * below the threshold and stay floating.
 */

import type { FlowBlock, TableBlock } from '../layout-engine/types';
import { MIN_WRAP_SEGMENT_WIDTH } from './measuring/floatingZones';
import { resolveTableTotalWidthPx } from './tableWidthUtils';

/**
 * True when a floating table is effectively full-width — it leaves less than
 * {@link MIN_WRAP_SEGMENT_WIDTH} of usable text room on BOTH sides, so no text
 * can wrap beside it. Returns false for non-floating tables and for narrow
 * floats that leave real wrap room.
 *
 * @internal
 */
export function isBlockLikeFloatingTable(block: TableBlock, contentWidth: number): boolean {
  const floating = block.floating;
  if (!floating) return false;

  const tableWidth = resolveTableTotalWidthPx(block, contentWidth);

  // Content-relative X of the table's left edge — same resolution order as
  // `layoutFloatingTable` / `extractFloatingTableZone`.
  let x = 0;
  if (floating.tblpX !== undefined) {
    x = floating.tblpX;
  } else if (floating.tblpXSpec) {
    if (floating.tblpXSpec === 'left' || floating.tblpXSpec === 'inside') {
      x = 0;
    } else if (floating.tblpXSpec === 'right' || floating.tblpXSpec === 'outside') {
      x = contentWidth - tableWidth;
    } else if (floating.tblpXSpec === 'center') {
      x = (contentWidth - tableWidth) / 2;
    }
  } else if (block.justification === 'center') {
    x = (contentWidth - tableWidth) / 2;
  } else if (block.justification === 'right') {
    x = contentWidth - tableWidth;
  }

  const leftFromText = floating.leftFromText ?? 0;
  const rightFromText = floating.rightFromText ?? 0;
  const leftSpace = x - leftFromText;
  const rightSpace = contentWidth - (x + tableWidth) - rightFromText;

  return leftSpace < MIN_WRAP_SEGMENT_WIDTH && rightSpace < MIN_WRAP_SEGMENT_WIDTH;
}

/**
 * In place, clear `floating` on every block-like floating table so the rest of
 * the pipeline treats it as a normal inline table — it then paginates via
 * `layoutTable` and registers no text-wrap zone. `blockWidths[i]` is the
 * block's section content width (from `computePerBlockWidths`); `fallbackWidth`
 * covers a missing entry. Demoted entries are replaced with shallow copies, so
 * any cached source block the caller holds is left untouched.
 *
 * @internal
 */
export function demoteBlockLikeFloatingTables(
  blocks: FlowBlock[],
  blockWidths: number[],
  fallbackWidth: number
): void {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (
      block.kind === 'table' &&
      block.floating &&
      isBlockLikeFloatingTable(block, blockWidths[i] ?? fallbackWidth)
    ) {
      blocks[i] = { ...block, floating: undefined };
    }
  }
}
