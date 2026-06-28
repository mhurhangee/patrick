/**
 * Table contract — the actions the toolbar's table controls dispatch and the
 * shapes the table-editing glue (`useTableSelection`) operates on. React-package
 * types only.
 */

import type { Table } from '@eigenpal/docx-editor-core/types/document';

/**
 * Table editing action types
 */
export type TableAction =
  | 'addRowAbove'
  | 'addRowBelow'
  | 'addColumnLeft'
  | 'addColumnRight'
  | 'deleteRow'
  | 'deleteColumn'
  | 'mergeCells'
  | 'splitCell'
  | 'deleteTable'
  | 'selectTable'
  | 'selectRow'
  | 'selectColumn'
  | 'borderAll'
  | 'borderOutside'
  | 'borderInside'
  | 'borderNone'
  | 'borderTop'
  | 'borderBottom'
  | 'borderLeft'
  | 'borderRight'
  | { type: 'cellFillColor'; color: string | null }
  | { type: 'borderColor'; color: string }
  | { type: 'borderWidth'; size: number }
  | {
      type: 'cellBorder';
      side: 'top' | 'bottom' | 'left' | 'right' | 'all';
      style: string;
      size: number;
      color: string;
    }
  | { type: 'cellVerticalAlign'; align: 'top' | 'center' | 'bottom' }
  | {
      type: 'cellMargins';
      margins: { top?: number; bottom?: number; left?: number; right?: number };
    }
  | { type: 'cellTextDirection'; direction: string | null }
  | { type: 'toggleNoWrap' }
  | { type: 'rowHeight'; height: number | null; rule?: 'auto' | 'atLeast' | 'exact' }
  | { type: 'toggleHeaderRow' }
  | { type: 'distributeColumns' }
  | { type: 'autoFitContents' }
  | {
      type: 'tableProperties';
      props: {
        width?: number | null;
        widthType?: string | null;
        justification?: 'left' | 'center' | 'right' | null;
      };
    }
  | { type: 'openTableProperties' }
  | { type: 'applyTableStyle'; styleId: string };

/**
 * Border style preset
 */
export type BorderPreset = 'all' | 'outside' | 'inside' | 'none' | 'top' | 'bottom' | 'left' | 'right';

/**
 * Selection within a table
 */
export interface TableSelection {
  /** Index of the table in the document */
  tableIndex: number;
  /** Row index (0-indexed) */
  rowIndex: number;
  /** Column index (0-indexed) */
  columnIndex: number;
  /** Selected cell range for multi-cell selection */
  selectedCells?: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  };
}

/**
 * Context for table operations
 */
export interface TableContext {
  /** The table being edited */
  table: Table;
  /** Current selection within the table */
  selection: TableSelection;
  /** Whether multiple cells are selected (for merge) */
  hasMultiCellSelection: boolean;
  /** Whether current cell can be split */
  canSplitCell: boolean;
  /** Total number of rows */
  rowCount: number;
  /** Total number of columns */
  columnCount: number;
}

export interface TableSplitConfig {
  minRows: number;
  minCols: number;
  initialRows: number;
  initialCols: number;
}
