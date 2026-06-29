import { getInitials } from '@eigenpal/docx-editor-core/utils/comments';
import { cn } from '@patrick/ui/lib/utils';

/** Initials chip for a comment/change author, on the Patrick coral brand colour. */
export function AuthorAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full bg-(--patrick-coral) text-[11px] font-medium text-white',
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}
