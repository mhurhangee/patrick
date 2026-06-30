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
import type { CSSProperties, ReactNode } from 'react';
import type { Document, Theme } from '@eigenpal/docx-editor-core/types/document';

import { cn } from '../lib/utils';
import type { SelectionFormatting } from '../features/toolbar/types';
import type { ImageContext } from '../features/images/types';
import { useOutlineSidebar } from '../features/outline/use-outline-sidebar';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useFileIO } from '../hooks/useFileIO';
import { usePageSetupControls } from '../features/page-setup/use-page-setup-controls';
import { useWatermarkControls } from '../features/page-setup/use-watermark-controls';
import { useHyperlink } from '../features/hyperlinks/use-hyperlink';
import { useFormattingActions } from '../features/toolbar/use-formatting-actions';
import { useImageActions } from '../features/images/use-image-actions';
import { useDocxEditorRefApi } from '../hooks/useDocxEditorRefApi';
import { useTableDialogs } from '../features/tables/use-table-dialogs';
import { resolveHeaderFooter } from '@eigenpal/docx-editor-core/layout-bridge';
import { useDocumentLoader } from '../hooks/useDocumentLoader';
import { useContextMenus } from '../features/context-menu/use-context-menus';
import { useCommentManagement } from '../features/review/use-comment-management';
import { useCommentLifecycle } from '../features/review/use-comment-lifecycle';
import { useSelectionTracker } from '../hooks/useSelectionTracker';
import { useFloatingCommentBtn } from '../features/review/use-floating-comment-btn';
import { useActiveEditor } from '../hooks/useActiveEditor';
import { useScrollPageInfo } from '../hooks/useScrollPageInfo';
import { DocxEditorOverlays } from './docx-editor-overlays';
import { DocxEditorDialogs } from './docx-editor-dialogs';
import { DocxEditorToolbar } from './docx-editor-toolbar';
import { DocxEditorPagedArea } from './docx-editor-paged-area';
import { useResetEditorState } from '../hooks/useResetEditorState';
import { DocxEditorShell } from './docx-editor-shell';
import type { FontOption } from '@eigenpal/docx-editor-core/utils/fontOptions';
import { OUTLINE_BUTTON_RESERVED_SPACE, OUTLINE_RESERVED_SPACE } from '../features/outline/document-outline';
import { SIDEBAR_DOCUMENT_SHIFT } from '@eigenpal/docx-editor-core/utils/sidebarConstants';
import { useCommentWorkflow } from '../features/review/use-comment-workflow';
import { extractTrackedChanges } from '@eigenpal/docx-editor-core/prosemirror/utils/extractTrackedChanges';
import { type EditorState as PMEditorState } from 'prosemirror-state';
import type { Comment } from '@eigenpal/docx-editor-core/types/content';
// Dialog hooks and utilities (static imports — lightweight, no UI)
import { useFindReplace } from '../features/find-replace/use-find-replace';
import { DocumentAgent } from '@eigenpal/docx-editor-core/agent';
import { DefaultLoadingIndicator, DefaultPlaceholder, ParseError } from '../components/states/editor-states';
import { type DocxInput } from '@eigenpal/docx-editor-core/utils';
import type { ScrollToParaIdOptions } from '@eigenpal/docx-editor-core/utils';
import { useDocumentState } from '../hooks/useDocumentState';

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
import { type PagedEditorRef, DEFAULT_PAGE_WIDTH } from './paged-editor';


// ============================================================================
// TYPES
// ============================================================================

/**
 * DocxEditor props
 */
export interface DocxEditorProps {
  /** Document data — ArrayBuffer, Uint8Array, Blob, or File */
  documentBuffer?: DocxInput | null;
  /** Pre-parsed document (alternative to documentBuffer) */
  document?: Document | null;
  /** Author name used for comments and track changes */
  author?: string;
  /** Callback when document changes */
  onChange?: (document: Document) => void;
  /** Open an external URL (the host opens it — Tauri shell on desktop,
   *  window.open on web). Used by the hyperlink popover + read-only link clicks. */
  onOpenLink?: (href: string) => void;
  /** Color theme mode for UI styling. `'system'` follows the OS preference. */
  colorMode?: 'light' | 'dark' | 'system';
  /** Document theme schema object */
  theme?: Theme | null;
  /** Whether the editor is read-only. When true, hides toolbar and rulers */
  readOnly?: boolean;
  /** Loading indicator */
  loadingIndicator?: ReactNode;
  /**
   * Callback when print is triggered. Pass it to enable the `File > Print`
   * menu entry; omit to hide.
   */
  onPrint?: () => void;
  /** Custom right-side actions for the title bar */
  renderTitleBarRight?: () => ReactNode;
}

