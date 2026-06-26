/**
 * @internal Helpers for resolving DOCX table-width metadata into pixel widths.
 */

import type { TableBlock } from '../layout-engine';
import { twipsToPixels } from '../utils/units';

/**
 * Resolve a DOCX width pair to pixels. `pct` values are 50ths of a percent
 * (ECMA-376 §17.18.111 — 5000 means 100%). `dxa` / `auto` / unset are twips.
 *
 * @internal
 */
export function resolveTableWidthPx(
  value: number | undefined,
  widthType: string | undefined,
  parentWidth: number
): number | undefined {
  if (!value || value <= 0) return undefined;
  if (widthType === 'pct') {
    return (parentWidth * value) / 5000;
  }
  if (!widthType || widthType === 'dxa' || widthType === 'auto') {
    return twipsToPixels(value);
  }
  return undefined;
}

/** A cell with its resolved grid position (column index honoring spans). */
export interface ResolvedGridCell {
  rowIndex: number;
  cellIndex: number;
  columnIndex: number;
  colSpan: number;
  rowSpan: number;
}

/**
 * Resolve every cell's grid column index, accounting for `colSpan` and the
 * columns occupied by vertically-merged (`rowSpan`) cells from earlier rows.
 *
 * Single source of truth for table grid geometry — the measurer, the painter,
 * and the row-break paginator all consume this so they agree on which column a
 * cell lives in. Width-free on purpose: callers multiply `columnIndex` by their
 * own (possibly scaled) column widths to get an x offset.
 *
 * @internal
 */
export function resolveCellGrid(tableBlock: TableBlock): ResolvedGridCell[] {
  const occupied = new Map<number, Set<number>>();
  const out: ResolvedGridCell[] = [];
  for (let rowIndex = 0; rowIndex < tableBlock.rows.length; rowIndex++) {
    const cells = tableBlock.rows[rowIndex]?.cells ?? [];
    const occ = occupied.get(rowIndex) ?? new Set<number>();
    let columnIndex = 0;
    while (occ.has(columnIndex)) columnIndex++;
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const cell = cells[cellIndex];
      if (!cell) continue;
      const colSpan = cell.colSpan ?? 1;
      const rowSpan = cell.rowSpan ?? 1;
      out.push({ rowIndex, cellIndex, columnIndex, colSpan, rowSpan });
      if (rowSpan > 1) {
        for (let r = rowIndex + 1; r < rowIndex + rowSpan; r++) {
          if (!occupied.has(r)) occupied.set(r, new Set());
          const s = occupied.get(r)!;
          for (let c = 0; c < colSpan; c++) s.add(columnIndex + c);
        }
      }
      columnIndex += colSpan;
      while (occ.has(columnIndex)) columnIndex++;
    }
  }
  return out;
}

/** Total grid columns, derived from the widest row's accumulated colSpans. */
export function countTableColumns(tableBlock: TableBlock): number {
  return Math.max(
    1,
    ...tableBlock.rows.map((row) =>
      row.cells.reduce((sum, cell) => sum + Math.max(1, cell.colSpan ?? 1), 0)
    )
  );
}

/**
 * Make `columnWidths` exactly `colCount` long with every entry positive.
 * Missing trailing columns inherit the average of existing positives; zero
 * or negative entries split the leftover `targetWidth` evenly. Callers
 * scale down totals that exceed the target — this helper only fills gaps.
 */
export function normalizeTableColumnWidths(
  columnWidths: number[],
  colCount: number,
  targetWidth: number
): number[] {
  if (colCount <= 0) return [];

  const evenWidth = targetWidth > 0 ? targetWidth / colCount : 0;

  if (columnWidths.length === 0) {
    return Array(colCount).fill(evenWidth);
  }

  let normalized = columnWidths.slice(0, colCount);
  const missingColumns = colCount - normalized.length;
  if (missingColumns > 0) {
    const existingPositive = normalized.filter((width) => width > 0);
    const fallbackWidth =
      existingPositive.length > 0
        ? existingPositive.reduce((sum, width) => sum + width, 0) / existingPositive.length
        : evenWidth;
    normalized = normalized.concat(Array(missingColumns).fill(fallbackWidth));
  }

  const positiveTotal = normalized.reduce((sum, width) => sum + (width > 0 ? width : 0), 0);
  const nonPositiveCount = normalized.filter((width) => width <= 0).length;

  if (positiveTotal <= 0) return Array(colCount).fill(evenWidth);
  if (nonPositiveCount === 0) return normalized;

  const remainingWidth = Math.max(0, targetWidth - positiveTotal);
  const fallbackWidth =
    remainingWidth > 0
      ? remainingWidth / nonPositiveCount
      : positiveTotal / Math.max(1, colCount - nonPositiveCount);

  return normalized.map((width) => (width > 0 ? width : fallbackWidth));
}

/**
 * Resolve a table's per-column pixel widths from its grid metadata and width
 * budget — the width half of `measureTableBlock`, with NO cell-content
 * measurement. Factored out so a caller that only needs widths (e.g. deciding
 * whether a floating table is effectively full-width, before the main measure
 * pass) doesn't have to measure every cell.
 *
 * @internal
 */
export function resolveTableColumnWidths(tableBlock: TableBlock, contentWidth: number): number[] {
  let columnWidths = tableBlock.columnWidths ?? [];
  const explicitWidthPx = resolveTableWidthPx(tableBlock.width, tableBlock.widthType, contentWidth);
  const colCount = countTableColumns(tableBlock);
  const targetWidth = explicitWidthPx ?? contentWidth;

  if (tableBlock.rows.length > 0) {
    columnWidths = normalizeTableColumnWidths(columnWidths, colCount, targetWidth);
  }

  if (columnWidths.length > 0 && explicitWidthPx) {
    const total = columnWidths.reduce((sum, w) => sum + w, 0);
    if (total > 0 && Math.abs(total - explicitWidthPx) > 1) {
      const scale = explicitWidthPx / total;
      columnWidths = columnWidths.map((w) => w * scale);
    }
  }

  return columnWidths;
}

/**
 * Total pixel width of a table — sum of its resolved column widths, falling
 * back to the explicit table width or the content-width budget. No cell-content
 * measurement, so it is safe to call before the main measure pass. Mirrors the
 * `totalWidth` that `measureTableBlock` produces.
 *
 * @internal
 */
export function resolveTableTotalWidthPx(tableBlock: TableBlock, contentWidth: number): number {
  const columnWidths = resolveTableColumnWidths(tableBlock, contentWidth);
  const explicitWidthPx = resolveTableWidthPx(tableBlock.width, tableBlock.widthType, contentWidth);
  return columnWidths.reduce((w, cw) => w + cw, 0) || explicitWidthPx || contentWidth;
}
