/**
 * Table-level style + structure commands.
 *
 * - `applyTableStyle` walks the full grid and applies a resolved
 *   table-style's conditional formatting (firstRow/lastRow/banding/corner
 *   cells), overriding background + borders per conditional type.
 * - `setTableProperties` updates table-level width / widthType /
 *   justification on the table node.
 * - `toggleHeaderRow` flips the `isHeader` attr on the row containing the
 *   selection.
 */

import { type Command } from 'prosemirror-state';
import { getTableContext } from '../context';
import { findAncestorNode } from './helpers';

type StyleBorder = { style: string; size?: number; color?: { rgb: string } };

/**
 * Apply a table style to the current table.
 * Accepts pre-resolved style data (borders, shading per conditional type).
 */
export function applyTableStyle(styleData: {
  styleId: string;
  tableBorders?: {
    top?: StyleBorder;
    bottom?: StyleBorder;
    left?: StyleBorder;
    right?: StyleBorder;
    insideH?: StyleBorder;
    insideV?: StyleBorder;
  };
  conditionals?: Record<
    string,
    {
      backgroundColor?: string;
      borders?: {
        top?: StyleBorder | null;
        bottom?: StyleBorder | null;
        left?: StyleBorder | null;
        right?: StyleBorder | null;
      };
      bold?: boolean;
      color?: string;
    }
  >;
  look?: {
    firstRow?: boolean;
    lastRow?: boolean;
    firstCol?: boolean;
    lastCol?: boolean;
    noHBand?: boolean;
    noVBand?: boolean;
  };
}): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      let tr = state.tr;
      const table = context.table;
      const tablePos = context.tablePos;
      const totalRows = table.childCount;
      const look = styleData.look ?? {
        firstRow: true,
        lastRow: false,
        noHBand: false,
        noVBand: true,
      };
      const conditionals = styleData.conditionals ?? {};
      const tableBorders = styleData.tableBorders;

      // Update table node attrs with styleId
      tr = tr.setNodeMarkup(tablePos, undefined, {
        ...table.attrs,
        styleId: styleData.styleId,
      });

      // Walk through all rows and cells to apply conditional formatting
      let dataRowIndex = 0;
      let rowOffset = tablePos + 1; // Skip table open tag

      for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
        const row = table.child(rowIdx);
        const isFirstRow = rowIdx === 0 && !!look.firstRow;
        const isLastRow = rowIdx === totalRows - 1 && !!look.lastRow;
        const bandingEnabled = look.noHBand !== true;
        const totalCols = row.childCount;

        // Determine row-level conditional type
        let condType: string | undefined;
        if (isFirstRow) {
          condType = 'firstRow';
        } else if (isLastRow) {
          condType = 'lastRow';
        } else if (bandingEnabled) {
          condType = dataRowIndex % 2 === 0 ? 'band1Horz' : 'band2Horz';
          dataRowIndex++;
        } else {
          dataRowIndex++;
        }

        let cellOffset = rowOffset + 1; // Skip row open tag

        for (let colIdx = 0; colIdx < totalCols; colIdx++) {
          const cell = row.child(colIdx);
          const cellPos = tr.mapping.map(cellOffset);

          // Determine cell-level conditional (column overrides can apply)
          let cellCondType = condType;
          const isFirstCol = colIdx === 0 && !!look.firstCol;
          const isLastCol = colIdx === totalCols - 1 && !!look.lastCol;

          // Corner cells take highest priority
          if (isFirstRow && isFirstCol && conditionals['nwCell']) {
            cellCondType = 'nwCell';
          } else if (isFirstRow && isLastCol && conditionals['neCell']) {
            cellCondType = 'neCell';
          } else if (isLastRow && isFirstCol && conditionals['swCell']) {
            cellCondType = 'swCell';
          } else if (isLastRow && isLastCol && conditionals['seCell']) {
            cellCondType = 'seCell';
          } else if (isFirstCol) {
            cellCondType = 'firstCol';
          } else if (isLastCol) {
            cellCondType = 'lastCol';
          }

          // Resolve conditional style for this cell
          const cond = cellCondType ? conditionals[cellCondType] : undefined;

          // Build new cell attrs
          const newAttrs = { ...cell.attrs };

          // Apply background color
          if (cond?.backgroundColor) {
            newAttrs.backgroundColor = cond.backgroundColor;
          } else {
            newAttrs.backgroundColor = null;
          }

          // Apply borders: conditional borders override table borders
          const cellBorders: Record<string, unknown> = {};
          const sides = ['top', 'bottom', 'left', 'right'] as const;
          for (const side of sides) {
            if (cond?.borders && cond.borders[side] !== undefined) {
              cellBorders[side] = cond.borders[side];
            } else if (tableBorders) {
              // Map table-level border to cell: insideH for top/bottom between rows, insideV for left/right between cols
              if ((side === 'top' && rowIdx > 0) || (side === 'bottom' && rowIdx < totalRows - 1)) {
                cellBorders[side] = tableBorders.insideH ?? tableBorders[side];
              } else if (
                (side === 'left' && colIdx > 0) ||
                (side === 'right' && colIdx < totalCols - 1)
              ) {
                cellBorders[side] = tableBorders.insideV ?? tableBorders[side];
              } else {
                cellBorders[side] = tableBorders[side];
              }
            }
          }
          if (Object.keys(cellBorders).length > 0) {
            newAttrs.borders = cellBorders;
          } else {
            newAttrs.borders = null;
          }

          tr = tr.setNodeMarkup(cellPos, undefined, newAttrs);
          cellOffset += cell.nodeSize;
        }

        rowOffset += row.nodeSize;
      }

      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function setTableProperties(props: {
  width?: number | null;
  widthType?: string | null;
  justification?: 'left' | 'center' | 'right' | null;
}): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      const tr = state.tr;
      const newAttrs = { ...context.table.attrs };
      if ('width' in props) newAttrs.width = props.width;
      if ('widthType' in props) newAttrs.widthType = props.widthType;
      if ('justification' in props) newAttrs.justification = props.justification;
      tr.setNodeMarkup(context.tablePos, undefined, newAttrs);
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export const toggleHeaderRow: Command = (state, dispatch) => {
  const context = getTableContext(state);
  if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

  if (dispatch) {
    const row = findAncestorNode(state, 'tableRow');
    if (!row) return true;

    const tr = state.tr.setNodeMarkup(row.pos, undefined, {
      ...row.node.attrs,
      isHeader: !row.node.attrs.isHeader,
    });
    dispatch(tr.scrollIntoView());
  }

  return true;
};
