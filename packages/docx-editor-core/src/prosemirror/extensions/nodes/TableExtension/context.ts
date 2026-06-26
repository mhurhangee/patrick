/**
 * Table selection context + navigation helpers.
 *
 * `getTableContext` walks the selection up from `$from` and reports which
 * table / row / cell the cursor is in, plus the table's row/column counts,
 * whether a multi-cell selection is active, and the current cell's border
 * + fill colors (so the toolbar's color pickers can show the live values).
 *
 * `goToNextCell` / `goToPrevCell` are tab-stop-style cell navigation commands
 * registered by the plugin extension.
 */

import type { Node as PMNode } from 'prosemirror-model';
import { Selection, type Command, type EditorState } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { ColorValue } from '../../../../types/colors';

export interface TableContextInfo {
  isInTable: boolean;
  table?: PMNode;
  tablePos?: number;
  rowIndex?: number;
  columnIndex?: number;
  rowCount?: number;
  columnCount?: number;
  hasMultiCellSelection?: boolean;
  canSplitCell?: boolean;
  /** Current cell's dominant border color, if any */
  cellBorderColor?: ColorValue;
  /** Current cell's background/fill color (RGB hex without #), if any */
  cellBackgroundColor?: string;
}

export function getTableContext(state: EditorState): TableContextInfo {
  const { selection } = state;
  const { $from } = selection;

  // Detect CellSelection (multi-cell selection from prosemirror-tables)
  const isCellSel = selection instanceof CellSelection;
  const hasMultiCellSelection = isCellSel && selection.$anchorCell.pos !== selection.$headCell.pos;

  let table: PMNode | undefined;
  let tablePos: number | undefined;
  let rowIndex: number | undefined;
  let columnIndex: number | undefined;
  let cellNode: PMNode | undefined;

  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);

    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      cellNode = node;
      const rowNode = $from.node(d - 1);
      if (rowNode && rowNode.type.name === 'tableRow') {
        let colIdx = 0;
        let found = false;
        rowNode.forEach((child, _offset, idx) => {
          if (!found) {
            if (idx === $from.index(d - 1)) {
              columnIndex = colIdx;
              found = true;
            } else {
              colIdx += child.attrs.colspan || 1;
            }
          }
        });
      }
    } else if (node.type.name === 'tableRow') {
      const tableNode = $from.node(d - 1);
      if (tableNode && tableNode.type.name === 'table') {
        rowIndex = $from.index(d - 1);
      }
    } else if (node.type.name === 'table') {
      table = node;
      tablePos = $from.before(d);
      break;
    }
  }

  if (!table) {
    return { isInTable: false };
  }

  let rowCount = 0;
  let columnCount = 0;

  table.forEach((row) => {
    if (row.type.name === 'tableRow') {
      rowCount++;
      let cols = 0;
      row.forEach((cell) => {
        cols += cell.attrs.colspan || 1;
      });
      columnCount = Math.max(columnCount, cols);
    }
  });

  const canSplitCell = !!cellNode && !hasMultiCellSelection;

  // Extract border color and background color from current cell
  let cellBorderColor: TableContextInfo['cellBorderColor'];
  let cellBackgroundColor: string | undefined;
  if (cellNode) {
    const attrs = cellNode.attrs as Record<string, unknown>;
    if (attrs.backgroundColor && typeof attrs.backgroundColor === 'string') {
      cellBackgroundColor = attrs.backgroundColor;
    }
    const borders = attrs.borders as
      | Record<string, { style?: string; color?: ColorValue } | undefined>
      | undefined;
    if (borders) {
      // Pick the first non-none border's color (prefer top → right → bottom → left)
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const border = borders[side];
        if (border?.color && border.style && border.style !== 'none' && border.style !== 'nil') {
          cellBorderColor = border.color;
          break;
        }
      }
    }
  }

  return {
    isInTable: true,
    table,
    tablePos,
    rowIndex,
    columnIndex,
    rowCount,
    columnCount,
    hasMultiCellSelection,
    canSplitCell: !!canSplitCell,
    cellBorderColor,
    cellBackgroundColor,
  };
}

export function isInTableCell(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      return true;
    }
  }
  return false;
}

function findCellInfo(
  state: EditorState
): { cellDepth: number; cellPos: number; rowDepth: number; tableDepth: number } | null {
  const { $from } = state.selection;
  let cellDepth = -1;
  let rowDepth = -1;
  let tableDepth = -1;

  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      cellDepth = d;
    } else if (node.type.name === 'tableRow') {
      rowDepth = d;
    } else if (node.type.name === 'table') {
      tableDepth = d;
      break;
    }
  }

  if (cellDepth === -1 || rowDepth === -1 || tableDepth === -1) {
    return null;
  }

  return { cellDepth, cellPos: $from.before(cellDepth), rowDepth, tableDepth };
}

export function goToNextCell(): Command {
  return (state, dispatch) => {
    if (!isInTableCell(state)) return false;

    const info = findCellInfo(state);
    if (!info) return false;

    const { $from } = state.selection;
    const table = $from.node(info.tableDepth);
    const row = $from.node(info.rowDepth);
    const cellIndex = $from.index(info.rowDepth);
    const rowIndex = $from.index(info.tableDepth);

    if (cellIndex < row.childCount - 1) {
      const nextCellPos = info.cellPos + $from.node(info.cellDepth).nodeSize;
      if (dispatch) {
        const textPos = nextCellPos + 1 + 1;
        const tr = state.tr.setSelection(Selection.near(state.doc.resolve(textPos)));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    if (rowIndex < table.childCount - 1) {
      const rowPos = $from.before(info.rowDepth);
      const nextRowPos = rowPos + row.nodeSize;
      if (dispatch) {
        const textPos = nextRowPos + 1 + 1 + 1;
        const tr = state.tr.setSelection(Selection.near(state.doc.resolve(textPos)));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    return false;
  };
}

export function goToPrevCell(): Command {
  return (state, dispatch) => {
    if (!isInTableCell(state)) return false;

    const info = findCellInfo(state);
    if (!info) return false;

    const { $from } = state.selection;
    const table = $from.node(info.tableDepth);
    const cellIndex = $from.index(info.rowDepth);
    const rowIndex = $from.index(info.tableDepth);

    if (cellIndex > 0) {
      const row = $from.node(info.rowDepth);
      const prevCell = row.child(cellIndex - 1);
      const cellStartPos = info.cellPos - prevCell.nodeSize;
      if (dispatch) {
        const textPos = cellStartPos + prevCell.nodeSize - 2;
        const tr = state.tr.setSelection(Selection.near(state.doc.resolve(textPos), -1));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    if (rowIndex > 0) {
      const prevRow = table.child(rowIndex - 1);
      const rowPos = $from.before(info.rowDepth);
      const prevRowPos = rowPos - prevRow.nodeSize;
      if (dispatch) {
        const cellEndPos = prevRowPos + prevRow.nodeSize - 1;
        const textPos = cellEndPos - 1;
        const tr = state.tr.setSelection(Selection.near(state.doc.resolve(textPos), -1));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    return false;
  };
}
