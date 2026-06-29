import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import { formatDate, getCommentText } from '@eigenpal/docx-editor-core/utils/comments';
import { cn } from '@patrick/ui/lib/utils';
import { useTranslation } from '../../i18n';
import { AuthorAvatar } from './author-avatar';

export interface ReplyThreadProps {
  replies: Comment[];
  isExpanded: boolean;
}

/** Replies under a comment/change — all when expanded, just the latest when collapsed. */
export function ReplyThread({ replies, isExpanded }: ReplyThreadProps) {
  const { t } = useTranslation();
  if (replies.length === 0) return null;
  const visibleReplies = isExpanded ? replies : replies.slice(-1);
  const hiddenCount = isExpanded ? 0 : replies.length - 1;

  return (
    <div className="mt-2">
      {hiddenCount > 0 && (
        <div className="border-border border-t py-1.5 text-xs font-medium text-primary">
          {t('comments.replyCount', { count: hiddenCount })}
        </div>
      )}
      {visibleReplies.map((reply) => (
        <div
          key={reply.id}
          className={cn('border-border border-t pt-2', isExpanded && 'mb-2')}
        >
          <div className="flex items-start gap-2.5">
            <AuthorAvatar name={reply.author || 'U'} className="size-6" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground">
                {reply.author || t('comments.unknown')}
              </div>
              <div className="text-[11px] text-muted-foreground">{formatDate(reply.date)}</div>
            </div>
          </div>
          <div
            className={cn(
              'mt-1 text-[13px] leading-5 text-foreground',
              !isExpanded && 'line-clamp-2'
            )}
          >
            {getCommentText(reply.content)}
          </div>
        </div>
      ))}
    </div>
  );
}
