/**
 * Table-scope selection commands. Each builds a `CellSelection` spanning
 * the requested region (whole table, current row, current column) and
 * dispatches it onto the transaction.
 *
 * Schema-free — the commands only walk the existing table's node tree and
 * resolve PM positions.
 */

import { type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { CellSelection, TableMap } from 'prosemirror-tables';
import { getTableContext } from '../context';

export const selectTable: Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean => {
  const context = getTableContext(state);
  if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

  if (dispatch) {
    // `CellSelection.create` needs positions that point AT a cell (the
    // position just before the cell node), not at the enclosing row. Use the
    // table's grid map to resolve the top-left and bottom-right cells — this
    // is correct for merged cells too.
    const map = TableMap.get(context.table);
    const tableStart = context.tablePos + 1;
    const firstCellPos = tableStart + map.map[0];
    const lastCellPos = tableStart + map.map[map.map.length - 1];
    const cellSel = CellSelection.create(state.doc, firstCellPos, lastCellPos);
    dispatch(state.tr.setSelection(cellSel));
  }
  return true;
};

export const selectRow: Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean => {
  const context = getTableContext(state);
  if (
    !context.isInTable ||
    context.tablePos === undefined ||
    !context.table ||
    context.rowIndex === undefined
  )
    return false;

  if (dispatch) {
    const tableStart = context.tablePos + 1;
    // Navigate to the target row
    let rowPos = tableStart;
    for (let r = 0; r < context.rowIndex; r++) {
      const row = context.table.child(r);
      rowPos += row.nodeSize;
    }
    const row = context.table.child(context.rowIndex);
    const firstCellPos = rowPos + 1; // inside the row
    const lastCellPos = rowPos + row.nodeSize - 2;
    const cellSel = CellSelection.create(state.doc, firstCellPos, lastCellPos);
    dispatch(state.tr.setSelection(cellSel));
  }
  return true;
};

export const selectColumn: Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean => {
  const context = getTableContext(state);
  if (
    !context.isInTable ||
    context.tablePos === undefined ||
    !context.table ||
    context.columnIndex === undefined
  )
    return false;

  if (dispatch) {
    const tableStart = context.tablePos + 1;
    // Find the cell at columnIndex in first and last row
    const firstRow = context.table.child(0);
    const lastRow = context.table.child(context.table.childCount - 1);

    let firstCellPos = tableStart + 1; // inside first row
    for (let c = 0; c < context.columnIndex && c < firstRow.childCount; c++) {
      firstCellPos += firstRow.child(c).nodeSize;
    }

    let lastRowPos = tableStart;
    for (let r = 0; r < context.table.childCount - 1; r++) {
      lastRowPos += context.table.child(r).nodeSize;
    }
    let lastCellPos = lastRowPos + 1; // inside last row
    for (let c = 0; c < context.columnIndex && c < lastRow.childCount; c++) {
      lastCellPos += lastRow.child(c).nodeSize;
    }

    const cellSel = CellSelection.create(state.doc, firstCellPos, lastCellPos);
    dispatch(state.tr.setSelection(cellSel));
  }
  return true;
};
