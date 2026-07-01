/**
 * DocxEditor Component
 *
 * Main component integrating all editor features:
 * - Toolbar for formatting
 * - ProseMirror-based editor for content editing
 * - Zoom control
 * - Error boundary
 * - Loading states
 */

import { useRef, useCallback, useState, useEffect, useMemo, forwardRef } from 'react';
import type { Document } from '@eigenpal/docx-editor-core/types/document';

import { cn } from '../lib/utils';
import type { SelectionFormatting } from '../features/toolbar/types';
import type { ImageContext } from '../features/images/types';
import { useOutlineSidebar } from '../features/outline/use-outline-sidebar';
import { useKeyboardShortcuts } from './interactions/use-keyboard-shortcuts';
import { useFileIO } from './lifecycle/use-file-io';
import { usePageSetupControls } from '../features/page-setup/use-page-setup-controls';
import { useWatermarkControls } from '../features/page-setup/use-watermark-controls';
import { useHyperlink } from '../features/hyperlinks/use-hyperlink';
import { useFormattingActions } from '../features/toolbar/use-formatting-actions';
import { useImageActions } from '../features/images/use-image-actions';
import { useDocxEditorRefApi } from './ref-api/use-docx-editor-ref-api';
import { useTableDialogs } from '../features/tables/use-table-dialogs';
import { useDocumentLoader } from './lifecycle/use-document-loader';
import { useContextMenus } from '../features/context-menu/use-context-menus';
import { useCommentManagement } from '../features/review/use-comment-management';
import { useCommentLifecycle } from '../features/review/use-comment-lifecycle';
import { useSelectionTracker } from './interactions/use-selection-tracker';
import { useFloatingCommentBtn } from '../features/review/use-floating-comment-btn';
import { useActiveEditor } from './ref-api/use-active-editor';
import { useScrollPageInfo } from './interactions/use-scroll-page-info';
import { DocxEditorOverlays } from './docx-editor-overlays';
import { DocxEditorDialogs } from './docx-editor-dialogs';
import { undoDepth, redoDepth } from 'prosemirror-history';
import { DocxToolbar } from '../features/toolbar/docx-toolbar';
import { DocxEditorPagedArea } from './docx-editor-paged-area';
import { useResetEditorState } from './lifecycle/use-reset-editor-state';
import { DocxEditorShell } from './docx-editor-shell';
import { ReviewHighlightStyles } from './review-highlight-styles';
import { ReviewProvider } from '../features/review/review-context';
import { useEditorChrome } from './use-editor-chrome';
import type { FontOption } from '@eigenpal/docx-editor-core/utils/fontOptions';
import { useCommentWorkflow } from '../features/review/use-comment-workflow';
import { extractTrackedChanges } from '@eigenpal/docx-editor-core/prosemirror/utils/extractTrackedChanges';
import { type EditorState as PMEditorState } from 'prosemirror-state';
// Dialog hooks and utilities (static imports — lightweight, no UI)
import { useFindReplace } from '../features/find-replace/use-find-replace';
import { DocumentAgent } from '@eigenpal/docx-editor-core/agent';
import { DefaultLoadingIndicator, DefaultPlaceholder, ParseError } from './states/editor-states';
import { useDocumentState } from './lifecycle/use-document-state';

// Extension system
import { createStarterKit } from '@eigenpal/docx-editor-core/prosemirror/extensions';
import { ExtensionManager } from '@eigenpal/docx-editor-core/prosemirror/extensions';
import {
  createSuggestionModePlugin,
  setSuggestionMode,
} from '@eigenpal/docx-editor-core/prosemirror/plugins';

// ProseMirror editor
import {
  type SelectionState,
  createStyleResolver,
  type TableContextInfo,
} from '@eigenpal/docx-editor-core/prosemirror';
import { collectHeadings } from '@eigenpal/docx-editor-core/utils';
import {
  prefersColorSchemeDark,
  resolveIsDark,
  subscribeSystemDark,
} from '@eigenpal/docx-editor-core/utils';

