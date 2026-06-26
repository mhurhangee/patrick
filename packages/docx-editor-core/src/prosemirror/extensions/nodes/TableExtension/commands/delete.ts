/**
 * Schema-free table-delete commands plus the two keymap commands that gate
 * the global Backspace/Delete bindings on tables (`deleteTableIfSelected`,
 * `preventTableMergeAtGap`). None of these touch the schema — they only
 * mutate transactions on existing nodes — so all five are top-level
 * `Command` constants. The keymap commands could have been zero-arg
 * factories matching the schema-binding `make*` pattern elsewhere, but
 * since they capture no state the wrap would be dead work.
 */

import { type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { CellSelection, selectedRect } from 'prosemirror-tables';
import { getTableContext } from '../context';
import { makeRevisionInfo } from '../../../../plugins/revisionIds';

export const deleteRow: Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean => {
  const context = getTableContext(state);
  if (
    !context.isInTable ||
    context.rowIndex === undefined ||
    !context.table ||
    context.tablePos === undefined ||
    (context.rowCount || 0) <= 1
  )
    return false;

  // A CellSelection can span several rows; delete every row it covers, not
  // just the anchor cell's row. `selectedRect` reports the selection's
  // [top, bottom) row indices and accounts for rowspans. For a plain cursor
  // it collapses to the single row, preserving the previous behavior.
  const rowCount = context.rowCount ?? 0;
  const rect = selectedRect(state);
  const firstRow = Math.max(0, Math.min(rect.top, rowCount - 1));
  const lastRow = Math.min(Math.max(rect.bottom - 1, firstRow), rowCount - 1);

  if (dispatch) {
    const tr = state.tr;
    const table = context.table;
    const info = makeRevisionInfo(state);

    // Selecting every row and deleting would leave a schema-invalid empty
    // table — drop the whole table instead, matching Word. Suggesting mode
    // marks the rows (handled below), so it never hits this branch.
    if (!info && firstRow === 0 && lastRow >= rowCount - 1) {
      tr.delete(context.tablePos, context.tablePos + table.nodeSize);
      dispatch(tr.scrollIntoView());
      return true;
    }

    // Pre-compute each row's start offset against the original doc so we can
    // delete bottom-up without re-measuring after each delete.
    const rowStarts: number[] = [];
    let acc = context.tablePos + 1;
    table.forEach((row) => {
      rowStarts.push(acc);
      acc += row.nodeSize;
    });

    if (info) {
      // Suggesting mode: don't actually delete the rows — mark each with
      // `trDel` and mirror `cellMarker: { kind: 'del' }` onto every cell.
      // The rows stay visible until accept; reject clears the marker.
      for (let r = firstRow; r <= lastRow; r++) {
        const rowNode = table.child(r);
        const rowStart = rowStarts[r];
        tr.setNodeMarkup(rowStart, undefined, { ...rowNode.attrs, trDel: info });
        let cellPos = rowStart + 1;
        rowNode.forEach((cell) => {
          if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
            tr.setNodeMarkup(cellPos, undefined, {
              ...cell.attrs,
              cellMarker: { kind: 'del', info },
            });
          }
          cellPos += cell.nodeSize;
        });
      }
    } else {
      // Delete bottom-up so earlier rows' offsets stay valid.
      for (let r = lastRow; r >= firstRow; r--) {
        const rowNode = table.child(r);
        const rowStart = rowStarts[r];
        tr.delete(rowStart, rowStart + rowNode.nodeSize);
      }
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

// TODO(Phase 2c): when suggesting mode is active, set `cellMarker: { kind:
// 'del', info }` on each cell in the column rather than removing them, so
// the column stays visible until accept. See
// `tracked-structural-tables/spec.md` — "Track column insertion and
// deletion in suggesting mode."
export const deleteColumn: Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean => {
  const context = getTableContext(state);
  if (
    !context.isInTable ||
    context.columnIndex === undefined ||
    !context.table ||
    context.tablePos === undefined ||
    (context.columnCount || 0) <= 1
  )
    return false;

  if (dispatch) {
    let tr = state.tr;
    const newColumnCount = (context.columnCount || 2) - 1;
    // Width is stored as 50ths of a percent per ECMA-376 §17.18.111
    // (5000 = 100%) so resolveTableWidthPx can apply it directly.
    const newColWidthPercent = Math.floor(5000 / newColumnCount);

    const deleteOps: { start: number; end: number }[] = [];
    let rowPos = context.tablePos + 1;

    context.table.forEach((row) => {
      if (row.type.name === 'tableRow') {
        let cellPos = rowPos + 1;
        let colIdx = 0;

        row.forEach((cell) => {
          const cellStart = cellPos;
          const cellEnd = cellPos + cell.nodeSize;
          const cellColspan = cell.attrs.colspan || 1;

          if (colIdx <= context.columnIndex! && context.columnIndex! < colIdx + cellColspan) {
            deleteOps.push({ start: cellStart, end: cellEnd });
          }

          cellPos = cellEnd;
          colIdx += cellColspan;
        });
      }
      rowPos += row.nodeSize;
    });

    deleteOps.reverse().forEach(({ start, end }) => {
      tr = tr.delete(start, end);
    });

    const updatedTable = tr.doc.nodeAt(context.tablePos);
    if (updatedTable && updatedTable.type.name === 'table') {
      const firstRow = updatedTable.child(0);
      if (firstRow && firstRow.type.name === 'tableRow') {
        let cellPos = context.tablePos + 2;
        firstRow.forEach((cell) => {
          if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
            tr = tr.setNodeMarkup(cellPos, undefined, {
              ...cell.attrs,
              width: newColWidthPercent,
              widthType: 'pct',
            });
          }
          cellPos += cell.nodeSize;
        });
      }

      // Update table columnWidths to match new column count.
      const colCount = firstRow?.childCount ?? newColumnCount;
      const tableWidthTwips = (updatedTable.attrs.width as number) || 9360;
      const colWidthTwips = Math.floor(tableWidthTwips / Math.max(1, colCount));
      tr = tr.setNodeMarkup(context.tablePos, undefined, {
        ...updatedTable.attrs,
        columnWidths: Array(colCount).fill(colWidthTwips),
      });
    }

    dispatch(tr.scrollIntoView());
  }
  return true;
};

export const deleteTable: Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean => {
  const context = getTableContext(state);
  if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

  if (dispatch) {
    const tr = state.tr;
    tr.delete(context.tablePos, context.tablePos + context.table.nodeSize);
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * Delete the entire table when a CellSelection covers every cell — used as
 * the first link of the Backspace/Delete keymap chain so a user can select
 * an entire table and remove it with one keypress.
 */
export const deleteTableIfSelected: Command = (state, dispatch) => {
  const selection = state.selection as CellSelection;
  const isCellSel = '$anchorCell' in selection && typeof selection.forEachCell === 'function';
  if (!isCellSel) return false;

  const context = getTableContext(state);
  if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

  let totalCells = 0;
  context.table.descendants((node) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      totalCells += 1;
    }
  });

  let selectedCells = 0;
  selection.forEachCell(() => {
    selectedCells += 1;
  });

  const isFullTable = totalCells > 0 && selectedCells >= totalCells;

  if (!isFullTable) return false;

  if (dispatch) {
    const tr = state.tr.delete(context.tablePos, context.tablePos + context.table.nodeSize);
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * Keep the spacer paragraph between two adjacent tables — when the cursor
 * is in an empty paragraph that sits between tables, intercept Backspace/
 * Delete so the paragraph isn't merged into the surrounding tables.
 */
export const preventTableMergeAtGap: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty) return false;

  const parent = $from.parent;
  if (parent.type.name !== 'paragraph') return false;
  if (parent.textContent.length > 0) return false;

  const depth = $from.depth;
  if (depth < 1) return false;
  const container = $from.node(depth - 1);
  const index = $from.index(depth - 1);
  const before = index > 0 ? container.child(index - 1) : null;
  const after = index + 1 < container.childCount ? container.child(index + 1) : null;
  const beforeIsTable = before?.type.name === 'table';
  const afterIsTable = after?.type.name === 'table';
  if (beforeIsTable || afterIsTable) {
    // Keep the spacer paragraph adjacent to tables so they can't visually merge.
    return true;
  }

  return false;
};