/**
 * DocxEditor ref interface
 */
export interface DocxEditorRef {
  /** Get the DocumentAgent for programmatic access */
  getAgent: () => DocumentAgent | null;
  /** Get the current document */
  getDocument: () => Document | null;
  /** Get the editor ref */
  getEditorRef: () => PagedEditorRef | null;
  /** Save the document to buffer. Pass { selective: false } to force full repack. */
  save: (options?: { selective?: boolean }) => Promise<ArrayBuffer | null>;
  /** Set zoom level */
  setZoom: (zoom: number) => void;
  /** Open the find/replace bar (e.g. from an app-level search button). */
  openFind: () => void;
  /** Get current page number */
  getCurrentPage: () => number;
  /** Get total page count */
  getTotalPages: () => number;
  /**
   * Scroll the paginated view so the given page is in view.
   * Page numbers are 1-indexed (matches `getCurrentPage` / `getTotalPages`).
   * No-op for out-of-range or non-integer values.
   * @example ref.current?.scrollToPage(2)
   */
  scrollToPage: (pageNumber: number) => void;
  /**
   * Scroll the paginated view to the paragraph with the given Word `w14:paraId`.
   * Pass `options.highlight` to briefly flash it in a custom color.
   * @returns whether a matching paragraph exists in the ProseMirror document
   * @example ref.current?.scrollToParaId('1A2B3C4D', { highlight: { color: 'rgba(255, 235, 59, 0.55)' } })
   */
  scrollToParaId: (paraId: string, options?: ScrollToParaIdOptions) => boolean;
  /**
   * Scroll the paginated view to a specific ProseMirror document position.
   * Use this when you have a raw PM offset; for Word `w14:paraId` use
   * `scrollToParaId` instead.
   * @example ref.current?.scrollToPosition(42)
   */
  scrollToPosition: (pmPos: number) => void;
  /**
   * Scroll the paginated view to the comment with the given id and select its
   * anchored range so the selection overlay highlights it. Resolves the id
   * against the live comment marks at call time.
   * @returns `false` when the id no longer resolves (the comment was deleted
   *   or its anchored text removed between render and click), so the caller
   *   can surface a "location no longer exists" affordance rather than
   *   silently no-op'ing.
   * @example ref.current?.scrollToCommentId(3)
   */
  scrollToCommentId: (commentId: number) => boolean;
  /**
   * Scroll the paginated view to the tracked change with the given Word
   * revision `w:id` and select its range so the selection overlay highlights
   * it. Resolves the id against the live tracked-change marks at call time
   * (matching coalesced revisions the way the changes sidebar does).
   * @returns `false` when the id no longer resolves (the change was
   *   accepted, rejected, or deleted between render and click).
   * @example ref.current?.scrollToChangeId(42)
   */
  scrollToChangeId: (revisionId: number) => boolean;
  /**
   * Select the ProseMirror position range `[from, to]` so the selection
   * overlay highlights it, and scroll its start into view. The selection
   * persists until it next changes (there is no auto-clearing flash). No-op
   * for a malformed range or a `from` past the document end; `to` is clamped
   * to the document size.
   * @example ref.current?.highlightRange(10, 24)
   */
  highlightRange: (from: number, to: number) => void;
  /** Add a comment programmatically. Anchored by Word `w14:paraId` so
   * it survives unrelated edits. Returns the comment ID, or null if
   * the paraId is unknown or the search text isn't found / is ambiguous. */
  addComment: (options: {
    paraId: string;
    text: string;
    author: string;
    /** Optional: anchor to a specific phrase within the paragraph (must be unique). */
    search?: string;
  }) => number | null;
  /** Reply to an existing comment. Returns the reply comment ID. */
  replyToComment: (commentId: number, text: string, author: string) => number | null;
  /** Resolve (mark as done) a comment. */
  resolveComment: (commentId: number) => void;
  /** Suggest a tracked change. Pass `replaceWith: ''` to delete the matched text;
   * pass `search: ''` to insert at paragraph end. Returns false on missing paraId,
   * missing/ambiguous search, or attempt to layer on an existing tracked change. */
  proposeChange: (options: {
    paraId: string;
    search: string;
    replaceWith: string;
    author: string;
  }) => boolean;
  /** Locate every paragraph containing `query` (case-insensitive substring).
   * Returns a stable handle (paraId + the matched phrase) the agent can pass
   * back to `addComment` / `proposeChange`. */
  findInDocument: (
    query: string,
    options?: { caseSensitive?: boolean; limit?: number }
  ) => Array<{ paraId: string; match: string; before: string; after: string }>;
  /**
   * Apply character formatting (bold / italic / color / size / font / etc.)
   * to a paragraph or to a unique phrase within it. This is a direct edit,
   * not a tracked change. Returns false on missing paraId or ambiguous search.
   */
  applyFormatting: (options: {
    paraId: string;
    search?: string;
    marks: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean | { style?: string };
      strike?: boolean;
      color?: { rgb?: string; themeColor?: string };
      highlight?: string;
      fontSize?: number;
      fontFamily?: { ascii?: string; hAnsi?: string };
    };
  }) => boolean;
  /**
   * Apply a paragraph style by styleId (e.g. `'Heading1'`, `'Quote'`).
   * Direct edit, not a tracked change. Returns false if paraId is unknown.
   */
  setParagraphStyle: (options: { paraId: string; styleId: string }) => boolean;
  /**
   * Insert a page or section break after the paragraph identified by `paraId`.
   * `'page'` adds a page break; `'sectionNextPage'` / `'sectionContinuous'`
   * start a new section on a new page / the same page. Direct edit, not a
   * tracked change. Returns false if paraId is unknown.
   */
  insertBreak: (options: {
    paraId: string;
    type: 'page' | 'sectionNextPage' | 'sectionContinuous';
  }) => boolean;
  /**
   * Read the contents of a single page. 1-indexed; returns null if the page
   * does not exist. Each paragraph is returned with its stable paraId so the
   * agent can comment on or modify it without an extra round-trip.
   */
  getPageContent: (pageNumber: number) => {
    pageNumber: number;
    text: string;
    paragraphs: Array<{ paraId: string; text: string; styleId?: string }>;
  } | null;
  /** Read the user's current cursor / selection — what's highlighted right now. */
  getSelectionInfo: () => {
    paraId: string | null;
    selectedText: string;
    paragraphText: string;
    before: string;
    after: string;
  } | null;
  /** Get all comments. */
  getComments: () => Comment[];
  /** Subscribe to document changes. Fires after every committed edit. Returns unsubscribe. */
  onContentChange: (listener: (document: Document) => void) => () => void;
  /** Subscribe to selection changes (cursor moves / selection changes). Returns unsubscribe. */
  onSelectionChange: (listener: (selection: SelectionState | null) => void) => () => void;
}

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

