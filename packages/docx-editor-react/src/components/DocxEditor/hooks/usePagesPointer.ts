/**
 * Pointer-routing hook for PagedEditor.
 *
 * Owns every mouse path that lands on the visible pages: cursor placement,
 * drag-to-select (with cell-selection promotion when the drag crosses a
 * table boundary), table column / row / right-edge resize handles, the
 * floating "+" row/column insert button, image clicks, hyperlink clicks,
 * word and paragraph multi-click selection, and the right-click → host
 * context-menu callback.
 *
 * Lots of state. Most lives in refs because the handlers run from window
 * listeners (handleMouseMove, handleMouseUp) where stale-closure traps
 * would be lethal — refs are read at event time, not capture time.
 *
 * `dragExtendRef` is the trampoline that lets `useDragAutoScroll`'s
 * auto-extend callback reach `getPositionFromMouse` without the two
 * forming a closure cycle. The trampoline is assigned after the hook's
 * `useCallback`s so the wire-up sees the latest `getPositionFromMouse`
 * identity on every render.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import type { CaretPosition, SelectionRect } from '@eigenpal/docx-editor-core/layout-bridge';
import {
  clickToPosition,
  clickToPositionDom,
  detectTableInsertHover,
  hitTestFragment,
  hitTestTableCell,
  TABLE_INSERT_HIDE_DELAY_MS as TABLE_INSERT_HIDE_DELAY,
} from '@eigenpal/docx-editor-core/layout-bridge';
import type { FlowBlock, Layout, Measure } from '@eigenpal/docx-editor-core/layout-engine';
import { addColumnRight, addRowBelow } from '@eigenpal/docx-editor-core/prosemirror';
import {
  captureInlinePositionEmu,
  findImageElement as coreFindImageElement,
  hitTestImage,
} from '@eigenpal/docx-editor-core/layout-painter';
import type { WrapType } from '@eigenpal/docx-editor-core/docx/wrapTypes';
import { findWordBoundaries } from '@eigenpal/docx-editor-core/utils';

import type { HiddenProseMirrorRef } from '../HiddenProseMirror';
import type { ImageSelectionInfo } from '../overlays/ImageSelectionOverlay';
import { useDragAutoScroll } from '../../../hooks/useDragAutoScroll';
import { useTableResizeState } from './useTableResizeState';
import {
  createCellDragTracker,
  findCellPosFromPmPos as coreFindCellPosFromPmPos,
} from '@eigenpal/docx-editor-core/prosemirror/cellDragSelection';

interface TableInsertButtonState {
  type: 'row' | 'column';
  /** Pixel position relative to viewport container */
  x: number;
  y: number;
  /** PM position inside target cell (to set selection before dispatching) */
  cellPmPos: number;
}

interface ImageInfo {
  pos: number;
  wrapType: WrapType;
  cssFloat?: 'left' | 'right' | 'none' | null;
  inlinePositionEmu?: { horizontalEmu: number; verticalEmu: number };
}

export interface UsePagesPointerOptions {
  pagesContainerRef: React.RefObject<HTMLDivElement | null>;
  hiddenPMRef: React.RefObject<HiddenProseMirrorRef | null>;
  layout: Layout | null;
  blocks: FlowBlock[];
  measures: Measure[];
  zoom: number;
  readOnly: boolean;
  onContextMenu?: (data: {
    x: number;
    y: number;
    hasSelection: boolean;
    image?: ImageInfo | null;
  }) => void;
  onHyperlinkClick?: (data: {
    href: string;
    displayText: string;
    tooltip?: string;
    /** The clicked link's viewport rect — anchors the hyperlink popover. */
    rect: DOMRect;
  }) => void;
  /** Open an external URL (read-only link clicks bypass the popover). */
  onOpenLink?: (href: string) => void;
  setSelectedImageInfo: React.Dispatch<React.SetStateAction<ImageSelectionInfo | null>>;
  setSelectionRects: React.Dispatch<React.SetStateAction<SelectionRect[]>>;
  setCaretPosition: React.Dispatch<React.SetStateAction<CaretPosition | null>>;
  buildImageSelectionInfo: (el: HTMLElement, pmPos: number) => ImageSelectionInfo;
  setIsFocused: React.Dispatch<React.SetStateAction<boolean>>;
  scrollToPositionImpl: (pmPos: number, forParaIdScroll?: boolean) => void;
}

