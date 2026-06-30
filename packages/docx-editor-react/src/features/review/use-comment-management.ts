import { useCallback, useEffect, useRef, useState } from 'react';
import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import type { PagedEditorRef } from '../../components/editor/paged-editor';
import { PENDING_COMMENT_ID } from '@eigenpal/docx-editor-core/prosemirror/commentIdAllocator';

interface FloatingCommentBtn {
  top: number;
  left: number;
}

/**
 * Owns the comment-management surface: the `comments` array, the new-comment
 * workflow state (range, Y-position anchor, `isAddingComment` flag), the
 * floating add-comment button position, the synchronous `commentsRef` mirror,
 * and the orphaned-comments debouncer.
 */
export function useCommentManagement({
  pagedEditorRef,
}: {
  pagedEditorRef: React.RefObject<PagedEditorRef | null>;
}) {
  const [comments, setInternalComments] = useState<Comment[]>([]);

  const [isAddingComment, setIsAddingComment] = useState(false);
  const [commentSelectionRange, setCommentSelectionRange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [addCommentYPosition, setAddCommentYPosition] = useState<number | null>(null);
  const [floatingCommentBtn, setFloatingCommentBtn] = useState<FloatingCommentBtn | null>(null);

  // Synchronous mirrors used by stable callbacks. Assigned on every render so
  // the latest value is always visible from the callbacks that read `.current`.
  const cleanOrphanedCommentsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  const isAddingCommentRef = useRef(isAddingComment);
  isAddingCommentRef.current = isAddingComment;

  // Unified setter that resolves the new value and mutates internal state.
  // Reads through `commentsRef.current` for the functional-update branch so the
  // callback stays stable across renders.
  const setComments = useCallback((next: React.SetStateAction<Comment[]>) => {
    const resolved =
      typeof next === 'function'
        ? (next as (prev: Comment[]) => Comment[])(commentsRef.current)
        : next;
    if (resolved === commentsRef.current) return;
    commentsRef.current = resolved;
    setInternalComments(resolved);
  }, []);

  // Remove comments whose marks no longer exist in the document. Called
  // debounced from the document-change handler so the user doesn't see
  // comments vanish mid-edit.
  const cleanOrphanedComments = useCallback(() => {
    if (isAddingCommentRef.current) return;
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    const { doc, schema } = view.state;
    const commentMarkType = schema.marks.comment;
    if (!commentMarkType) return;

    const liveIds = new Set<number>();
    doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type === commentMarkType) {
          const id = mark.attrs.commentId as number;
          if (id !== PENDING_COMMENT_ID) liveIds.add(id);
        }
      }
    });

    const currentComments = commentsRef.current;
    const orphanedIds = new Set<number>();
    for (const c of currentComments) {
      if (c.parentId == null && !liveIds.has(c.id)) {
        orphanedIds.add(c.id);
      }
    }
    if (orphanedIds.size === 0) return;

    setComments((prev) =>
      prev.filter((c) => !orphanedIds.has(c.id) && !orphanedIds.has(c.parentId!))
    );
  }, [pagedEditorRef, setComments]);

  // Unmount cleanup for the orphan-cleanup debouncer.
  useEffect(() => {
    return () => {
      if (cleanOrphanedCommentsTimerRef.current) {
        clearTimeout(cleanOrphanedCommentsTimerRef.current);
      }
    };
  }, []);

  return {
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
  };
}
