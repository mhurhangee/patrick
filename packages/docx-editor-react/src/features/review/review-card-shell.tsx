import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import { formatDate } from '@eigenpal/docx-editor-core/utils/comments';
import { cn } from '@patrick/ui/lib/utils';
import type { ReactNode } from 'react';
import { AuthorAvatar } from './author-avatar';
import { collapsedClamp } from './collapsed-clamp';
import { ReplyThread } from './reply-thread';

/** Height reserved under the body for the collapsed reply-count row. */
const REPLY_ROW_PX = 22;

export interface ReviewCardShellProps {
  /** Author name — drives the avatar and the expanded meta line. */
  author: string;
  /** ISO date for the meta line (omitted when absent). */
  date?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  measureRef: (el: HTMLDivElement | null) => void;
  availableHeight?: number;
  /** Summary line — clamped to fit the slot when collapsed. */
  body: ReactNode;
  /** Action buttons, shown top-right when expanded. */
  actions?: ReactNode;
  /** Extra content appended to the expanded meta line (e.g. a resolved pill). */
  metaExtra?: ReactNode;
  replies: Comment[];
  /** Composer shown when expanded (omit to hide). */
  replyInput?: ReactNode;
  /** Set on the root (used to locate a comment's card from the document). */
  dataCommentId?: number;
}

/**
 * Shared chrome for the comment and tracked-change cards: avatar + a
 * content-first body, identity demoted to a muted meta line shown only when
 * expanded, the reply thread, and a composer. The cards supply their own body,
 * actions, and meta extras.
 */
export function ReviewCardShell({
  author,
  date,
  isExpanded,
  onToggleExpand,
  measureRef,
  availableHeight,
  body,
  actions,
  metaExtra,
  replies,
  replyInput,
  dataCommentId,
}: ReviewCardShellProps) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the whole card is a click target to expand/collapse
    <div
      ref={measureRef}
      data-comment-id={dataCommentId}
      onClick={onToggleExpand}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        'cursor-pointer rounded-lg border px-2.5 py-2 font-sans text-sm transition-colors',
        isExpanded ? 'border-border bg-card shadow-sm' : 'border-transparent hover:bg-muted/40'
      )}
    >
      <div className="flex gap-2.5">
        <AuthorAvatar name={author} className="size-6 text-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div
              className="min-w-0 flex-1 text-[13px] leading-snug text-foreground"
              style={
                isExpanded
                  ? undefined
                  : collapsedClamp(availableHeight, replies.length > 0 ? REPLY_ROW_PX : 0)
              }
            >
              {body}
            </div>
            {isExpanded && actions && (
              // biome-ignore lint/a11y/noStaticElementInteractions: stops the action cluster from toggling the card
              <div className="-mt-1 -mr-1 flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
                {actions}
              </div>
            )}
          </div>
          {isExpanded && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/70">{author}</span>
              {date && (
                <>
                  <span>·</span>
                  <span>{formatDate(date)}</span>
                </>
              )}
              {metaExtra}
            </div>
          )}

          <ReplyThread replies={replies} isExpanded={isExpanded} />

          {isExpanded && replyInput}
        </div>
      </div>
    </div>
  );
}