export type { EditorMode } from './internals/editing-modes';
import type { EditorMode } from './internals/editing-modes';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// `injectReplyRangeMarkers` + `injectTCReplyRangeMarkers` live in
// `@eigenpal/docx-editor-core/docx` (pre-serialization range-marker injection).

import { getInitialSectionProperties } from './internals/pmAnchors';
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

  const initialSectionProperties = useMemo(
    () => getInitialSectionProperties(docState.state),
    [docState.state]
  );
  const finalSectionProperties = docState.state?.package.document?.finalSectionProperties;

  // Header/footer content for the painter. Render-only: the painter reads it
  // straight from the document model; the content round-trips untouched on save.
  const {
    header: headerContent,
    footer: footerContent,
    firstHeader: firstPageHeaderContent,
    firstFooter: firstPageFooterContent,
  } = useMemo(
    () => resolveHeaderFooter(docState.state ?? null, finalSectionProperties ?? initialSectionProperties),
    [docState.state, initialSectionProperties, finalSectionProperties]
  );

  // Container styles - using overflow: auto so sticky toolbar works
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    backgroundColor: 'var(--doc-bg)',
  };

  const mainContentStyle: CSSProperties = {
    display: 'flex',
    flex: 1,
    minHeight: 0, // Allow flex item to shrink below content size
    minWidth: 0, // Allow flex item to shrink below content width on narrow viewports
    flexDirection: 'row',
  };

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
  // Reserve 2× the left-edge allowance so the centered page clears whatever
  // outline UI is showing, without forcing a shift on wide viewports.
  const outlineLeftAllowance = showOutline ? OUTLINE_RESERVED_SPACE : OUTLINE_BUTTON_RESERVED_SPACE;
  // Reserve against the WIDEST page in the doc, not the portrait default: pages
  // center via `alignItems:center`, so a landscape section (wider than
  // DEFAULT_PAGE_WIDTH) gets a smaller side margin and, with the old default,
  // slid left under the outline toggle/panel. Taking the max across all section
  // widths also covers mixed-orientation docs.
  const docBody = docState.state?.package?.document;
  const sectionPageWidths = [
    docBody?.finalSectionProperties?.pageWidth,
    ...(docBody?.sections?.map((s) => s.properties?.pageWidth) ?? []),
  ].filter((w): w is number => typeof w === 'number' && w > 0);
  const maxPageWidthPx = sectionPageWidths.length
    ? Math.round(Math.max(...sectionPageWidths) / 15)
    : DEFAULT_PAGE_WIDTH;

  const minLayoutWidth =
    2 * outlineLeftAllowance + maxPageWidthPx + (sidebarOpen ? SIDEBAR_DOCUMENT_SHIFT * 2 : 0);

  // pageWidthPx — the final section's width — positions the sidebar / comment
  // margin markers against the page most content lives under.
  const sectionPropsPageWidth = docBody?.finalSectionProperties?.pageWidth;
  const pageWidthPx = sectionPropsPageWidth
    ? Math.round(sectionPropsPageWidth / 15)
    : DEFAULT_PAGE_WIDTH;


  const editorContainerStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    minWidth: 0, // Allow flex item to shrink below content width on narrow viewports
    overflow: 'auto', // Sole scroll container — PagedEditor sizes to content
    position: 'relative',
    overflowAnchor: 'none',
  };

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
      expandedSidebarItem={expandedSidebarItem}
      trackedChanges={trackedChanges}
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
          <DocxEditorToolbar
            toolbarRefCallback={toolbarRefCallback}
            document={docState.state}
            pmState={pmState}
            selectionFormatting={state.selectionFormatting}
            tableContext={state.pmTableContext}
            imageContext={state.pmImageContext}
            readOnly={readOnly}
            editingMode={editingMode}
            setEditingMode={setEditingMode}
            setShowCommentsSidebar={setShowCommentsSidebar}
            setExpandedSidebarItem={setExpandedSidebarItem}
            showCommentsSidebar={showCommentsSidebar}
            renderTitleBarRight={renderTitleBarRight}
            documentFonts={documentFonts}
            onFormat={handleFormat}
            onUndo={undoActiveEditor}
            onRedo={redoActiveEditor}
            onPrint={handleDirectPrint}
            onInsertTable={handleInsertTable}
            onInsertImage={handleInsertImageClick}
            onInsertPageBreak={handleInsertPageBreak}
            onInsertSectionBreakNextPage={handleInsertSectionBreakNextPage}
            onInsertSectionBreakContinuous={handleInsertSectionBreakContinuous}
            onInsertTOC={handleInsertTOC}
            onImageWrapType={handleImageWrapType}
            onImageTransform={handleImageTransform}
            onOpenImageProperties={handleOpenImageProperties}
            onPageSetup={handleOpenPageSetup}
            onApplyWatermark={handleWatermarkApply}
            currentWatermark={currentWatermark}
            onTableAction={handleTableAction}
          />
        ) : null
      }
      pagedArea={
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
          sidebarOpen={sidebarOpen}
          sidebarItems={allSidebarItems}
          anchorPositions={anchorPositions}
          onAnchorPositionsChange={setAnchorPositions}
          pageWidthPx={pageWidthPx}
          expandedSidebarItem={expandedSidebarItem}
          setExpandedSidebarItem={setExpandedSidebarItem}
          comments={comments}
          resolvedCommentIds={resolvedCommentIds}
          resolvedIdsForRender={resolvedIdsForRender}
          setShowCommentsSidebar={setShowCommentsSidebar}
          onTotalPagesChange={(totalPages) => {
            scrollPageInfoRef.current.totalPages = totalPages;
          }}
          floatingCommentBtn={floatingCommentBtn}
          isAddingComment={isAddingComment}
          setCommentSelectionRange={setCommentSelectionRange}
          setAddCommentYPosition={setAddCommentYPosition}
          setIsAddingComment={setIsAddingComment}
          setFloatingCommentBtn={setFloatingCommentBtn}
        />
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
