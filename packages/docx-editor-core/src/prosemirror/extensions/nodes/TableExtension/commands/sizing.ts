/**
 * Row/column sizing commands: explicit row height, even column
 * distribution, and auto-fit-to-content. Schema-free — they walk the
 * existing table tree and update node attrs via `tr.setNodeMarkup`.
 */

import { type Command } from 'prosemirror-state';
import { getTableContext } from '../context';
import { findAncestorNode } from './helpers';

export function setRowHeight(height: number | null, rule?: 'auto' | 'atLeast' | 'exact'): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      const row = findAncestorNode(state, 'tableRow');
      if (!row) return true;

      const tr = state.tr.setNodeMarkup(row.pos, undefined, {
        ...row.node.attrs,
        height,
        heightRule: height ? rule || 'atLeast' : null,
      });
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export const distributeColumns: Command = (state, dispatch) => {
  const context = getTableContext(state);
  if (
    !context.isInTable ||
    context.tablePos === undefined ||
    !context.table ||
    !context.columnCount
  )
    return false;

  if (dispatch) {
    let tr = state.tr;
    const table = context.table;
    const colCount = context.columnCount;

    // Calculate total table width from existing column widths or use default
    const existingWidths = table.attrs.columnWidths as number[] | null;
    const totalWidthTwips = existingWidths
      ? existingWidths.reduce((sum: number, w: number) => sum + w, 0)
      : 9360; // Default content width in twips
    const equalWidth = Math.floor(totalWidthTwips / colCount);

    // Update each cell in every row
    let rowPos = context.tablePos + 1;
    table.forEach((row) => {
      if (row.type.name === 'tableRow') {
        let cellPos = rowPos + 1;
        row.forEach((cell) => {
          if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
            tr = tr.setNodeMarkup(cellPos, undefined, {
              ...cell.attrs,
              width: equalWidth,
              widthType: 'dxa',
              colwidth: null,
            });
          }
          cellPos += cell.nodeSize;
        });
      }
      rowPos += row.nodeSize;
    });

    // Update table-level column widths
    const newColumnWidths = Array(colCount).fill(equalWidth);
    tr = tr.setNodeMarkup(context.tablePos, undefined, {
      ...table.attrs,
      columnWidths: newColumnWidths,
    });

    dispatch(tr.scrollIntoView());
  }

  return true;
};

export const autoFitContents: Command = (state, dispatch) => {
  const context = getTableContext(state);
  if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

  if (dispatch) {
    let tr = state.tr;
    const table = context.table;

    // Remove explicit widths from all cells
    let rowPos = context.tablePos + 1;
    table.forEach((row) => {
      if (row.type.name === 'tableRow') {
        let cellPos = rowPos + 1;
        row.forEach((cell) => {
          if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
            tr = tr.setNodeMarkup(cellPos, undefined, {
              ...cell.attrs,
              width: null,
              widthType: null,
              colwidth: null,
            });
          }
          cellPos += cell.nodeSize;
        });
      }
      rowPos += row.nodeSize;
    });

    // Remove table-level column widths and set auto width
    tr = tr.setNodeMarkup(context.tablePos, undefined, {
      ...table.attrs,
      columnWidths: null,
      width: null,
      widthType: 'auto',
    });

    dispatch(tr.scrollIntoView());
  }

  return true;
};
