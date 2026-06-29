import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@patrick/ui/components/dropdown-menu';
import type { ReactNode } from 'react';

/**
 * A DropdownMenu opened programmatically at viewport coordinates — the shared
 * shell for the right-click context menus. The glue stays coordinate-controlled
 * (it captures the click, decides the items, and sets `{open, x, y}`); Radix
 * supplies collision-flip, keyboard nav, portal, and a11y. The trigger is a 0×0
 * fixed element at the click point that the content anchors to. `modal={false}`
 * keeps the page interactive and closes on outside pointer-down.
 */
export function PositionedMenu({
  open,
  x,
  y,
  onClose,
  ariaLabel,
  contentClassName,
  children,
}: {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  ariaLabel: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={(next) => !next && onClose()} modal={false}>
      <DropdownMenuTrigger
        aria-hidden
        tabIndex={-1}
        className="fixed h-0 w-0"
        style={{ left: x, top: y }}
      />
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={2}
        aria-label={ariaLabel}
        className={contentClassName}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
