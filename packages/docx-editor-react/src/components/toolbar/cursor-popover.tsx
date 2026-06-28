import { Popover, PopoverAnchor, PopoverContent } from '@patrick/ui/components/popover';
import type { ReactNode } from 'react';

/**
 * A popover anchored at the cursor/cell rather than a trigger element — for
 * editor actions invoked from a menu (split cell, table properties, …) where the
 * natural anchor is where the caret is, not the menu item.
 *
 * The caller captures the painted caret rect at trigger time (via
 * `DocxEditorRef`/`PagedEditorRef` `getCaretRect()`) and passes it in, so the
 * anchor is correct even after the editor blurs. An invisible fixed-position
 * element at that rect is the radix anchor.
 */
export function CursorPopover({
  open,
  onOpenChange,
  rect,
  children,
  align = 'start',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rect: DOMRect | null;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: rect?.left ?? 0,
            top: rect?.top ?? 0,
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
            pointerEvents: 'none',
          }}
        />
      </PopoverAnchor>
      <PopoverContent align={align} side="bottom" className="w-auto">
        {children}
      </PopoverContent>
    </Popover>
  );
}
