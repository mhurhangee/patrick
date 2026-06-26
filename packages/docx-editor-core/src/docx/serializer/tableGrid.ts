import type { Table } from '../../types/document';
import { DEFAULT_TABLE_WIDTH_DXA, distributeColumnWidths } from '../../utils/tableWidth';
import { intAttr } from './xmlUtils';

function positiveIntegerOrUndefined(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(1, Math.round(value));
}

/**
 * Number of grid columns the table spans — the widest row's summed gridSpan.
 * Using the max across rows (not just the first row) keeps the grid wide
 * enough when the first row is a merged/spanning header.
 */
function getGridColumnCount(table: Table): number {
  if (table.columnWidths && table.columnWidths.length > 0) {
    return table.columnWidths.length;
  }

  return table.rows.reduce((max, row) => {
    const cols = row.cells.reduce(
      (count, cell) => count + Math.max(1, Math.round(cell.formatting?.gridSpan ?? 1)),
      0
    );
    return Math.max(max, cols);
  }, 0);
}

/**
 * Per-column widths a row implies, expanding each cell across its gridSpan.
 * Returns undefined if any cell lacks an explicit width (an incomplete row).
 */
function rowColumnWidths(row: Table['rows'][number]): number[] | undefined {
  const widths: number[] = [];
  for (const cell of row.cells) {
    const width = positiveIntegerOrUndefined(cell.formatting?.width?.value);
    if (width == null) return undefined;
    const gridSpan = Math.max(1, Math.round(cell.formatting?.gridSpan ?? 1));
    widths.push(...distributeColumnWidths(width, gridSpan));
  }
  return widths;
}

function inferTableGridWidths(table: Table): number[] {
  const explicitWidths = table.columnWidths
    ?.map((width) => positiveIntegerOrUndefined(width))
    .filter((width): width is number => width != null);

  if (explicitWidths && explicitWidths.length > 0) {
    return explicitWidths;
  }

  const columnCount = getGridColumnCount(table);
  if (columnCount <= 0) return [];

  // Mirror the widths from the most granular fully-specified row (the one with
  // the most cells), so a merged spanning header doesn't dictate the grid over
  // the real per-column widths the body rows carry.
  let bestWidths: number[] | undefined;
  let bestCellCount = -1;
  for (const row of table.rows) {
    const widths = rowColumnWidths(row);
    if (widths && widths.length === columnCount && row.cells.length > bestCellCount) {
      bestWidths = widths;
      bestCellCount = row.cells.length;
    }
  }
  if (bestWidths) return bestWidths;

  const tableWidth =
    table.formatting?.width?.type === 'dxa'
      ? positiveIntegerOrUndefined(table.formatting.width.value)
      : undefined;
  return distributeColumnWidths(tableWidth ?? DEFAULT_TABLE_WIDTH_DXA, columnCount);
}

/**
 * Serialize `w:tblGrid` for a table. A `w:tblGrid` is a required child of
 * `w:tbl`, so a grid is derived from explicit column widths, first-row cell
 * widths, or an even split of the table width when none are present.
 */
export function serializeTableGridForTable(table: Table): string {
  const columnWidths = inferTableGridWidths(table);
  if (columnWidths.length === 0) return '';

  const cols = columnWidths.map((w) => `<w:gridCol w:w="${intAttr(w)}"/>`);
  return `<w:tblGrid>${cols.join('')}</w:tblGrid>`;
}
