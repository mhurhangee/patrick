import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import { MessageCircleCheck } from 'lucide-react';
import type { SidebarItemRenderProps } from '../../types/sidebar';

export interface ResolvedCommentMarkerProps extends SidebarItemRenderProps {
  comment: Comment;
}

/** The collapsed dot for a resolved comment — click to expand the full card. */
export function ResolvedCommentMarker({
  comment,
  measureRef,
  onToggleExpand,
}: ResolvedCommentMarkerProps) {
  return (
    <div
      ref={measureRef}
      data-comment-id={comment.id}
      data-comment-resolved="true"
      onClick={onToggleExpand}
      onMouseDown={(e) => e.stopPropagation()}
      className="inline-flex cursor-pointer items-center p-0.5 text-muted-foreground transition-opacity hover:opacity-70"
    >
      <MessageCircleCheck className="size-5" />
    </div>
  );
}
