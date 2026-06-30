/**
 * The pending-comment-mark lifecycle. While the user composes a comment, its
 * range is previewed with a sentinel `comment` mark (`PENDING_COMMENT_ID`);
 * committing swaps it for the real comment id, cancelling removes it.
 *
 * Orphan cleanup deliberately skips `PENDING_COMMENT_ID`, so a pending mark that
 * never gets committed/cancelled would leak — keep begin/commit/cancel paired.
 */

import type { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { PENDING_COMMENT_ID } from '@eigenpal/docx-editor-core/prosemirror/commentIdAllocator';

function pendingMark(view: EditorView) {
  return view.state.schema.marks.comment.create({ commentId: PENDING_COMMENT_ID });
}

/**
 * Apply the pending mark to [from, to] and collapse the cursor to `to`, so the
 * range stays highlighted while the compose card is open.
 */
export function beginPendingComment(view: EditorView, from: number, to: number): void {
  const tr = view.state.tr.addMark(from, to, pendingMark(view));
  tr.setSelection(TextSelection.create(tr.doc, to));
  view.dispatch(tr);
}

/** Swap the pending mark on [from, to] for the real comment id (compose committed). */
export function commitPendingComment(
  view: EditorView,
  from: number,
  to: number,
  commentId: number
): void {
  const realMark = view.state.schema.marks.comment.create({ commentId });
  view.dispatch(view.state.tr.removeMark(from, to, pendingMark(view)).addMark(from, to, realMark));
}

/** Remove the pending mark from [from, to] (compose cancelled). */
export function cancelPendingComment(view: EditorView, from: number, to: number): void {
  view.dispatch(view.state.tr.removeMark(from, to, pendingMark(view)));
}
