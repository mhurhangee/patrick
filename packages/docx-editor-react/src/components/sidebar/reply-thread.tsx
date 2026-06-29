import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import { formatDate, getCommentText } from '@eigenpal/docx-editor-core/utils/comments';
import { MessageSquare } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { AuthorAvatar } from './author-avatar';

export interface ReplyThreadProps {
  replies: Comment[];
  isExpanded: boolean;
}

/**
 * Replies under a comment/change. Collapsed shows just a compact count (so a
 * threaded card stays within its anchor slot); expanded shows the full thread.
 */
export function ReplyThread({ replies, isExpanded }: ReplyThreadProps) {
  const { t } = useTranslation();
  if (replies.length === 0) return null;

  if (!isExpanded) {
    return (
      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <MessageSquare className="size-3" />
        {replies.length}
      </div>
    );
  }

  return (
    <div className="mt-2">
      {replies.map((reply) => (
        <div key={reply.id} className="mb-2 border-border border-t pt-2">
          <div className="flex items-start gap-2.5">
            <AuthorAvatar name={reply.author || 'U'} className="size-6" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground">
                {reply.author || t('comments.unknown')}
              </div>
              <div className="text-[11px] text-muted-foreground">{formatDate(reply.date)}</div>
            </div>
          </div>
          <div className="mt-1 text-[13px] leading-5 text-foreground">
            {getCommentText(reply.content)}
          </div>
        </div>
      ))}
    </div>
  );
}
