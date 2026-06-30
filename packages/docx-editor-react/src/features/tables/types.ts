/**
 * Table contract — the actions the toolbar's table controls dispatch, plus the
 * editable table-level properties applied from the table-properties dialog.
 * React-package types only.
 */

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
  | 'borderAll'
  | 'borderOutside'
  | 'borderInside'
  | 'borderNone'
  | { type: 'cellFillColor'; color: string | null }
  | { type: 'borderColor'; color: string }
  | { type: 'borderWidth'; size: number }
  | { type: 'openTableProperties' };

/** Editable table-level properties (matches the core `setTableProperties` command). */
export interface TablePropertiesValue {
  width?: number | null;
  widthType?: string | null;
  justification?: 'left' | 'center' | 'right' | null;
}