// Paginated editor
import type { PagedEditorRef } from './paged-editor';


// ============================================================================
// TYPES
// ============================================================================

import type { DocxEditorProps, DocxEditorRef } from './types';
export type { DocxEditorProps, DocxEditorRef } from './types';

/**
 * Editor internal state
 */
interface EditorState {
  isLoading: boolean;
  parseError: string | null;
  zoom: number;
  /** Current selection formatting for toolbar */
  selectionFormatting: SelectionFormatting;
  /** ProseMirror table context (for showing table toolbar) */
  pmTableContext: TableContextInfo | null;
  /** Image context when cursor is on an image node */
  pmImageContext: ImageContext | null;
}

export type { EditorMode } from '../features/toolbar/editing-modes';
import type { EditorMode } from '../features/toolbar/editing-modes';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// `injectReplyRangeMarkers` + `injectTCReplyRangeMarkers` live in
// `@eigenpal/docx-editor-core/docx` (pre-serialization range-marker injection).

import {
  createCommentIdAllocator,
} from '@eigenpal/docx-editor-core/prosemirror/commentIdAllocator';
import { EMPTY_ANCHOR_POSITIONS } from '../features/review/constants';

/**
 * DocxEditor - Complete DOCX editor component
 */
export const DocxEditor = forwardRef<DocxEditorRef, DocxEditorProps>(function DocxEditor(
  {
    documentBuffer,
    document: initialDocument,
    author = 'User',
    onChange,
    onOpenLink,
    colorMode = 'light',
    theme,
    readOnly: readOnlyProp = false,
    loadingIndicator,
    onPrint,
    renderTitleBarRight,
  },
  ref
) {
  // State
  const [state, setState] = useState<EditorState>({
    isLoading: !!documentBuffer,
    parseError: null,
    zoom: 1.0,
    selectionFormatting: {},
    pmTableContext: null,
    pmImageContext: null,
  });

  const [systemDark, setSystemDark] = useState(prefersColorSchemeDark);
  useEffect(() => {
    // subscribeSystemDark re-syncs immediately (correcting a stale seed if the
    // OS theme changed while colorMode was 'light'/'dark') and is SSR-safe.
    if (colorMode !== 'system') return;
    return subscribeSystemDark(setSystemDark);
  }, [colorMode]);

  const isDark = resolveIsDark(colorMode, systemDark);

  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  // PagedEditor ref declared early so useCommentManagement (which reads
  // pagedEditorRef.current.getView() for orphan cleanup) can be wired before
  // the trackedChanges effect that drives `setComments`.
  const pagedEditorRef = useRef<PagedEditorRef>(null);
  // Stable getter for the painted caret rect — anchors the cursor popovers.
  const getCaretRect = useCallback(() => pagedEditorRef.current?.getCaretRect() ?? null, []);

  const {
    comments,
    setComments,
    isAddingComment,
    setIsAddingComment,
    isAddingCommentRef,
    commentSelectionRange,
    setCommentSelectionRange,
    addCommentYPosition,
    setAddCommentYPosition,
    floatingCommentBtn,
    setFloatingCommentBtn,
    cleanOrphanedCommentsTimerRef,
    cleanOrphanedComments,
  } = useCommentManagement({
    pagedEditorRef,
  });

  // Latest PM state — mirrored from the view on every doc-changing transaction.
  // Drives the tracked changes derivation so the sidebar derives its list directly
  // from PM (the source of truth, including remote ySync updates) rather than a debounced
  // copy in React state.
  const [pmState, setPmState] = useState<PMEditorState | null>(null);

  const { entries: trackedChanges, commentToRevision } = useMemo(
    () => extractTrackedChanges(pmState),
    [pmState]
  );

  const [anchorPositions, setAnchorPositions] =
    useState<Map<string, number>>(EMPTY_ANCHOR_POSITIONS);

  const [editingMode, setEditingMode] = useState<EditorMode>('editing');
  // 'viewing' mode acts as read-only
  const readOnly = readOnlyProp || editingMode === 'viewing';

  // Bridge / agent event subscribers — fan-out from the existing onChange and
  // onSelectionChange paths so multiple listeners (host app, MCP server, etc.)
  // can observe edits without competing for the single React prop.
  const contentChangeSubscribersRef = useRef(new Set<(doc: Document) => void>());
  const selectionChangeSubscribersRef = useRef(new Set<(s: SelectionState | null) => void>());

  // The current document — rendered source of truth. Undo/redo is ProseMirror's
  // (the Mod-z keymap), so this is plain state, not a history stack.
  const docState = useDocumentState<Document | null>(initialDocument || null);

  // Extension manager — built once, provides schema + plugins + commands
  const extensionManager = useMemo(() => {
    const mgr = new ExtensionManager(createStarterKit());
    mgr.buildSchema();
    mgr.initializeRuntime();
    return mgr;
  }, []);

  // Suggestion mode plugin — merged with external plugins
  const suggestionPlugin = useMemo(
    () => createSuggestionModePlugin(editingMode === 'suggesting', author),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const editorPlugins = useMemo(() => [suggestionPlugin], [suggestionPlugin]);

  // Refs (pagedEditorRef is declared earlier — useCommentManagement needs it)
  const agentRef = useRef<DocumentAgent | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Set when page setup changes (model-level, not a PM transaction); read by the
  // save path to force a full repack so the body sectPr actually persists.
  const sectionPropsDirtyRef = useRef(false);
  // Save the last known selection for restoring after toolbar interactions
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const editorContentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [documentFonts, setDocumentFonts] = useState<FontOption[]>([]);
  const {
    showOutline,
    setShowOutline,
    showOutlineRef,
    outlineHeadings,
    setHeadingInfos,
    toolbarHeight,
    toolbarRefCallback,
    editorScrollLeft,
  } = useOutlineSidebar({
    scrollContainerRef,
    isLoading: state.isLoading,
  });
  // Keep docState.state accessible in stable callbacks without stale closures
  const docStateRef = useRef(docState.state);
  docStateRef.current = docState.state;
  // Track current border color/width for border presets (like Google Docs)
  const borderSpecRef = useRef({ style: 'single', size: 4, color: { rgb: '000000' } });
  // Cache style resolver to avoid recreating on every selection change
  const styleResolverCacheRef = useRef<{
    styles: unknown;
    resolver: ReturnType<typeof createStyleResolver>;
  } | null>(null);
  const getCachedStyleResolver = useCallback(
    (styles: Parameters<typeof createStyleResolver>[0]) => {
      const cached = styleResolverCacheRef.current;
      if (cached && cached.styles === styles) {
        return cached.resolver;
      }
      const resolver = createStyleResolver(styles);
      styleResolverCacheRef.current = { styles, resolver };
      return resolver;
    },
    []
  );

  const { getActiveEditorView, focusActiveEditor, undoActiveEditor, redoActiveEditor } =
    useActiveEditor({ pagedEditorRef });

  // Find/Replace hook
  const findReplace = useFindReplace(pagedEditorRef);

  // Unified hyperlink popover session (click-a-link view + Ctrl+K/toolbar edit).
  const hyperlink = useHyperlink({ getActiveEditorView, focusActiveEditor, onOpenLink });

  // Lifted out of useDocumentLoader / useCommentLifecycle so `resetForNewDocument`
  // (declared next) can clear both on every fresh load.
  const commentsLoadedRef = useRef(false);
  const trackedChangesLoadedRef = useRef(false);

  // One comment/revision ID allocator per editor instance (monotonic, no reuse).
  // Seeded above the loaded doc's max ID on load; shared by every comment/
  // tracked-change allocation in this component and its hooks.
  const commentIdAllocatorRef = useRef(createCommentIdAllocator());

  const { resetForNewDocument } = useResetEditorState({
    commentsLoadedRef,
    trackedChangesLoadedRef,
    setComments,
    setHeadingInfos,
    setShowCommentsSidebar,
    setIsAddingComment,
    setCommentSelectionRange,
    setAddCommentYPosition,
    setFloatingCommentBtn,
    setAnchorPositions,
    clearFindReplaceMatches: useCallback(() => findReplace.reset(), [findReplace]),
    cleanOrphanedCommentsTimerRef,
  });

  const { loadBuffer } = useDocumentLoader({
    documentBuffer,
    initialDocument,
    docState,
    agentRef,
    pagedEditorRef,
    setLoadingState: useCallback((s: { isLoading: boolean; parseError: string | null }) => {
      setState((prev) => ({ ...prev, isLoading: s.isLoading, parseError: s.parseError }));
    }, []),
    setComments,
    setShowCommentsSidebar,
    resetForNewDocument,
    commentsLoadedRef,
    commentIdAllocator: commentIdAllocatorRef.current,
    setDocumentFonts,
  });

  const {
    imageInputRef,
    docxInputRef,
    handleSave,
    handleDirectPrint,
    handleOpenDocument,
    handleDocxFileChange,
    handleInsertImageClick,
    handleImageFileChange,
  } = useFileIO({
    agentRef,
    pagedEditorRef,
    containerRef,
    comments,
    onPrint,
    loadBuffer,
    getActiveEditorView,
    focusActiveEditor,
    sectionPropsDirtyRef,
  });

  // Mirror PM state on each external document load (mount-time view creation
  // is handled by PagedEditor's `onReady` below; this effect catches subsequent
  // loads via `document`/`documentBuffer` prop changes, which go through
  // HiddenProseMirror's `updateState` and never fire `handleDocumentChange`).
  // Effects run child-first, so `view.state` already reflects the new doc by
  // the time this runs.
  useEffect(() => {
    if (state.isLoading || !docState.state) return;
    const view = pagedEditorRef.current?.getView();
    if (view) setPmState(view.state);
  }, [state.isLoading, docState.state]);

  // Auto-open the sidebar once if the loaded document already has tracked changes.
  useCommentLifecycle({
    commentToRevision,
    setComments,
    pmState,
    isLoading: state.isLoading,
    trackedChangesCount: trackedChanges.length,
    setShowCommentsSidebar,
    trackedChangesLoadedRef,
  });

  // Sync editing mode to ProseMirror suggestion mode plugin
  useEffect(() => {
    const view = pagedEditorRef.current?.getView();
    if (view) {
      setSuggestionMode(editingMode === 'suggesting', view.state, view.dispatch, author);
    }
  }, [editingMode, author]);

  const pushDocument = useCallback(
    (document: Document) => {
      docState.set(document);
    },
    [docState]
  );

  // Handle document change
  const handleDocumentChange = useCallback(
    (newDocument: Document) => {
      pushDocument(newDocument);
      onChange?.(newDocument);
      // Fan out to bridge subscribers (errors in one don't break the others).
      for (const cb of contentChangeSubscribersRef.current) {
        try {
          cb(newDocument);
        } catch (e) {
          console.error('contentChange subscriber threw:', e);
        }
      }
      // Update outline headings if sidebar is open
      if (showOutlineRef.current) {
        const view = pagedEditorRef.current?.getView();
        if (view) {
          setHeadingInfos(collectHeadings(view.state.doc));
        }
      }
      // Mirror latest PM state so the tracked-changes memo (and the threading
      // effect) re-derive from the new doc — including for transactions that came in
      // remotely via ySyncPlugin in collab mode.
      const view = pagedEditorRef.current?.getView();
      if (view) setPmState(view.state);
      // Clean up orphaned comments (debounced — avoid yanking comments mid-edit)
      if (cleanOrphanedCommentsTimerRef.current) {
        clearTimeout(cleanOrphanedCommentsTimerRef.current);
      }
      cleanOrphanedCommentsTimerRef.current = setTimeout(cleanOrphanedComments, 300);
    },
    [onChange, pushDocument, cleanOrphanedComments]
  );

  // Recompute the floating "add comment" button position from the current PM
  // selection + page/container geometry. Called from handleSelectionChange and
  // from the geometry-change effects below (resize, zoom), because PagedEditor's
  // onSelectionChange no longer fires on mere overlay redraws after the
  // state-identity dedup in #268.
  const { recomputeFloatingCommentBtn } = useFloatingCommentBtn({
    pagedEditorRef,
    scrollContainerRef,
    editorContentRef,
    isAddingCommentRef,
    setFloatingCommentBtn,
    readOnly,
    isLoading: state.isLoading,
    zoom: state.zoom,
  });

  // Handle selection changes from ProseMirror
  const { handleSelectionChange } = useSelectionTracker({
    getActiveEditorView,
    lastSelectionRef,
    borderSpecRef,
    theme,
    docStateRef,
    getCachedStyleResolver,
    setFloatingCommentBtn,
    applySelectionDelta: useCallback((delta) => setState((prev) => ({ ...prev, ...delta })), []),
    recomputeFloatingCommentBtn,
    selectionChangeSubscribersRef,
  });

  useKeyboardShortcuts({
    pagedEditorRef,
    disableFindReplaceShortcuts: false,
    showFileOpen: true,
    onOpenDocument: handleOpenDocument,
    findReplace,
    openHyperlinkCreate: hyperlink.openCreate,
    openHyperlinkEdit: hyperlink.openEdit,
  });

  // Toggle document outline sidebar
  const handleToggleOutline = useCallback(() => {
    setShowOutline((prev) => {
      if (!prev) {
        // Opening: collect headings immediately
        const view = pagedEditorRef.current?.getView();
        if (view) {
          setHeadingInfos(collectHeadings(view.state.doc));
        }
      }
      return !prev;
    });
  }, []);

  // Navigate to a heading from the outline
  const handleHeadingInfoClick = useCallback((pmPos: number) => {
    pagedEditorRef.current?.scrollToPosition(pmPos);
    // Also set selection to the heading
    pagedEditorRef.current?.setSelection(pmPos + 1);
    pagedEditorRef.current?.focus();
  }, []);

  // Handle shape insertion
  // Handle image wrap type change
  const {
    imagePropsOpen,
    setImagePropsOpen,
    imagePropsRect,
    handleOpenImageProperties,
    handleImageWrapType,
    handleImageTransform,
    handleApplyImageProperties,
  } = useImageActions({
    pmImageContext: state.pmImageContext,
    zoom: state.zoom,
    getActiveEditorView,
    getCaretRect,
    focusActiveEditor,
  });

  const {
    tablePropsOpen,
    setTablePropsOpen,
    tablePropsRect,
    splitCellDialogState,
    openSplitCellDialog,
    handleTableAction,
    handleSplitCellDialogClose,
    handleSplitCellDialogApply,
  } = useTableDialogs({
    getActiveEditorView,
    getCaretRect,
    focusActiveEditor,
    borderSpecRef,
  });

  const openTableProperties = useCallback(
    () => handleTableAction({ type: 'openTableProperties' }),
    [handleTableAction]
  );

  const {
    handleFormat,
    handleInsertTable,
    handleInsertPageBreak,
    handleInsertSectionBreakNextPage,
    handleInsertSectionBreakContinuous,
    handleInsertTOC,
  } = useFormattingActions({
    getActiveEditorView,
    focusActiveEditor,
    lastSelectionRef,
    openHyperlinkCreate: hyperlink.openCreate,
    openHyperlinkEdit: hyperlink.openEdit,
    docStateRef,
    getCachedStyleResolver,
  });

  const {
    contextMenu,
    imageContextMenu,
    handleEditorContextMenu,
    handleContextMenu,
    handleContextMenuClose,
    handleImageWrapApply,
    imageContextMenuTextActions,
    contextMenuItems,
    handleContextMenuAction,
  } = useContextMenus({
    getActiveEditorView,
    focusActiveEditor,
    openSplitCellDialog,
    openTableProperties,
    scrollContainerRef,
    editorContentRef,
    onBeginAddComment: useCallback(
      ({ from, to, yPos }: { from: number; to: number; yPos: number | null }) => {
        setCommentSelectionRange({ from, to });
        setAddCommentYPosition(yPos);
        setShowCommentsSidebar(true);
        setIsAddingComment(true);
        setFloatingCommentBtn(null);
      },
      []
    ),
  });

  const {
    showPageSetup,
    setShowPageSetup,
    handleOpenPageSetup,
    handlePageSetupApply,
  } = usePageSetupControls({
    document: docState.state,
    readOnly,
    handleDocumentChange,
    sectionPropsDirtyRef,
  });

  const {
    currentWatermark,
    handleWatermarkApply,
  } = useWatermarkControls({
    readOnly,
    getBodyEditorView: () => pagedEditorRef.current?.getView(),
  });

  const scrollPageInfoRef = useScrollPageInfo({
    scrollContainerRef,
    pagedEditorRef,
  });

  // Expose ref methods
  useDocxEditorRefApi({
    ref,
    agentRef,
    document: docState.state,
    docStateRef,
    pagedEditorRef,
    handleSave,
    setZoom: (zoom: number) => setState((prev) => ({ ...prev, zoom })),
    openFind: () => findReplace.openFind(),
    scrollPageInfoRef,
    comments,
    setComments,
    setShowCommentsSidebar,
    contentChangeSubscribersRef,
    selectionChangeSubscribersRef,
    getCachedStyleResolver,
    commentIdAllocator: commentIdAllocatorRef.current,
  });

  // Comment + tracked-change orchestration (sidebar callbacks, cursor→card
  // walker, resolved-id masks). The sidebar cards and accept/reject paths live
  // in features/review; this is the glue that drives them.
  const {
    allSidebarItems,
    expandedSidebarItem,
    setExpandedSidebarItem,
    resolvedCommentIds,
    resolvedIdsForRender,
    handlePagedSelectionChange,
  } = useCommentWorkflow({
    pagedEditorRef,
    author,
    commentIdAllocatorRef,
    comments,
    setComments,
    isAddingComment,
    commentSelectionRange,
    setCommentSelectionRange,
    addCommentYPosition,
    setAddCommentYPosition,
    setIsAddingComment,
    trackedChanges,
    showCommentsSidebar,
    setShowCommentsSidebar,
    handleSelectionChange,
  });

  const sidebarOpen = allSidebarItems.length > 0;

  const {
    initialSectionProperties,
    finalSectionProperties,
    headerContent,
    footerContent,
    firstPageHeaderContent,
    firstPageFooterContent,
    minLayoutWidth,
    pageWidthPx,
    containerStyle,
    mainContentStyle,
    editorContainerStyle,
  } = useEditorChrome({ document: docState.state, showOutline, sidebarOpen });

  // Bundled for ReviewContext — the review state the paged-area's sidebar overlay
  // + floating button consume, so it no longer drills through the paged area.
  const reviewContextValue = useMemo(
    () => ({
      sidebarOpen,
      sidebarItems: allSidebarItems,
      anchorPositions,
      expandedSidebarItem,
      setExpandedSidebarItem,
      comments,
      resolvedCommentIds,
      resolvedIdsForRender,
      setShowCommentsSidebar,
      floatingCommentBtn,
      isAddingComment,
      setCommentSelectionRange,
      setAddCommentYPosition,
      setIsAddingComment,
      setFloatingCommentBtn,
    }),
    [
      sidebarOpen,
      allSidebarItems,
      anchorPositions,
      expandedSidebarItem,
      setExpandedSidebarItem,
      comments,
      resolvedCommentIds,
      resolvedIdsForRender,
      setShowCommentsSidebar,
      floatingCommentBtn,
      isAddingComment,
      setCommentSelectionRange,
      setAddCommentYPosition,
      setIsAddingComment,
      setFloatingCommentBtn,
    ]
  );

  // Render loading state
  if (state.isLoading) {
    return (
      <div
        className={cn('ep-root docx-editor docx-editor-loading', isDark && 'dark')}
        style={containerStyle}
        data-testid="docx-editor"
      >
        {loadingIndicator || <DefaultLoadingIndicator />}
      </div>
    );
  }

  // Render error state
  if (state.parseError) {
    return (
      <div
        className={cn('ep-root docx-editor docx-editor-error', isDark && 'dark')}
        style={containerStyle}
        data-testid="docx-editor"
      >
        <ParseError message={state.parseError} />
      </div>
    );
  }

  // Render placeholder when no document
  if (!docState.state) {
    return (
      <div
        className={cn('ep-root docx-editor docx-editor-empty', isDark && 'dark')}
        style={containerStyle}
        data-testid="docx-editor"
      >
        <DefaultPlaceholder />
      </div>
    );
  }

  const handleScrollContainerMouseDown = (e: React.MouseEvent) => {
    // Click in the grey gutter around the page → collapse any expanded sidebar
    // card. Clicks on the doc body already collapse via the cursor-mark
    // detector; clicks inside the sidebar are user interactions with the card.
    const target = e.target as HTMLElement;
    if (
      target.closest('.paged-editor__pages') ||
      target.closest('.docx-unified-sidebar') ||
      target.closest('.docx-comment-margin-markers')
    ) {
      return;
    }
    setExpandedSidebarItem(null);
  };

  const handleEditorBgMouseDown = (e: React.MouseEvent) => {
    // Focus editor when clicking on the background area (not the editor itself).
    // mouseDown for immediate response before focus can be lost.
    if (e.target === e.currentTarget) {
      e.preventDefault();
      pagedEditorRef.current?.focus();
    }
  };

  return (
    <DocxEditorShell
      isDark={isDark}
      containerRef={containerRef}
      scrollContainerRef={scrollContainerRef}
      editorContentRef={editorContentRef}
      containerStyle={containerStyle}
      mainContentStyle={mainContentStyle}
      editorContainerStyle={editorContainerStyle}
      showOutline={showOutline}
      minLayoutWidth={minLayoutWidth}
      toolbarHeight={toolbarHeight}
      editorScrollLeft={editorScrollLeft}
      highlightStyles={
        <ReviewHighlightStyles
          expandedSidebarItem={expandedSidebarItem}
          trackedChanges={trackedChanges}
        />
      }
      onScrollContainerMouseDown={handleScrollContainerMouseDown}
      onEditorBgMouseDown={handleEditorBgMouseDown}
      onEditorContextMenu={handleEditorContextMenu}
      outlineProps={{
        headings: outlineHeadings,
        onHeadingClick: handleHeadingInfoClick,
        onClose: () => setShowOutline(false),
        topOffset: toolbarHeight,
        scrollLeft: editorScrollLeft,
      }}
      onToggleOutline={handleToggleOutline}
      toolbar={
        !readOnlyProp ? (
          <div ref={toolbarRefCallback} className="z-50 flex flex-col gap-0 flex-shrink-0">
            <DocxToolbar
              renderTitleBarRight={renderTitleBarRight}
              editingMode={editingMode}
              onModeChange={(mode) => {
                setEditingMode(mode);
                if (mode === 'suggesting') setShowCommentsSidebar(true);
              }}
              commentsActive={showCommentsSidebar}
              onToggleComments={() => {
                setShowCommentsSidebar((v) => !v);
                setExpandedSidebarItem(null);
              }}
              canUndo={pmState ? undoDepth(pmState) > 0 : false}
              canRedo={pmState ? redoDepth(pmState) > 0 : false}
              onUndo={undoActiveEditor}
              onRedo={redoActiveEditor}
              onPrint={handleDirectPrint}
              onPageSetup={handleOpenPageSetup}
              onApplyWatermark={handleWatermarkApply}
              currentWatermark={currentWatermark}
              readOnly={readOnly}
              currentFormatting={state.selectionFormatting}
              onFormat={handleFormat}
              documentFonts={documentFonts}
              documentStyles={docState.state?.package.styles?.styles}
              onInsertTable={handleInsertTable}
              onInsertImage={handleInsertImageClick}
              onInsertPageBreak={handleInsertPageBreak}
              onInsertSectionBreakNextPage={handleInsertSectionBreakNextPage}
              onInsertSectionBreakContinuous={handleInsertSectionBreakContinuous}
              onInsertTOC={handleInsertTOC}
              tableContext={state.pmTableContext}
              onTableAction={handleTableAction}
              imageContext={state.pmImageContext}
              onImageWrapType={handleImageWrapType}
              onImageTransform={handleImageTransform}
              onOpenImageProperties={handleOpenImageProperties}
            />
          </div>
        ) : null
      }
      pagedArea={
        <ReviewProvider value={reviewContextValue}>
          <DocxEditorPagedArea
            pagedEditorRef={pagedEditorRef}
            scrollContainerRef={scrollContainerRef}
            document={docState.state}
            theme={theme}
            initialSectionProperties={initialSectionProperties}
            finalSectionProperties={finalSectionProperties}
            headerContent={headerContent}
            footerContent={footerContent}
            firstPageHeaderContent={firstPageHeaderContent}
            firstPageFooterContent={firstPageFooterContent}
            zoom={state.zoom}
            readOnly={readOnly}
            extensionManager={extensionManager}
            externalPlugins={editorPlugins}
            onDocumentChange={handleDocumentChange}
            onPagedSelectionChange={handlePagedSelectionChange}
            onReady={(ref) => {
              const view = ref.getView();
              if (view) setPmState(view.state);
            }}
            onHyperlinkClick={(data) =>
              hyperlink.openView(data.rect, {
                href: data.href,
                displayText: data.displayText,
                tooltip: data.tooltip,
              })
            }
            onOpenLink={onOpenLink}
            onContextMenu={handleContextMenu}
            onAnchorPositionsChange={setAnchorPositions}
            pageWidthPx={pageWidthPx}
            onTotalPagesChange={(totalPages) => {
              scrollPageInfoRef.current.totalPages = totalPages;
            }}
          />
        </ReviewProvider>
      }
      overlays={
        <DocxEditorOverlays
          contextMenu={contextMenu}
          contextMenuItems={contextMenuItems}
          onContextMenuAction={handleContextMenuAction}
          onContextMenuClose={handleContextMenuClose}
          imageContextMenu={imageContextMenu}
          onImageWrapApply={handleImageWrapApply}
          imageContextMenuTextActions={imageContextMenuTextActions}
          onOpenImageProperties={() =>
            handleOpenImageProperties(
              new DOMRect(imageContextMenu.position.x, imageContextMenu.position.y, 0, 0)
            )
          }
          readOnly={readOnly}
        />
      }
      dialogs={
        <DocxEditorDialogs
          findReplace={findReplace}
          hyperlink={hyperlink}
          readOnly={readOnly}
          getCaretRect={getCaretRect}
          imagePropsOpen={imagePropsOpen}
          imagePropsRect={imagePropsRect}
          onImagePropsClose={() => setImagePropsOpen(false)}
          onApplyImageProperties={handleApplyImageProperties}
          pmImageContext={state.pmImageContext}
          tablePropsOpen={tablePropsOpen}
          tablePropsRect={tablePropsRect}
          onTablePropsClose={() => setTablePropsOpen(false)}
          pmTableContext={state.pmTableContext}
          getActiveEditorView={getActiveEditorView}
          splitCellDialogState={splitCellDialogState}
          onSplitCellDialogClose={handleSplitCellDialogClose}
          onSplitCellDialogApply={handleSplitCellDialogApply}
          showPageSetup={showPageSetup}
          onPageSetupClose={() => setShowPageSetup(false)}
          onPageSetupApply={handlePageSetupApply}
          document={docState.state}
        />
      }
      fileInputs={
        <>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageFileChange}
          />
          <input
            ref={docxInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: 'none' }}
            onChange={handleDocxFileChange}
          />
        </>
      }
    />
  );
});

// ============================================================================
// EXPORTS
// ============================================================================

export default DocxEditor;
