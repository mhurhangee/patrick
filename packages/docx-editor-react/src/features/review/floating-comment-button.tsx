import { Button } from '@patrick/ui/components/button';
import { MessageSquarePlus } from 'lucide-react';
import type { PagedEditorRef } from '../../editor/paged-editor';
import { beginPendingComment } from './pending-comment-mark';
import { useReview } from './review-context';

/**
 * The floating "Add comment" button, anchored to a non-empty selection. It owns
 * the start of the add-comment compose workflow: mark the selection pending,
 * record the range + Y, open the sidebar, and enter adding mode. Compose state
 * comes from `ReviewContext`; only the editor ref + readOnly are passed in.
 */
export function FloatingCommentButton({
  pagedEditorRef,
  readOnly,
}: {
  pagedEditorRef: React.RefObject<PagedEditorRef | null>;
  readOnly: boolean;
}) {
  const {
    floatingCommentBtn,
    isAddingComment,
    setCommentSelectionRange,
    setAddCommentYPosition,
    setShowCommentsSidebar,
    setIsAddingComment,
    setFloatingCommentBtn,
  } = useReview();

  if (floatingCommentBtn == null || isAddingComment || readOnly) return null;

  return (
    <Button
      size="icon-sm"
      tooltip="Add comment"
      tooltipSide="bottom"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const view = pagedEditorRef.current?.getView();
        if (view) {
          const { from, to } = view.state.selection;
          if (from !== to) {
            setCommentSelectionRange({ from, to });
            beginPendingComment(view, from, to);
          }
        }
        setAddCommentYPosition(floatingCommentBtn.top);
        setShowCommentsSidebar(true);
        setIsAddingComment(true);
        setFloatingCommentBtn(null);
      }}
      className="absolute z-50 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md bg-[var(--patrick-coral)]/80 hover:bg-[var(--patrick-coral)]"
      style={{ top: floatingCommentBtn.top, left: floatingCommentBtn.left }}
    >
      <MessageSquarePlus />
    </Button>
  );
}
