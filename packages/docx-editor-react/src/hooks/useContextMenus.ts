import { useCallback, useMemo, useState } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  getTableContext,
  addRowAbove,
  addRowBelow,
  deleteRow as pmDeleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn as pmDeleteColumn,
  mergeCells as pmMergeCells,
  selectTable as pmSelectTable,
  deleteTable as pmDeleteTable,
  type TableContextInfo,
} from '@eigenpal/docx-editor-core/prosemirror';
import {
  setImageWrapType,
  type ImageLayoutTarget,
} from '@eigenpal/docx-editor-core/prosemirror/commands';
import type { WrapType } from '@eigenpal/docx-editor-core/docx/wrapTypes';
import { useImageContextMenu } from './use-image-context-menu';
import type { TextContextAction, TextContextMenuItem } from '../types/context-menu';
import { findSelectionYPosition } from '../components/editor/internals/pmAnchors';
import { PENDING_COMMENT_ID } from '@eigenpal/docx-editor-core/prosemirror/commentIdAllocator';
import { formatKeys } from './formatKeys';

interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  hasSelection: boolean;
  cursorInTable: boolean;
  tableContext: TableContextInfo | null;
}

/**
 * Owns the right-click context-menu surfaces:
 *  - text context menu (cut/copy/paste/pasteAsPlainText/delete/selectAll
 *    + add-comment when there's a selection + table ops when in a cell)
 *  - image context menu (wrap-type swatches + reused text actions)
 *
 * Shortcut strings are passed through `formatKeys` so Mac users see
 * `⌘⇧V` instead of the literal `Ctrl+Shift+V` — handles the full
 * Ctrl/Alt/Shift swap set, not just Ctrl.
 *
 * The text menu's `addComment` branch needs to mutate comment-management
 * state (selection range, Y position, sidebar visibility, isAddingComment,
 * floatingCommentBtn). To keep this hook independent of comment state
 * ownership, the parent passes a single `onAddComment({ from, to, yPos })`
 * callback that fans out to those setters.
 */
