import { useImperativeHandle } from 'react';
import type { Document } from '@eigenpal/docx-editor-core/types/document';
import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import { DocumentAgent } from '@eigenpal/docx-editor-core/agent';
import {
  createStyleResolver,
  type SelectionState,
} from '@eigenpal/docx-editor-core/prosemirror';
import {
  findInDocument as findInDocumentCore,
  getSelectionInfo as getSelectionInfoCore,
  getPageContent as getPageContentCore,
} from '@eigenpal/docx-editor-core/prosemirror/queries';
import {
  applyFormatting,
  setParagraphStyle,
  insertBreak,
} from '@eigenpal/docx-editor-core/prosemirror/applyFormatting';
import type { ScrollToParaIdOptions } from '@eigenpal/docx-editor-core/utils';
import { getCachedNumberingMap } from '@eigenpal/docx-editor-core/docx';
import type { DocxEditorRef } from '../components/editor/docx-editor';
import type { PagedEditorRef } from '../components/editor/paged-editor';
import {
  addCommentToRange,
  applyProposedChange,
  createComment,
} from '@eigenpal/docx-editor-core/prosemirror/commentOps';
import type { CommentIdAllocator } from '@eigenpal/docx-editor-core/prosemirror/commentIdAllocator';

/**
 * Owns the `useImperativeHandle` that exposes the public `DocxEditorRef`
 * surface to consumers. Hand-rolled so the dep array stays explicit (the ref
 * identity only changes when one of its captured values does).
 */
export function useDocxEditorRefApi({
  ref,
  agentRef,
  document,
  docStateRef,
  pagedEditorRef,
  handleSave,
  setZoom,
  openFind,
  scrollPageInfoRef,
  comments,
  setComments,
  setShowCommentsSidebar,
  contentChangeSubscribersRef,
  selectionChangeSubscribersRef,
  getCachedStyleResolver,
  commentIdAllocator,
}: {
  ref: React.ForwardedRef<DocxEditorRef>;
  agentRef: React.RefObject<DocumentAgent | null>;
  document: Document | null;
  docStateRef: React.RefObject<Document | null>;
  pagedEditorRef: React.RefObject<PagedEditorRef | null>;
  handleSave: (options?: { selective?: boolean }) => Promise<ArrayBuffer | null>;
  setZoom: (zoom: number) => void;
  openFind: () => void;
  scrollPageInfoRef: React.RefObject<{ currentPage: number; totalPages: number }>;
  comments: Comment[];
  setComments: React.Dispatch<React.SetStateAction<Comment[]>>;
  setShowCommentsSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  contentChangeSubscribersRef: React.RefObject<Set<(doc: Document) => void>>;
  selectionChangeSubscribersRef: React.RefObject<Set<(state: SelectionState | null) => void>>;
  getCachedStyleResolver: (
    styles: Parameters<typeof createStyleResolver>[0]
  ) => ReturnType<typeof createStyleResolver>;
  commentIdAllocator: CommentIdAllocator;
}) {
  useImperativeHandle(
    ref,
    () => ({
      getAgent: () => agentRef.current,
      getDocument: () => document,
      getEditorRef: () => pagedEditorRef.current,
      save: handleSave,
      setZoom,
      openFind,
      getCurrentPage: () => scrollPageInfoRef.current.currentPage,
      getTotalPages: () => scrollPageInfoRef.current.totalPages,
      scrollToPage: (pageNumber: number) => {
        pagedEditorRef.current?.scrollToPage(pageNumber);
      },
      scrollToPosition: (pmPos: number) => {
        pagedEditorRef.current?.scrollToPosition(pmPos);
      },
      addComment: (options) => {
        const view = pagedEditorRef.current?.getView();
        if (!view) return null;
        const comment = addCommentToRange(view, options, commentIdAllocator);
        if (!comment) return null;
        setComments((prev) => [...prev, comment]);
        setShowCommentsSidebar(true);
        return comment.id;
      },

      replyToComment: (commentId, text, authorName) => {
        if (!comments.some((c) => c.id === commentId)) return null;
        const reply = createComment(commentIdAllocator, text, authorName, commentId);
        setComments((prev) => [...prev, reply]);
        return reply.id;
      },

      resolveComment: (commentId) => {
        setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, done: true } : c)));
      },

      proposeChange: (options) => {
        const view = pagedEditorRef.current?.getView();
        if (!view) return false;
        const ok = applyProposedChange(view, options, commentIdAllocator);
        if (ok) setShowCommentsSidebar(true);
        return ok;
      },

      applyFormatting: (options) => {
        const view = pagedEditorRef.current?.getView();
        if (!view) return false;
        return applyFormatting(view, options);
      },

      setParagraphStyle: (options) => {
        const view = pagedEditorRef.current?.getView();
        if (!view) return false;
        const currentDoc = docStateRef.current;
        const styleResolver = currentDoc?.package?.styles
          ? getCachedStyleResolver(currentDoc.package.styles)
          : null;
        const numbering = currentDoc?.package?.numbering
          ? getCachedNumberingMap(currentDoc.package.numbering)
          : null;
        return setParagraphStyle(view, options, { styleResolver, numbering });
      },

      insertBreak: (options) => {
        const view = pagedEditorRef.current?.getView();
        if (!view) return false;
        return insertBreak(view, options);
      },

      getPageContent: (pageNumber) =>
        getPageContentCore(
          pagedEditorRef.current?.getView() ?? null,
          pagedEditorRef.current?.getLayout() ?? null,
          pageNumber
        ),

      scrollToParaId: (paraId: string, options?: ScrollToParaIdOptions) =>
        pagedEditorRef.current?.scrollToParaId(paraId, options) ?? false,

      scrollToCommentId: (commentId) =>
        pagedEditorRef.current?.scrollToCommentId(commentId) ?? false,

      scrollToChangeId: (revisionId) =>
        pagedEditorRef.current?.scrollToChangeId(revisionId) ?? false,

      highlightRange: (from, to) => {
        pagedEditorRef.current?.highlightRange(from, to);
      },

      findInDocument: (query, opts) =>
        findInDocumentCore(pagedEditorRef.current?.getView() ?? null, query, opts),

      getSelectionInfo: () => getSelectionInfoCore(pagedEditorRef.current?.getView() ?? null),

      getComments: () => comments,

      onContentChange: (listener) => {
        contentChangeSubscribersRef.current.add(listener);
        return () => {
          contentChangeSubscribersRef.current.delete(listener);
        };
      },

      onSelectionChange: (listener) => {
        selectionChangeSubscribersRef.current.add(listener);
        return () => {
          selectionChangeSubscribersRef.current.delete(listener);
        };
      },
    }),
    // Ref identity changes only when one of these captured values does.
    [document, handleSave, comments]
  );
}
