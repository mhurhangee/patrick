import { type ReactNode, useEffect, useRef } from 'react';

/**
 * A popover anchored at the cursor/cell rather than a trigger element — for
 * editor actions invoked from a menu (split cell, table properties, hyperlink)
 * where the natural anchor is where the caret is.
 *
 * Deliberately a plain positioned element, NOT a radix Popover: a radix popover
 * opened programmatically from an unrelated click (a menu item) gets dismissed
 * by its own outside-pointer layer and flashes shut. Closing is handled here via
 * Esc + an outside-mousedown listener attached *after* mount, so the click that
 * opened it isn't caught. Renders nothing until it has a rect.
 */
export function CursorPopover({
  open,
  onOpenChange,
  rect,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rect: DOMRect | null;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  if (!open || !rect) return null;

  // Below the caret, clamped so a near-right-edge cursor doesn't overflow.
  const left = Math.min(rect.left, window.innerWidth - 320);
  const top = rect.bottom + 6;

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
      style={{ left: Math.max(8, left), top }}
    >
      {children}
    </div>
  );
}
