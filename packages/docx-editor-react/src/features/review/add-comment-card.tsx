import { Button } from '@patrick/ui/components/button';
import { Textarea } from '@patrick/ui/components/textarea';
import { useState } from 'react';
import type { SidebarItemRenderProps } from './types';

export interface AddCommentCardProps extends SidebarItemRenderProps {
  onSubmit?: (text: string) => void;
  onCancel?: () => void;
}

/** The compose card shown while adding a comment to the current selection. */
export function AddCommentCard({ measureRef, onSubmit, onCancel }: AddCommentCardProps) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit?.(text.trim());
      setText('');
    }
  };

  return (
    <div
      ref={measureRef}
      onMouseDown={(e) => e.stopPropagation()}
      className="rounded-lg border border-border bg-card p-3 font-sans shadow-sm"
    >
      <Textarea
        ref={(el) => el?.focus({ preventScroll: true })}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === 'Escape') {
            onCancel?.();
            setText('');
          }
        }}
        placeholder={'Add a comment...'}
        className="min-h-10 resize-none text-sm"
      />
      <div className="mt-2 flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onCancel?.();
            setText('');
          }}
        >
          {'Cancel'}
        </Button>
        <Button size="sm" disabled={!text.trim()} onClick={handleSubmit}>
          {'Comment'}
        </Button>
      </div>
    </div>
  );
}