export interface UsePagesPointerReturn {
  handlePagesMouseDown: (e: React.MouseEvent) => void;
  handlePagesMouseMove: (e: React.MouseEvent) => void;
  handlePagesClick: (e: React.MouseEvent) => void;
  handlePagesContextMenu: (e: React.MouseEvent) => void;
  handleTableInsertClick: (e: React.MouseEvent) => void;
  tableInsertButton: TableInsertButtonState | null;
  /** Cancel a pending delayed-hide so hovering the button keeps it visible. */
  clearTableInsertTimer: () => void;
  /** Hide the button immediately (used by the button's onMouseLeave). */
  hideTableInsertButton: () => void;
  getPositionFromMouse: (clientX: number, clientY: number) => number | null;
}

/**
 * Minimal surface every pointer gesture needs from the body PM
 * (`HiddenProseMirrorRef`). Routing through `activeSurface()` keeps the
 * handler body single-pipeline: drag, multi-click, image-select,
 * hyperlink, table-cell selection all flow through one accessor.
 */
interface ActivePmSurface {
  getView(): EditorView | null;
  setSelection(anchor: number, head?: number): void;
  setNodeSelection(pos: number): void;
  setCellSelection(anchorCellPos: number, headCellPos: number): void;
  focus(): void;
}

export function usePagesPointer(opts: UsePagesPointerOptions): UsePagesPointerReturn {
  const {
    pagesContainerRef,
    hiddenPMRef,
    layout,
    blocks,
    measures,
    zoom,
    readOnly,
    onContextMenu,
    onHyperlinkClick,
    onOpenLink,
    setSelectedImageInfo,
    setSelectionRects,
    setCaretPosition,
    buildImageSelectionInfo,
    setIsFocused,
    scrollToPositionImpl,
  } = opts;

  // Drag selection state
  const isDraggingRef = useRef(false);
  const dragAnchorRef = useRef<number | null>(null);

  // Table resize state machine (column-between, row, right-edge handles).
  const tableResize = useTableResizeState({ hiddenPMRef });

  // Cell-drag selection state machine (shared with Vue via core).
  const cellDragRef = useRef(createCellDragTracker());

  // Table insert button state + delayed-hide timer
  const [tableInsertButton, setTableInsertButton] = useState<TableInsertButtonState | null>(null);
  const tableInsertHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTableInsertTimer = useCallback(() => {
    if (tableInsertHideTimerRef.current) {
      clearTimeout(tableInsertHideTimerRef.current);
      tableInsertHideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (tableInsertHideTimerRef.current) clearTimeout(tableInsertHideTimerRef.current);
    };
  }, []);

  // Trampoline so useDragAutoScroll's callback can reach getPositionFromMouse
  // without forming a closure cycle. Assigned every render below.
  const dragExtendRef = useRef<(cx: number, cy: number) => void>(() => {});

  const dragAutoScrollCallbackRef = useCallback((cx: number, cy: number) => {
    dragExtendRef.current(cx, cy);
  }, []);
  const { updateMousePosition: updateDragScroll, stopAutoScroll: stopDragAutoScroll } =
    useDragAutoScroll({
      pagesContainerRef,
      onScrollExtendSelection: dragAutoScrollCallbackRef,
    });

  /**
   * Convert mouse coords to a PM position. DOM-based mapping first
   * (handles transforms, zoom, line-wraps); falls back to geometry hit
   * tests when the DOM doesn't resolve (e.g. clicks above/below content).
   */
  const getPositionFromMouse = useCallback(
    (clientX: number, clientY: number): number | null => {
      if (!pagesContainerRef.current || !layout) return null;

      const domPos = clickToPositionDom(pagesContainerRef.current, clientX, clientY, zoom);
      if (domPos !== null) return domPos;

      const pageElements = pagesContainerRef.current.querySelectorAll('.layout-page');
      let clickedPageIndex = -1;
      let pageRect: DOMRect | null = null;

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i];
        const rect = pageEl.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          clickedPageIndex = i;
          pageRect = rect;
          break;
        }
      }

      if (clickedPageIndex < 0 || !pageRect) return null;

      const pageX = (clientX - pageRect.left) / zoom;
      const pageY = (clientY - pageRect.top) / zoom;
      const page = layout.pages[clickedPageIndex];
      if (!page) return null;

      const pageHit = { pageIndex: clickedPageIndex, page, pageY };
      const fragmentHit = hitTestFragment(pageHit, blocks, measures, { x: pageX, y: pageY });
      if (!fragmentHit) return null;

      if (fragmentHit.fragment.kind === 'table') {
        const tableCellHit = hitTestTableCell(pageHit, blocks, measures, {
          x: pageX,
          y: pageY,
        });
        return clickToPosition(fragmentHit, tableCellHit);
      }
      return clickToPosition(fragmentHit);
    },
    [layout, blocks, measures, zoom, pagesContainerRef]
  );

  /**
   * Walk up from a PM position to find the enclosing tableCell / tableHeader.
   * Returns the cell's `before(d)` so CellSelection.create can resolve via
   * cellAround() internally.
   */
  // The body PM is the only editable surface. Held as a function (not a
  // value) so call sites read `.current` lazily on each gesture.
  const activeSurface = useCallback(
    (): ActivePmSurface | null => hiddenPMRef.current,
    [hiddenPMRef]
  );

  const findCellPosFromPmPos = useCallback(
    (pmPos: number): number | null => {
      const view = activeSurface()?.getView();
      return view ? coreFindCellPosFromPmPos(view, pmPos) : null;
    },
    [activeSurface]
  );

  const handlePagesMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const surface = activeSurface();
      if (!surface) return;

      // Right-click: stop Firefox from resetting selection, but skip our routing.
      if (e.button === 2) {
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;

      // Any mousedown hides the floating table-insert button.
      setTableInsertButton(null);
      clearTableInsertTimer();

      // Prevent native hyperlink navigation but let the rest of the handler
      // run so cursor placement / drag-selection still work. The popup is
      // shown on click (mouseup) instead.
      const anchorEl = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (anchorEl) e.preventDefault();

      if (readOnly) return;

      const target = e.target as HTMLElement;

      // Header/footer is render-only — a click on the painted H/F area is a
      // no-op (matches Word: don't yank the body caret to position 0).
      const isInHfArea =
        target.closest('.layout-page-header') || target.closest('.layout-page-footer');
      if (isInHfArea) {
        e.preventDefault();
        return;
      }

      // Table resize handles (column-between, row, right-edge). Body OR
      // header tables — `tableResize.tryStartFromMouseDown` doesn't care
      // which document the cells belong to, only that the click landed on
      // a `.layout-table-*-handle`.
      if (tableResize.tryStartFromMouseDown(target, e)) return;

      // Image click → NodeSelection on the active doc.
      const imageEl = coreFindImageElement(target);
      if (imageEl) {
        e.preventDefault();
        e.stopPropagation();
        const pmStart = imageEl.dataset.pmStart;
        if (pmStart !== undefined) {
          const pos = parseInt(pmStart, 10);
          surface.setNodeSelection(pos);
          setSelectedImageInfo(buildImageSelectionInfo(imageEl, pos));
          setSelectionRects([]);
          setCaretPosition(null);
        }
        surface.focus();
        setIsFocused(true);
        return;
      }

      // Click outside an image clears the image selection.
      setSelectedImageInfo(null);
      e.preventDefault();

      const pmPos = getPositionFromMouse(e.clientX, e.clientY);
      if (pmPos !== null) {
        // Track for potential text-drag → cell-drag promotion.
        cellDragRef.current.begin(findCellPosFromPmPos(pmPos));
        isDraggingRef.current = true;
        dragAnchorRef.current = pmPos;
        surface.setSelection(pmPos);
      } else {
        // Click outside content — move cursor to end of active doc.
        cellDragRef.current.begin(null);
        const view = surface.getView();
        if (view) {
          const endPos = Math.max(0, view.state.doc.content.size - 1);
          surface.setSelection(endPos);
          dragAnchorRef.current = endPos;
          isDraggingRef.current = true;
        }
      }

      surface.focus();
      setIsFocused(true);
    },
    [
      activeSurface,
      readOnly,
      getPositionFromMouse,
      findCellPosFromPmPos,
      tableResize,
      clearTableInsertTimer,
      setSelectedImageInfo,
      setSelectionRects,
      setCaretPosition,
      buildImageSelectionInfo,
      setIsFocused,
    ]
  );

  // Re-wire the drag trampoline every render so it sees the latest
  // `getPositionFromMouse` closure + the latest active surface.
  dragExtendRef.current = (cx: number, cy: number) => {
    if (!isDraggingRef.current || dragAnchorRef.current === null) return;
    const surface = activeSurface();
    if (!surface) return;
    const pmPos = getPositionFromMouse(cx, cy);
    if (pmPos === null) return;
    surface.setSelection(dragAnchorRef.current, pmPos);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      // Table resize drag — one of column / row / right-edge updates the
      // visual handle and the tentative width / height.
      if (tableResize.handleMouseMoveUpdate(e)) return;

      if (!isDraggingRef.current || dragAnchorRef.current === null) return;
      const surface = activeSurface();
      if (!surface || !pagesContainerRef.current) return;

      updateDragScroll(e.clientX, e.clientY);

      const pmPos = getPositionFromMouse(e.clientX, e.clientY);
      if (pmPos === null) return;

      // A drag that crosses cell boundaries is promoted to a CellSelection;
      // when it handles the move, skip the text-selection update.
      const view = surface.getView();
      if (view && cellDragRef.current.update(view, pmPos, e.clientX)) return;

      // Regular text-selection drag (outside tables, or inside a single cell).
      const anchor = dragAnchorRef.current;
      surface.setSelection(anchor, pmPos);
    },
    [
      activeSurface,
      getPositionFromMouse,
      findCellPosFromPmPos,
      updateDragScroll,
      tableResize,
      pagesContainerRef,
    ]
  );

  const handleMouseUp = useCallback(() => {
    // Resize commit (column / row / right-edge) takes priority.
    if (tableResize.tryCommit()) return;

    isDraggingRef.current = false;
    cellDragRef.current.end();
    stopDragAutoScroll();
    // Keep dragAnchorRef for potential shift-click extension.
  }, [stopDragAutoScroll, tableResize]);

  // Global mousemove / mouseup listeners — drag selection escapes the
  // pagesContainer once you mouse out of it, so the listeners must live on
  // window.
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handlePagesMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Skip during drags / resizes.
      if (
        readOnly ||
        isDraggingRef.current ||
        cellDragRef.current.isCellDragging ||
        tableResize.isAnyResizeActive()
      )
        return;

      const pagesEl = pagesContainerRef.current;
      if (!pagesEl) return;

      const hit = detectTableInsertHover({
        mouseX: e.clientX,
        mouseY: e.clientY,
        pagesContainer: pagesEl,
        target: e.target as HTMLElement,
        hfEditMode: null,
      });

      if (!hit) {
        // Brief moves between cells flicker the button; schedule a delayed
        // hide instead of clearing immediately. detectTableInsertHover
        // returns null for both "no nearby table" and "near table but not
        // over a row/column"; both deserve the same delayed-hide UX.
        if (!tableInsertHideTimerRef.current) {
          tableInsertHideTimerRef.current = setTimeout(() => {
            setTableInsertButton(null);
            tableInsertHideTimerRef.current = null;
          }, TABLE_INSERT_HIDE_DELAY);
        }
        return;
      }

      const viewportEl = pagesEl.parentElement;
      if (!viewportEl) return;
      // viewportEl carries `transform: scale(zoom)`; its rect is screen-space.
      // The button is an absolutely-positioned child of that scaled element, so
      // its left/top live in the element's own (unscaled) coords. Divide the
      // screen-space offset by zoom or it gets re-scaled and drifts (#928).
      const viewportRect = viewportEl.getBoundingClientRect();
      setTableInsertButton({
        type: hit.type,
        x: (hit.clientX - viewportRect.left) / zoom,
        y: (hit.clientY - viewportRect.top) / zoom,
        cellPmPos: hit.cellPmPos,
      });
      clearTableInsertTimer();
    },
    [readOnly, clearTableInsertTimer, pagesContainerRef, zoom]
  );

  const handleTableInsertClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!tableInsertButton) return;
      const surface = activeSurface();
      const view = surface?.getView();
      if (!surface || !view) return;

      const { type, cellPmPos } = tableInsertButton;
      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, cellPmPos + 1));
      view.dispatch(tr);

      if (type === 'row') {
        addRowBelow(view.state, view.dispatch);
      } else {
        addColumnRight(view.state, view.dispatch);
      }

      setTableInsertButton(null);
      surface.focus();
    },
    [tableInsertButton, activeSurface]
  );

  const handlePagesClick = useCallback(
    (e: React.MouseEvent) => {
      const surface = activeSurface();

      // Hyperlink: bookmark anchor (#name) or external href.
      const anchorEl = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (anchorEl) {
        const href = anchorEl.getAttribute('href') || '';
        const isExternal = href.length > 0 && !href.startsWith('#');
        // Read-only (no editable surface): external links just open. Fall back
        // to window.open when the host gives no opener (web), matching navigate.
        if (!surface) {
          if (isExternal) {
            e.preventDefault();
            if (onOpenLink) onOpenLink(href);
            else window.open(href, '_blank', 'noopener,noreferrer');
          }
          return;
        }
        e.preventDefault();
        const view = surface.getView();
        if (href.startsWith('#')) {
          const bookmarkName = href.substring(1);
          if (bookmarkName && view) {
            let targetPos: number | null = null;
            view.state.doc.descendants((node, pos) => {
              if (targetPos !== null) return false;
              if (node.type.name === 'paragraph') {
                const bookmarks = node.attrs.bookmarks as
                  | Array<{ id: number; name: string }>
                  | undefined;
                if (bookmarks?.some((b) => b.name === bookmarkName)) {
                  targetPos = pos;
                  return false;
                }
              }
            });
            if (targetPos !== null) {
              scrollToPositionImpl(targetPos);
              surface.setSelection(targetPos + 1);
            }
          }
        } else if (onHyperlinkClick) {
          // External hyperlink — show popup unless this is a drag-to-select.
          const hasRangeSelection = view && view.state.selection.from !== view.state.selection.to;
          if (!hasRangeSelection) {
            const displayText = anchorEl.textContent || '';
            const tooltip = anchorEl.getAttribute('title') || undefined;
            onHyperlinkClick({ href, displayText, tooltip, rect: anchorEl.getBoundingClientRect() });
          }
        }
        return;
      }

      if (!surface) return;
      const view = surface.getView();
      if (!view) return;

      // Header/footer is render-only — multi-click word/paragraph selection
      // would resolve H/F-local PM positions (the painted H/F spans carry
      // data-pm-start/end) against the BODY doc, mis-selecting or throwing.
      // Bail before any selection logic (hyperlink handling above already ran).
      const clickTarget = e.target as HTMLElement;
      if (clickTarget.closest('.layout-page-header') || clickTarget.closest('.layout-page-footer')) {
        return;
      }

      // Double-click: cell selection if inside a table, otherwise word selection.
      if (e.detail === 2) {
        const pmPos = getPositionFromMouse(e.clientX, e.clientY);
        if (pmPos !== null) {
          const cellPos = findCellPosFromPmPos(pmPos);
          if (cellPos !== null) {
            e.preventDefault();
            e.stopPropagation();
            surface.setCellSelection(cellPos, cellPos);
            return;
          }

          const { doc } = view.state;
          const $pos = doc.resolve(pmPos);
          const parent = $pos.parent;
          if (parent.isTextblock) {
            const text = parent.textContent;
            const offset = $pos.parentOffset;
            const [start, end] = findWordBoundaries(text, offset);
            const absStart = $pos.start() + start;
            const absEnd = $pos.start() + end;
            if (absStart < absEnd) surface.setSelection(absStart, absEnd);
          }
        }
      }

      // Triple-click: paragraph selection.
      if (e.detail === 3) {
        const pmPos = getPositionFromMouse(e.clientX, e.clientY);
        if (pmPos !== null) {
          const $pos = view.state.doc.resolve(pmPos);
          surface.setSelection($pos.start($pos.depth), $pos.end($pos.depth));
        }
      }
    },
    [
      activeSurface,
      getPositionFromMouse,
      onHyperlinkClick,
      onOpenLink,
      findCellPosFromPmPos,
      scrollToPositionImpl,
    ]
  );

  const handlePagesContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onContextMenu) return;
      e.preventDefault();

      const surface = activeSurface();
      const view = surface?.getView();
      if (!surface || !view) return;

      // Two routes land here. The cheap one — right-clicking a non-selected
      // image — surfaces the image element as e.target and we walk up. The
      // harder one is when PM already has a NodeSelection on the image
      // (because the user clicked it once first): PM mounts a selection
      // overlay that swallows pointer events, so e.target lands on the
      // overlay, not on .layout-page-floating-image etc. Fall through to
      // the current selection in that case.
      const readImageNodeAt = (pos: number): ImageInfo | null => {
        const node = view.state.doc.nodeAt(pos);
        if (!node || node.type.name !== 'image') return null;
        const wrapType = (node.attrs.wrapType as WrapType | undefined) ?? 'inline';
        const cssFloat = node.attrs.cssFloat as ImageInfo['cssFloat'];
        return { pos, wrapType, cssFloat };
      };

      let imageInfo: ImageInfo | null = null;
      const hit = hitTestImage(e.target);
      if (hit) {
        imageInfo = readImageNodeAt(hit.pos);
        if (imageInfo) {
          imageInfo.inlinePositionEmu = captureInlinePositionEmu(hit.imageEl, zoom);
        }
      }
      if (!imageInfo) {
        const sel = view.state.selection;
        if (sel instanceof NodeSelection && sel.node.type.name === 'image') {
          imageInfo = readImageNodeAt(sel.from);
          if (imageInfo) {
            const inlineEl = pagesContainerRef.current?.querySelector(
              `.layout-run-image[data-pm-start="${sel.from}"]`
            ) as HTMLElement | null;
            if (inlineEl) {
              imageInfo.inlinePositionEmu = captureInlinePositionEmu(inlineEl, zoom);
            }
          }
        }
      }

      const { from, to } = view.state.selection;
      const pmPos = getPositionFromMouse(e.clientX, e.clientY);

      if (imageInfo) {
        // Right-clicking an image selects it (NodeSelection) so the selection
        // tracker populates the image context the properties popover reads;
        // a plain cursor move would leave that context empty.
        surface.setNodeSelection(imageInfo.pos);
        surface.focus();
        setIsFocused(true);
      } else if (pmPos !== null && (from === to || pmPos < from || pmPos > to)) {
        // Right-click inside an existing range keeps the selection; otherwise
        // move cursor to the right-click position.
        surface.setSelection(pmPos);
        surface.focus();
        setIsFocused(true);
      }

      const hasSelection = view.state.selection.from !== view.state.selection.to;

      onContextMenu({ x: e.clientX, y: e.clientY, hasSelection, image: imageInfo });
    },
    // `zoom` is read inside captureInlinePositionEmu to convert post-
    // transform px deltas back to authored space.
    [
      activeSurface,
      onContextMenu,
      getPositionFromMouse,
      zoom,
      pagesContainerRef,
      setIsFocused,
    ]
  );

  const hideTableInsertButton = useCallback(() => setTableInsertButton(null), []);

  return {
    handlePagesMouseDown,
    handlePagesMouseMove,
    handlePagesClick,
    handlePagesContextMenu,
    handleTableInsertClick,
    tableInsertButton,
    clearTableInsertTimer,
    hideTableInsertButton,
    getPositionFromMouse,
  };
}