export function useContextMenus({
  getActiveEditorView,
  focusActiveEditor,
  openSplitCellDialog,
  openTableProperties,
  scrollContainerRef,
  editorContentRef,
  onAddComment,
}: {
  getActiveEditorView: () => EditorView | null | undefined;
  focusActiveEditor: () => void;
  openSplitCellDialog: () => void;
  openTableProperties: () => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  editorContentRef: React.RefObject<HTMLDivElement | null>;
  onAddComment: (range: { from: number; to: number; yPos: number | null }) => void;
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    hasSelection: false,
    cursorInTable: false,
    tableContext: null,
  });

  const imageContextMenu = useImageContextMenu();

  // The body editor's right-click is wired through PagedEditor's
  // onContextMenu (handleContextMenu below). This handler is mounted on the
  // outer editor shell to catch right-clicks in the gutter around the pages,
  // where the body's plumbing won't fire.
  const handleEditorContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.paged-editor__pages')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const view = getActiveEditorView();
      const tableContext = view ? getTableContext(view.state) : { isInTable: false };
      const { from, to } = view?.state.selection ?? { from: 0, to: 0 };
      const hasSel = from !== to;
      setContextMenu({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
        hasSelection: hasSel,
        cursorInTable: tableContext.isInTable,
        tableContext: tableContext.isInTable ? tableContext : null,
      });
    },
    [getActiveEditorView]
  );

  const handleContextMenu = useCallback(
    (data: {
      x: number;
      y: number;
      hasSelection: boolean;
      image?: {
        pos: number;
        wrapType: WrapType;
        cssFloat?: 'left' | 'right' | 'none' | null;
        inlinePositionEmu?: { horizontalEmu: number; verticalEmu: number };
      } | null;
    }) => {
      // An image right-click takes priority over the text context menu.
      if (data.image) {
        imageContextMenu.openForImage({
          x: data.x,
          y: data.y,
          wrapType: data.image.wrapType,
          cssFloat: data.image.cssFloat,
          pos: data.image.pos,
          inlinePositionEmu: data.image.inlinePositionEmu,
        });
        return;
      }
      const view = getActiveEditorView();
      const tableContext = view ? getTableContext(view.state) : { isInTable: false };
      setContextMenu({
        isOpen: true,
        position: data,
        hasSelection: data.hasSelection,
        cursorInTable: tableContext.isInTable,
        tableContext: tableContext.isInTable ? tableContext : null,
      });
    },
    [getActiveEditorView, imageContextMenu]
  );

  const handleImageWrapApply = useCallback(
    (target: ImageLayoutTarget) => {
      const view = getActiveEditorView();
      if (!view || imageContextMenu.imagePos === null) return;
      // For inline → anchor, hand the captured EMU offset to the command so
      // the new float lands where the inline glyph used to sit.
      const opts = imageContextMenu.inlinePositionEmu
        ? { initialPositionEmu: imageContextMenu.inlinePositionEmu }
        : undefined;
      setImageWrapType(imageContextMenu.imagePos, target, opts)(view.state, view.dispatch);
    },
    [getActiveEditorView, imageContextMenu.imagePos, imageContextMenu.inlinePositionEmu]
  );

  // Cut / Copy / Paste / Delete ride along inside the image context menu so
  // users don't need to flip menus to do basic clipboard work on the
  // selected image. Shortcuts go through `formatKeys` so multi-modifier
  // combos like `Ctrl+Shift+V` render as `⌘⇧V` on Mac instead of `⌘+Shift+V`.
  const imageContextMenuTextActions = useMemo(
    () => [
      {
        action: 'cut' as TextContextAction,
        label: 'Cut',
        shortcut: formatKeys('Ctrl+X'),
      },
      {
        action: 'copy' as TextContextAction,
        label: 'Copy',
        shortcut: formatKeys('Ctrl+C'),
      },
      {
        action: 'paste' as TextContextAction,
        label: 'Paste',
        shortcut: formatKeys('Ctrl+V'),
        dividerAfter: true,
      },
      {
        action: 'delete' as TextContextAction,
        label: 'Delete',
        shortcut: formatKeys('Del'),
      },
    ],
    []
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenu({
      isOpen: false,
      position: { x: 0, y: 0 },
      hasSelection: false,
      cursorInTable: false,
      tableContext: null,
    });
  }, []);

  const contextMenuItems = useMemo((): TextContextMenuItem[] => {
    // `formatKeys` handles all modifier swaps on Mac (Ctrl+ → ⌘, Shift+ → ⇧,
    // Alt+ → ⌥) so multi-modifier strings like `Ctrl+Shift+V` render as
    // `⌘⇧V` rather than the wrong `⌘+Shift+V`.
    const items: TextContextMenuItem[] = [
      {
        action: 'cut',
        label: 'Cut',
        shortcut: formatKeys('Ctrl+X'),
      },
      {
        action: 'copy',
        label: 'Copy',
        shortcut: formatKeys('Ctrl+C'),
      },
      {
        action: 'paste',
        label: 'Paste',
        shortcut: formatKeys('Ctrl+V'),
      },
      {
        action: 'pasteAsPlainText',
        label: 'Paste as Plain Text',
        shortcut: formatKeys('Ctrl+Shift+V'),
        dividerAfter: true,
      },
      {
        action: 'delete',
        label: 'Delete',
        shortcut: formatKeys('Del'),
        dividerAfter: !contextMenu.hasSelection && !contextMenu.cursorInTable,
      },
    ];
    if (contextMenu.hasSelection) {
      items.push({
        action: 'addComment',
        label: 'Comment',
        dividerAfter: !contextMenu.cursorInTable,
      });
    }
    if (contextMenu.cursorInTable) {
      items.push(
        { action: 'addRowAbove', label: 'Insert row above' },
        { action: 'addRowBelow', label: 'Insert row below' },
        { action: 'deleteRow', label: 'Delete row', dividerAfter: true },
        { action: 'addColumnLeft', label: 'Insert column left' },
        { action: 'addColumnRight', label: 'Insert column right' },
        { action: 'deleteColumn', label: 'Delete column' },
        {
          action: 'mergeCells',
          label: 'Merge cells',
          disabled: !contextMenu.tableContext?.hasMultiCellSelection,
        },
        {
          action: 'splitCell',
          label: 'Split cell',
          disabled: !contextMenu.tableContext?.canSplitCell,
          dividerAfter: true,
        },
        {
          action: 'selectTable',
          label: 'Select entire table',
        },
        { action: 'tableProperties', label: 'Table properties' },
        {
          action: 'deleteTable',
          label: 'Delete table',
          dividerAfter: true,
        }
      );
    }
    items.push({
      action: 'selectAll',
      label: 'Select All',
      shortcut: formatKeys('Ctrl+A'),
    });
    return items;
  }, [contextMenu.hasSelection, contextMenu.cursorInTable, contextMenu.tableContext]);

  const handleContextMenuAction = useCallback(
    async (action: TextContextAction) => {
      const view = getActiveEditorView();
      if (!view) return;

      // Focus the hidden PM so execCommand targets the right element.
      focusActiveEditor();

      switch (action) {
        case 'cut':
          document.execCommand('cut');
          break;
        case 'copy':
          document.execCommand('copy');
          break;
        case 'paste': {
          // Use the Clipboard API — document.execCommand('paste') is blocked in modern browsers.
          try {
            const items = await navigator.clipboard.read();
            let html = '';
            let text = '';
            for (const item of items) {
              if (item.types.includes('text/html')) {
                html = await (await item.getType('text/html')).text();
              }
              if (item.types.includes('text/plain')) {
                text = await (await item.getType('text/plain')).text();
              }
            }
            const dt = new DataTransfer();
            if (html) dt.items.add(html, 'text/html');
            if (text) dt.items.add(text, 'text/plain');
            const pasteEvent = new ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
            });
            view.dom.dispatchEvent(pasteEvent);
          } catch {
            try {
              const text = await navigator.clipboard.readText();
              if (text) view.dispatch(view.state.tr.insertText(text));
            } catch {
              // Clipboard access denied
            }
          }
          break;
        }
        case 'pasteAsPlainText':
          try {
            const text = await navigator.clipboard.readText();
            if (text) view.dispatch(view.state.tr.insertText(text));
          } catch {
            // Clipboard access denied
          }
          break;
        case 'delete': {
          const { from, to } = view.state.selection;
          if (from !== to) {
            view.dispatch(view.state.tr.deleteRange(from, to));
          }
          break;
        }
        case 'selectAll':
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.create(view.state.doc, 0, view.state.doc.content.size)
            )
          );
          break;
        case 'addRowAbove':
          addRowAbove(view.state, view.dispatch);
          break;
        case 'addRowBelow':
          addRowBelow(view.state, view.dispatch);
          break;
        case 'deleteRow':
          pmDeleteRow(view.state, view.dispatch);
          break;
        case 'addColumnLeft':
          addColumnLeft(view.state, view.dispatch);
          break;
        case 'addColumnRight':
          addColumnRight(view.state, view.dispatch);
          break;
        case 'deleteColumn':
          pmDeleteColumn(view.state, view.dispatch);
          break;
        case 'mergeCells':
          pmMergeCells(view.state, view.dispatch);
          break;
        case 'splitCell':
          openSplitCellDialog();
          break;
        case 'tableProperties':
          openTableProperties();
          break;
        case 'selectTable':
          pmSelectTable(view.state, view.dispatch);
          break;
        case 'deleteTable':
          pmDeleteTable(view.state, view.dispatch);
          break;
        case 'addComment': {
          const { from, to } = view.state.selection;
          if (from === to) break;
          // Compute Y position BEFORE dispatching — the dispatch triggers a
          // re-layout that rebuilds page DOM and invalidates the old spans.
          const yPos = findSelectionYPosition(
            scrollContainerRef.current,
            editorContentRef.current,
            from
          );
          const pendingMark = view.state.schema.marks.comment.create({
            commentId: PENDING_COMMENT_ID,
          });
          const tr = view.state.tr.addMark(from, to, pendingMark);
          tr.setSelection(TextSelection.create(tr.doc, to));
          view.dispatch(tr);
          onAddComment({ from, to, yPos });
          break;
        }
      }
      // TextContextMenu calls onClose after onAction, so no need to close here.
    },
    [
      getActiveEditorView,
      focusActiveEditor,
      openSplitCellDialog,
      openTableProperties,
      scrollContainerRef,
      editorContentRef,
      onAddComment,
    ]
  );

  return {
    contextMenu,
    imageContextMenu,
    handleEditorContextMenu,
    handleContextMenu,
    handleContextMenuClose,
    handleImageWrapApply,
    imageContextMenuTextActions,
    contextMenuItems,
    handleContextMenuAction,
  };
}
