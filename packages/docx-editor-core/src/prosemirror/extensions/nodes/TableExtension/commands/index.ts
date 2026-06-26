/**
 * Runtime composer for the table plugin extension.
 *
 * Takes the editor context (which carries the resolved `schema`) and
 * assembles the prosemirror-tables editing plugins, the active-cell
 * decoration plugin, the Backspace/Delete keymap chain, and the full
 * command surface into a single `ExtensionRuntime`.
 *
 * Plugins that hold per-editor state (columnResizing, tableEditing,
 * activeCell) are constructed inside this function so each EditorView
 * gets its own instance.
 */

import { chainCommands } from 'prosemirror-commands';
import {
  columnResizing,
  tableEditing,
  mergeCells as pmMergeCells,
  splitCell as pmSplitCell,
} from 'prosemirror-tables';
import type { ExtensionContext, ExtensionRuntime } from '../../../types';
import {
  makeInsertTable,
  makeAddRowAbove,
  makeAddRowBelow,
  makeAddColumnLeft,
  makeAddColumnRight,
} from './insert';
import {
  deleteRow,
  deleteColumn,
  deleteTable,
  deleteTableIfSelected,
  preventTableMergeAtGap,
} from './delete';
import { selectTable, selectRow, selectColumn } from './selection';
import {
  setTableBorders,
  setCellBorder,
  setTableBorderColor,
  setTableBorderWidth,
  type BorderSpec,
} from './borders';
import {
  setCellFillColor,
  setCellVerticalAlign,
  setCellMargins,
  setCellTextDirection,
  toggleNoWrap,
} from './cellFormatting';
import { setRowHeight, distributeColumns, autoFitContents } from './sizing';
import { applyTableStyle, setTableProperties, toggleHeaderRow } from './tableStyle';
import { makeActiveCellPlugin } from './activeCellPlugin';

export type { BorderPreset, BorderSpec } from './borders';

export function setupTableRuntime(ctx: ExtensionContext): ExtensionRuntime {
  const { schema } = ctx;

  const insertTable = makeInsertTable(schema);
  const addRowAbove = makeAddRowAbove(schema);
  const addRowBelow = makeAddRowBelow(schema);
  const addColumnLeft = makeAddColumnLeft(schema);
  const addColumnRight = makeAddColumnRight(schema);

  return {
    plugins: [
      columnResizing({
        handleWidth: 5,
        cellMinWidth: 25,
        lastColumnResizable: true,
      }),
      tableEditing(),
      makeActiveCellPlugin(),
    ],
    keyboardShortcuts: {
      Backspace: chainCommands(deleteTableIfSelected, preventTableMergeAtGap),
      Delete: chainCommands(deleteTableIfSelected, preventTableMergeAtGap),
    },
    commands: {
      insertTable,
      addRowAbove: () => addRowAbove,
      addRowBelow: () => addRowBelow,
      deleteRow: () => deleteRow,
      addColumnLeft: () => addColumnLeft,
      addColumnRight: () => addColumnRight,
      deleteColumn: () => deleteColumn,
      deleteTable: () => deleteTable,
      selectTable: () => selectTable,
      selectRow: () => selectRow,
      selectColumn: () => selectColumn,
      mergeCells: () => pmMergeCells,
      splitCell: () => pmSplitCell,
      setCellBorder,
      setTableBorders,
      setCellVerticalAlign,
      setCellMargins,
      setCellTextDirection,
      toggleNoWrap: () => toggleNoWrap,
      setRowHeight,
      toggleHeaderRow: () => toggleHeaderRow,
      distributeColumns: () => distributeColumns,
      autoFitContents: () => autoFitContents,
      setTableProperties,
      applyTableStyle,
      setCellFillColor,
      setTableBorderColor,
      setTableBorderWidth,
      removeTableBorders: () => setTableBorders('none'),
      setAllTableBorders: (spec?: BorderSpec) => setTableBorders('all', spec),
      setOutsideTableBorders: (spec?: BorderSpec) => setTableBorders('outside', spec),
      setInsideTableBorders: (spec?: BorderSpec) => setTableBorders('inside', spec),
    },
  };
}
