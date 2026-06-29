/**
 * CommentMarginMarkers — small icons at the page right edge
 *
 * Active comments: speech bubble when sidebar closed
 * Resolved comments: speech bubble + check, always visible
 * Clicking opens sidebar / toggles resolved popup
 */

import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import { MessageCircle, MessageCircleCheck } from 'lucide-react';
import { useTranslation } from '../../i18n';

export interface CommentMarginMarkersProps {
  comments: Comment[];
  anchorPositions: Map<string, number>;
  zoom: number;
  pageWidth: number;
  sidebarOpen: boolean;
  resolvedCommentIds: Set<number>;
  onMarkerClick: (commentId: number) => void;
}

export function CommentMarginMarkers({
  comments,
  anchorPositions,
  zoom,
  pageWidth,
  sidebarOpen,
  resolvedCommentIds,
  onMarkerClick,
}: CommentMarginMarkersProps) {
  const { t } = useTranslation();
  const rootComments = comments.filter((c) => c.parentId == null);

  const markers = rootComments
    .map((comment) => {
      const isResolved = resolvedCommentIds.has(comment.id);
      // Active: hide when sidebar is open (card visible in sidebar)
      if (!isResolved && sidebarOpen) return null;
      // Resolved: hide when sidebar is open (expanded resolved card visible in sidebar)
      if (isResolved && sidebarOpen) return null;
      const y = anchorPositions.get(`comment-${comment.id}`);
      if (y == null) return null;
      return { comment, isResolved, y };
    })
    .filter(Boolean) as { comment: Comment; isResolved: boolean; y: number }[];

  if (markers.length === 0) return null;

  return (
    <div
      className="docx-comment-margin-markers"
      style={{
        position: 'absolute',
        top: 0,
        // Position just past the page right edge
        left: `calc(50% + ${(pageWidth * zoom) / 2 + 6}px)`,
        zIndex: 30,
        pointerEvents: 'none',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {markers.map(({ comment, isResolved, y }) => (
        <button
          key={comment.id}
          type="button"
          onClick={() => onMarkerClick(comment.id)}
          title={isResolved ? t('commentMarkers.resolvedComment') : t('commentMarkers.comment')}
          className="absolute left-0 flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:opacity-70"
          style={{ top: y * zoom, pointerEvents: 'auto' }}
        >
          {isResolved ? (
            <MessageCircleCheck className="size-[18px]" />
          ) : (
            <MessageCircle className="size-[18px]" />
          )}
        </button>
      ))}
    </div>
  );
}
