import { useCallback, useState } from 'react';
import {
  getSplitCellDialogConfig,
  splitActiveTableCell,
} from '@eigenpal/docx-editor-core/prosemirror/commands';
import {
  addRowAbove,
  addRowBelow,
  deleteRow as pmDeleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn as pmDeleteColumn,
  deleteTable as pmDeleteTable,
  selectTable as pmSelectTable,
  selectRow as pmSelectRow,
  selectColumn as pmSelectColumn,
  mergeCells as pmMergeCells,
  setCellBorder,
  setCellVerticalAlign,
  setCellMargins,
  setCellTextDirection,
  toggleNoWrap,
  setRowHeight,
  toggleHeaderRow,
  distributeColumns,
  autoFitContents,
  removeTableBorders,
  setAllTableBorders,
  setOutsideTableBorders,
  setInsideTableBorders,
  setCellFillColor,
  setTableBorderColor,
  setTableBorderWidth,
} from '@eigenpal/docx-editor-core/prosemirror';
import type { EditorView } from 'prosemirror-view';
import type { TableAction } from '../types/table';

interface SplitCellDialogState {
  isOpen: boolean;
  initialRows: number;
  initialCols: number;
  minRows: number;
  minCols: number;
  capturedCellRow: number | null;
  capturedCellCol: number | null;
  /** Painted caret rect captured when opening, to anchor the popover at the cell. */
  rect: DOMRect | null;
}

interface BorderSpec {
  style: string;
  size: number;
  color: { rgb: string };
}

/**
 * Owns the two table-specific dialogs (`tablePropsOpen`,
 * `splitCellDialogState`) plus the big `handleTableAction` switch that
 * routes every toolbar/menu table command to a ProseMirror command —
 * borders, cell shading, alignment, header row, distribute, table-style
 * presets resolved through the document's style sheet.
 *
 * The `borderSpecRef` lives in the parent because the toolbar's color +
 * width pickers mutate it directly; the hook reads and writes its
 * `.current` to keep the per-side border helpers aligned with the
 * active style preset.
 */
