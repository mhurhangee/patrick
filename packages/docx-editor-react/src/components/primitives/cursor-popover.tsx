import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A popover anchored at the cursor/cell/selection rather than a trigger element —
 * for editor actions invoked from a menu (split cell, table properties, image
 * properties, hyperlink) where the natural anchor is the selection.
 *
 * A plain positioned element, not a radix Popover: a radix popover opened
 * programmatically from an unrelated click (a menu item) gets dismissed by its
 * own outside-pointer layer and flashes shut. Closes on Esc / outside-mousedown
 * (attached after mount so the opening click isn't caught; clicks inside radix
 * portals — a Select dropdown rendered on document.body — don't count as
 * outside) / scroll (position:fixed, so the rect would otherwise go stale and
 * the popover float over unrelated content). Positions below the rect, flipping
 * above / clamping to the viewport.
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
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Measure + place before paint: flip above when it would overflow the bottom,
  // clamp horizontally to stay on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !rect || !el) {
      setPos(null);
      return;
    }
    const { offsetWidth: w, offsetHeight: h } = el;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    const below = rect.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, rect.top - h - 6) : below;
    setPos({ left, top });
  }, [open, rect]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (ref.current?.contains(t as Node)) return;
      // Clicks inside a radix portal (e.g. a Select dropdown) aren't "outside".
      if (t?.closest?.('[data-radix-popper-content-wrapper]')) return;
      onOpenChangeRef.current(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChangeRef.current(false);
    };
    // Capture-phase: the editor scrolls an inner container, not window.
    const onScroll = () => onOpenChangeRef.current(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  if (!open || !rect) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
      // Until measured, render at the raw rect but hidden, so the flip/clamp in
      // useLayoutEffect applies before paint (no visible jump).
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : { left: rect.left, top: rect.bottom + 6, visibility: 'hidden' }
      }
    >
      {children}
    </div>
  );
}
