import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import { formatDate, getCommentText } from '@eigenpal/docx-editor-core/utils/comments';
import { Button } from '@patrick/ui/components/button';
import { cn } from '@patrick/ui/lib/utils';
import { Check, Trash2, Undo2 } from 'lucide-react';
import type { SidebarItemRenderProps } from '../../plugin-api/types';
import { useTranslation } from '../../i18n';
import { AuthorAvatar } from './author-avatar';
import { collapsedClamp } from './collapsed-clamp';
import { ReplyInput } from './reply-input';
import { ReplyThread } from './reply-thread';

export interface CommentCardProps extends SidebarItemRenderProps {
  comment: Comment;
  replies: Comment[];
  onReply?: (commentId: number, text: string) => void;
  onResolve?: (commentId: number) => void;
  onUnresolve?: (commentId: number) => void;
  onDelete?: (commentId: number) => void;
}

export function CommentCard({
  comment,
  replies,
  isExpanded,
  onToggleExpand,
  measureRef,
  availableHeight,
  onReply,
  onResolve,
  onUnresolve,
  onDelete,
}: CommentCardProps) {
  const { t } = useTranslation();

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the whole card is a click target to expand/collapse
    <div
      ref={measureRef}
      data-comment-id={comment.id}
      onClick={onToggleExpand}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        'cursor-pointer rounded-lg border px-2.5 py-2 font-sans text-sm transition-colors',
        isExpanded ? 'border-border bg-card shadow-sm' : 'border-transparent hover:bg-muted/40'
      )}
    >
      <div className="flex gap-2.5">
        <AuthorAvatar name={comment.author || 'U'} className="size-6 text-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div
              className="min-w-0 flex-1 text-[13px] leading-snug text-foreground"
              style={isExpanded ? undefined : collapsedClamp(availableHeight)}
            >
              {getCommentText(comment.content)}
            </div>
            {isExpanded && (
              // biome-ignore lint/a11y/noStaticElementInteractions: stops the action cluster from toggling the card
              <div className="-mt-1 -mr-1 flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  tooltip={comment.done ? t('comments.reopen') : t('comments.resolve')}
                  onClick={() => (comment.done ? onUnresolve?.(comment.id) : onResolve?.(comment.id))}
                >
                  {comment.done ? <Undo2 /> : <Check />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  tooltip={t('common.delete')}
                  onClick={() => onDelete?.(comment.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>
          {isExpanded && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/70">
                {comment.author || t('comments.unknown')}
              </span>
              <span>·</span>
              <span>{formatDate(comment.date)}</span>
              {comment.done && (
                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3" />
                  {t('comments.resolved')}
                </span>
              )}
            </div>
          )}

          <ReplyThread replies={replies} isExpanded={isExpanded} />

          {isExpanded && !comment.done && (
            <ReplyInput onSubmit={(text) => onReply?.(comment.id, text)} />
          )}
        </div>
      </div>
    </div>
  );
}
