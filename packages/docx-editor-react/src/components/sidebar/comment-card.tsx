import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import { getCommentText } from '@eigenpal/docx-editor-core/utils/comments';
import { Button } from '@patrick/ui/components/button';
import { Check, Trash2, Undo2 } from 'lucide-react';
import type { SidebarItemRenderProps } from '../../plugin-api/types';
import { useTranslation } from '../../i18n';
import { ReplyInput } from './reply-input';
import { ReviewCardShell } from './review-card-shell';

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
    <ReviewCardShell
      author={comment.author || t('comments.unknown')}
      date={comment.date}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      measureRef={measureRef}
      availableHeight={availableHeight}
      dataCommentId={comment.id}
      body={getCommentText(comment.content)}
      actions={
        <>
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
        </>
      }
      metaExtra={
        comment.done ? (
          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
            <Check className="size-3" />
            {t('comments.resolved')}
          </span>
        ) : undefined
      }
      replies={replies}
      replyInput={
        comment.done ? undefined : (
          <ReplyInput onSubmit={(text) => onReply?.(comment.id, text)} />
        )
      }
    />
  );
}
