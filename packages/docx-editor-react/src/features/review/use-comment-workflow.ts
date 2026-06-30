/**
 * The comment + tracked-change orchestration, lifted out of the DocxEditor god
 * file. Owns the sidebar-card callbacks, the cursor→card selection walker, and
 * the derived sets the renderer needs (resolved-id masks, replacement aliases).
 *
 * Two load-bearing patterns are preserved verbatim from the original inline code:
 *
 * 1. `commentCallbacksRef.current` is reassigned on EVERY render (in the hook
 *    body, not a memo/effect) so its closures always capture fresh state
 *    (`expandedSidebarItem`, `commentSelectionRange`, …). `stableCallbacks` is a
 *    `useMemo([])` wrapper with a permanently-stable identity that forwards into
 *    the ref. Sidebar cards receive the stable identity (so they don't rebuild
 *    every render) but always invoke the latest behavior. Collapsing the two
 *    layers reintroduces either stale closures or render thrash.
 * 2. Order matters: `stableCallbacks` → `useCommentSidebarItems` →
 *    `commentSidebarItems` is then read back by `handlePagedSelectionChange`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acceptChange,
  rejectChange,
  acceptChangeById,
  rejectChangeById,
} from '@eigenpal/docx-editor-core/prosemirror/commands';
import { extractSelectionState, type SelectionState } from '@eigenpal/docx-editor-core/prosemirror';
import { createComment } from '@eigenpal/docx-editor-core/prosemirror/commentOps';
import {
  PENDING_COMMENT_ID,
  type CommentIdAllocator,
} from '@eigenpal/docx-editor-core/prosemirror/commentIdAllocator';
import type { TrackedChangeEntry } from '@eigenpal/docx-editor-core/utils/comments';
import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import type { PagedEditorRef } from '../../components/editor/paged-editor';
import { useCommentSidebarItems, type CommentCallbacks } from './use-comment-sidebar-items';
import type { ReactSidebarItem } from './types';

export function useCommentWorkflow({
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
}: {
  pagedEditorRef: React.RefObject<PagedEditorRef | null>;
  author: string;
  commentIdAllocatorRef: React.RefObject<CommentIdAllocator>;
  comments: Comment[];
  setComments: React.Dispatch<React.SetStateAction<Comment[]>>;
  isAddingComment: boolean;
  commentSelectionRange: { from: number; to: number } | null;
  setCommentSelectionRange: React.Dispatch<
    React.SetStateAction<{ from: number; to: number } | null>
  >;
  addCommentYPosition: number | null;
  setAddCommentYPosition: React.Dispatch<React.SetStateAction<number | null>>;
  setIsAddingComment: React.Dispatch<React.SetStateAction<boolean>>;
  trackedChanges: TrackedChangeEntry[];
  showCommentsSidebar: boolean;
  setShowCommentsSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  handleSelectionChange: (selectionState: SelectionState | null) => void;
}) {
  const [expandedSidebarItem, setExpandedSidebarItem] = useState<string | null>(null);
  const sidebarAutoOpenedRef = useRef(false);

  // Rebuilt every render so the closures capture current state (see file docstring).
  const commentCallbacksRef = useRef<CommentCallbacks>({});
  commentCallbacksRef.current = {
    onCommentReply: (id, text) => {
      const reply = createComment(commentIdAllocatorRef.current, text, author, id);
      setComments((prev) => [...prev, reply]);
    },
    onCommentResolve: (id) => {
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, done: true } : c)));
      // Collapse the card to its checkmark marker immediately. Resolving
      // doesn't go through a PM transaction, so the cursor-based collapse
      // path wouldn't fire; do it explicitly. Cascades into the highlight
      // hide via resolvedIdsForRender.
      if (expandedSidebarItem === `comment-${id}`) {
        setExpandedSidebarItem(null);
      }
    },
    onCommentUnresolve: (id) => {
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, done: undefined } : c)));
    },
    onCommentDelete: (id) => {
      setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
      // Remove the comment mark from PM to clear the yellow highlight
      const view = pagedEditorRef.current?.getView();
      if (view) {
        const mark = view.state.schema.marks.comment?.create({ commentId: id });
        if (mark) {
          const tr = view.state.tr.removeMark(0, view.state.doc.content.size, mark);
          if (tr.docChanged) view.dispatch(tr);
        }
      }
    },
    onAddComment: (addText) => {
      const comment = createComment(commentIdAllocatorRef.current, addText, author);
      const view = pagedEditorRef.current?.getView();
      if (view && commentSelectionRange) {
        const { from, to } = commentSelectionRange;
        const pendingMark = view.state.schema.marks.comment.create({
          commentId: PENDING_COMMENT_ID,
        });
        const realMark = view.state.schema.marks.comment.create({
          commentId: comment.id,
        });
        const tr = view.state.tr.removeMark(from, to, pendingMark).addMark(from, to, realMark);
        view.dispatch(tr);
      }
      setComments((prev) => [...prev, comment]);
      setIsAddingComment(false);
      setCommentSelectionRange(null);
      setAddCommentYPosition(null);
    },
    onCancelAddComment: () => {
      const view = pagedEditorRef.current?.getView();
      if (view && commentSelectionRange) {
        const { from, to } = commentSelectionRange;
        const pendingMark = view.state.schema.marks.comment.create({
          commentId: PENDING_COMMENT_ID,
        });
        view.dispatch(view.state.tr.removeMark(from, to, pendingMark));
      }
      setIsAddingComment(false);
      setCommentSelectionRange(null);
      setAddCommentYPosition(null);
    },
    onAcceptChange: (from, to) => {
      const view = pagedEditorRef.current?.getView();
      if (view) acceptChange(from, to)(view.state, view.dispatch);
      // No explicit re-extract: the dispatch fires `handleDocumentChange`,
      // which mirrors the new PM state into `pmState` and the tracked-changes
      // memo re-derives.
    },
    onRejectChange: (from, to) => {
      const view = pagedEditorRef.current?.getView();
      if (view) rejectChange(from, to)(view.state, view.dispatch);
    },
    onAcceptChangeById: (revisionId) => {
      const view = pagedEditorRef.current?.getView();
      if (view) acceptChangeById(revisionId)(view.state, view.dispatch);
    },
    onRejectChangeById: (revisionId) => {
      const view = pagedEditorRef.current?.getView();
      if (view) rejectChangeById(revisionId)(view.state, view.dispatch);
    },
    onTrackedChangeReply: (revisionId, text) => {
      setComments((prev) => [
        ...prev,
        createComment(commentIdAllocatorRef.current, text, author, revisionId),
      ]);
    },
  };

  // Stable callbacks wrapper that delegates to ref (avoids recreating items on every render)
  const stableCallbacks = useMemo<CommentCallbacks>(
    () => ({
      onCommentReply: (...args) => commentCallbacksRef.current.onCommentReply?.(...args),
      onCommentResolve: (...args) => commentCallbacksRef.current.onCommentResolve?.(...args),
      onCommentUnresolve: (...args) => commentCallbacksRef.current.onCommentUnresolve?.(...args),
      onCommentDelete: (...args) => commentCallbacksRef.current.onCommentDelete?.(...args),
      onAddComment: (...args) => commentCallbacksRef.current.onAddComment?.(...args),
      onCancelAddComment: (...args) => commentCallbacksRef.current.onCancelAddComment?.(...args),
      onAcceptChange: (...args) => commentCallbacksRef.current.onAcceptChange?.(...args),
      onRejectChange: (...args) => commentCallbacksRef.current.onRejectChange?.(...args),
      onAcceptChangeById: (...args) => commentCallbacksRef.current.onAcceptChangeById?.(...args),
      onRejectChangeById: (...args) => commentCallbacksRef.current.onRejectChangeById?.(...args),
      onTrackedChangeReply: (...args) =>
        commentCallbacksRef.current.onTrackedChangeReply?.(...args),
    }),
    []
  );

  const commentSidebarItems = useCommentSidebarItems({
    comments,
    trackedChanges,
    callbacks: stableCallbacks,
    showResolved: showCommentsSidebar,
    isAddingComment: showCommentsSidebar ? isAddingComment : false,
    addCommentYPosition,
  });

  const allSidebarItems = useMemo(() => {
    const items: ReactSidebarItem[] = [];
    if (showCommentsSidebar) items.push(...commentSidebarItems);
    return items;
  }, [showCommentsSidebar, commentSidebarItems]);

  // Build a map from insertion revisionIds to sidebar item IDs for replacement tracked changes.
  // This allows clicking the insertion part of a replacement to activate the same sidebar card.
  const revisionIdAliases = useMemo(() => {
    const map = new Map<string, string>();
    trackedChanges.forEach((change, idx) => {
      if (change.type === 'replacement' && change.insertionRevisionId != null) {
        map.set(String(change.insertionRevisionId), `tc-${change.revisionId}-${idx}`);
      }
    });
    return map;
  }, [trackedChanges]);

  const resolvedCommentIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of comments) {
      if (c.done && c.parentId == null) ids.add(c.id);
    }
    return ids;
  }, [comments]);

  // PagedEditor onSelectionChange — runs on every selection movement.
  // Extracts the full selection state for the host callback, then walks the
  // marks at the cursor to detect comment / tracked-change marks so the
  // matching sidebar card opens. Comment marks are reported by either
  // $from.marks() or by storedMarks/nodeBefore/nodeAfter at boundaries; the
  // four sources get unioned. Resolved comments stay collapsed unless the
  // user explicitly clicks them, so the sidebar doesn't fill with old
  // threads as the cursor sweeps through commented text.
  const handlePagedSelectionChange = useCallback(() => {
    const view = pagedEditorRef.current?.getView();
    if (!view) {
      handleSelectionChange(null);
      return;
    }
    const selectionState = extractSelectionState(view.state);
    handleSelectionChange(selectionState);

    const $from = view.state.selection.$from;
    const marks = [
      ...(view.state.storedMarks ?? []),
      ...($from.nodeAfter?.marks ?? []),
      ...($from.nodeBefore?.marks ?? []),
      ...$from.marks(),
    ];
    let cursorSidebarItem: string | null = null;
    for (const mark of marks) {
      if (mark.type.name === 'comment' && mark.attrs.commentId != null) {
        const commentId = mark.attrs.commentId as number;
        if (resolvedCommentIds.has(commentId)) continue;
        cursorSidebarItem = `comment-${commentId}`;
        break;
      }
      if (
        (mark.type.name === 'insertion' || mark.type.name === 'deletion') &&
        mark.attrs.revisionId != null
      ) {
        const revId = String(mark.attrs.revisionId);
        const prefix = `tc-${revId}-`;
        let match = commentSidebarItems.find((i) => i.id.startsWith(prefix));
        // The insertion side of a replacement has a different revisionId;
        // check the alias map to find the correct sidebar card.
        if (!match && revisionIdAliases) {
          const aliasedId = revisionIdAliases.get(revId);
          if (aliasedId) {
            match = commentSidebarItems.find((i) => i.id === aliasedId);
          }
        }
        if (match) {
          cursorSidebarItem = match.id;
          break;
        }
      }
    }
    if (cursorSidebarItem) {
      setShowCommentsSidebar(true);
    }
    setExpandedSidebarItem(cursorSidebarItem);
  }, [
    handleSelectionChange,
    resolvedCommentIds,
    commentSidebarItems,
    revisionIdAliases,
    pagedEditorRef,
    setShowCommentsSidebar,
  ]);

  // Auto-open the sidebar the first time a comment or tracked-change card
  // is produced — covers the case where the user inserts an empty tracked
  // table: no cursor anchor exists yet (no inline marks at cursor), so the
  // cursor-driven open above doesn't fire. Latches via a ref so a later
  // manual close stays closed.
  useEffect(() => {
    if (sidebarAutoOpenedRef.current) return;
    if (commentSidebarItems.length === 0) return;
    sidebarAutoOpenedRef.current = true;
    setShowCommentsSidebar(true);
  }, [commentSidebarItems, setShowCommentsSidebar]);

  // Exclude expanded resolved comment from hide-set so its text gets highlighted
  const resolvedIdsForRender = useMemo(() => {
    if (!expandedSidebarItem?.startsWith('comment-')) return resolvedCommentIds;
    const expandedId = parseInt(expandedSidebarItem.slice(8), 10);
    if (isNaN(expandedId) || !resolvedCommentIds.has(expandedId)) return resolvedCommentIds;
    const ids = new Set(resolvedCommentIds);
    ids.delete(expandedId);
    return ids;
  }, [resolvedCommentIds, expandedSidebarItem]);

  return {
    allSidebarItems,
    expandedSidebarItem,
    setExpandedSidebarItem,
    resolvedCommentIds,
    resolvedIdsForRender,
    handlePagedSelectionChange,
  };
}
