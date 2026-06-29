import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@patrick/ui/components/dropdown-menu';
import { cn } from '@patrick/ui/lib/utils';
import type { ReactNode } from 'react';
import { Z_INDEX } from '../../styles/zIndex';

/**
 * A DropdownMenu opened programmatically at viewport coordinates — the shared
 * shell for the right-click context menus. The glue stays coordinate-controlled
 * (it captures the click, decides the items, and sets `{open, x, y}`); Radix
 * supplies collision-flip, keyboard nav, portal, and a11y. The trigger is a 0×0
 * fixed element at the click point that the content anchors to. `modal={false}`
 * keeps the page interactive and closes on outside pointer-down.
 *
 * - `onCloseAutoFocus` is suppressed: the trigger is a hidden 0×0 element, so
 *   Radix's default focus-restore would blur the editor after every action;
 *   the glue re-focuses the editor itself in its action handler.
 * - `w-auto` lets the menu size to its content (the 0-width trigger would
 *   otherwise pin it to the min-width floor and clip long items).
 * - `Z_INDEX.contextMenu` keeps it above the toolbar/other editor chrome.
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
        onCloseAutoFocus={(e) => e.preventDefault()}
        style={{ zIndex: Z_INDEX.contextMenu }}
        className={cn('w-auto', contentClassName)}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