export function useTableDialogs({
  getActiveEditorView,
  getCaretRect,
  focusActiveEditor,
  borderSpecRef,
}: {
  getActiveEditorView: () => EditorView | null | undefined;
  getCaretRect: () => DOMRect | null;
  focusActiveEditor: () => void;
  borderSpecRef: React.RefObject<BorderSpec>;
}) {
  const [tablePropsOpen, setTablePropsOpen] = useState(false);
  const [tablePropsRect, setTablePropsRect] = useState<DOMRect | null>(null);
  const [splitCellDialogState, setSplitCellDialogState] = useState<SplitCellDialogState>({
    isOpen: false,
    initialRows: 1,
    initialCols: 2,
    minRows: 1,
    minCols: 1,
    capturedCellRow: null,
    capturedCellCol: null,
    rect: null,
  });

  const openSplitCellDialog = useCallback(() => {
    const view = getActiveEditorView();
    const config = view ? getSplitCellDialogConfig(view.state) : null;
    if (!config) return;

    setSplitCellDialogState({
      isOpen: true,
      ...config,
      capturedCellRow: config.capturedCellRow ?? null,
      capturedCellCol: config.capturedCellCol ?? null,
      // Capture the caret rect now (before the menu/focus shift) to anchor the popover.
      rect: getCaretRect(),
    });
  }, [getActiveEditorView, getCaretRect]);

  const handleTableAction = useCallback(
    (action: TableAction) => {
      const view = getActiveEditorView();
      if (!view) return;

      switch (action) {
        case 'addRowAbove':
          addRowAbove(view.state, view.dispatch);
          break;
        case 'addRowBelow':
          addRowBelow(view.state, view.dispatch);
          break;
        case 'addColumnLeft':
          addColumnLeft(view.state, view.dispatch);
          break;
        case 'addColumnRight':
          addColumnRight(view.state, view.dispatch);
          break;
        case 'deleteRow':
          pmDeleteRow(view.state, view.dispatch);
          break;
        case 'deleteColumn':
          pmDeleteColumn(view.state, view.dispatch);
          break;
        case 'deleteTable':
          pmDeleteTable(view.state, view.dispatch);
          break;
        case 'selectTable':
          pmSelectTable(view.state, view.dispatch);
          break;
        case 'selectRow':
          pmSelectRow(view.state, view.dispatch);
          break;
        case 'selectColumn':
          pmSelectColumn(view.state, view.dispatch);
          break;
        case 'mergeCells':
          pmMergeCells(view.state, view.dispatch);
          break;
        case 'splitCell':
          openSplitCellDialog();
          break;
        // Border actions use the current border spec from the toolbar
        case 'borderAll':
          setAllTableBorders(view.state, view.dispatch, borderSpecRef.current);
          break;
        case 'borderOutside':
          setOutsideTableBorders(view.state, view.dispatch, borderSpecRef.current);
          break;
        case 'borderInside':
          setInsideTableBorders(view.state, view.dispatch, borderSpecRef.current);
          break;
        case 'borderNone':
          removeTableBorders(view.state, view.dispatch);
          break;
        case 'borderTop':
          setCellBorder('top', borderSpecRef.current, true)(view.state, view.dispatch);
          break;
        case 'borderBottom':
          setCellBorder('bottom', borderSpecRef.current, true)(view.state, view.dispatch);
          break;
        case 'borderLeft':
          setCellBorder('left', borderSpecRef.current, true)(view.state, view.dispatch);
          break;
        case 'borderRight':
          setCellBorder('right', borderSpecRef.current, true)(view.state, view.dispatch);
          break;
        default:
          if (typeof action === 'object') {
            if (action.type === 'cellFillColor') {
              setCellFillColor(action.color)(view.state, view.dispatch);
            } else if (action.type === 'borderColor') {
              const rgb = action.color.replace(/^#/, '');
              borderSpecRef.current = { ...borderSpecRef.current, color: { rgb } };
              setTableBorderColor(action.color)(view.state, view.dispatch);
            } else if (action.type === 'borderWidth') {
              borderSpecRef.current = { ...borderSpecRef.current, size: action.size };
              setTableBorderWidth(action.size)(view.state, view.dispatch);
            } else if (action.type === 'cellBorder') {
              setCellBorder(action.side, {
                style: action.style,
                size: action.size,
                color: { rgb: action.color.replace(/^#/, '') },
              })(view.state, view.dispatch);
            } else if (action.type === 'cellVerticalAlign') {
              setCellVerticalAlign(action.align)(view.state, view.dispatch);
            } else if (action.type === 'cellMargins') {
              setCellMargins(action.margins)(view.state, view.dispatch);
            } else if (action.type === 'cellTextDirection') {
              setCellTextDirection(action.direction)(view.state, view.dispatch);
            } else if (action.type === 'toggleNoWrap') {
              toggleNoWrap()(view.state, view.dispatch);
            } else if (action.type === 'rowHeight') {
              setRowHeight(action.height, action.rule)(view.state, view.dispatch);
            } else if (action.type === 'toggleHeaderRow') {
              toggleHeaderRow()(view.state, view.dispatch);
            } else if (action.type === 'distributeColumns') {
              distributeColumns()(view.state, view.dispatch);
            } else if (action.type === 'autoFitContents') {
              autoFitContents()(view.state, view.dispatch);
            } else if (action.type === 'openTableProperties') {
              setTablePropsRect(getCaretRect());
              setTablePropsOpen(true);
            }
          }
      }

      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor, openSplitCellDialog, borderSpecRef]
  );

  const handleSplitCellDialogClose = useCallback(() => {
    setSplitCellDialogState((prev) => ({
      ...prev,
      isOpen: false,
      capturedCellRow: null,
      capturedCellCol: null,
    }));
  }, []);

  const handleSplitCellDialogApply = useCallback(
    (rows: number, cols: number) => {
      const view = getActiveEditorView();
      if (!view) return;
      splitActiveTableCell(
        view.state,
        view.dispatch,
        rows,
        cols,
        splitCellDialogState.capturedCellRow ?? undefined,
        splitCellDialogState.capturedCellCol ?? undefined
      );
      focusActiveEditor();
    },
    [
      focusActiveEditor,
      getActiveEditorView,
      splitCellDialogState.capturedCellRow,
      splitCellDialogState.capturedCellCol,
    ]
  );

  return {
    tablePropsOpen,
    setTablePropsOpen,
    tablePropsRect,
    splitCellDialogState,
    openSplitCellDialog,
    handleTableAction,
    handleSplitCellDialogClose,
    handleSplitCellDialogApply,
  };
}
