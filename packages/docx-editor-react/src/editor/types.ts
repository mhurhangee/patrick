/**
 * Public types for the `DocxEditor` component — its props and its imperative
 * `DocxEditorRef` (the package's consumed contract, guarded by
 * `__tests__/ref-conformance.test-d.ts` + `exports-map.test.ts`).
 */

import type { ReactNode } from 'react';
import type { Document, Theme } from '@eigenpal/docx-editor-core/types/document';
import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import type { DocumentAgent } from '@eigenpal/docx-editor-core/agent';
import type { DocxInput, ScrollToParaIdOptions } from '@eigenpal/docx-editor-core/utils';
import type { SelectionState } from '@eigenpal/docx-editor-core/prosemirror';
import type { PagedEditorRef } from './paged-editor';

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
