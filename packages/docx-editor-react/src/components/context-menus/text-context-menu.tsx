import { DropdownMenuSeparator } from '@patrick/ui/components/dropdown-menu';
import { Fragment } from 'react';
import type { TextContextAction, TextContextMenuItem } from '../../types/context-menu';
import { ActionMenuItem } from './action-menu-item';
import { PositionedMenu } from './positioned-menu';

export interface TextContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  hasSelection: boolean;
  isEditable: boolean;
  /** The item list, built by the glue (`useContextMenus`). */
  items: TextContextMenuItem[];
  onAction: (action: TextContextAction) => void;
  onClose: () => void;
}

/**
 * Right-click text menu — clipboard, comment, and (inside a cell) table ops.
 * The item list and action execution live in the glue; this only renders them
 * and derives the clipboard-availability disabled states from selection/edit
 * state. Radix (via PositionedMenu) handles positioning, keyboard nav, and
 * dismissal.
 */
export function TextContextMenu({
  isOpen,
  position,
  hasSelection,
  isEditable,
  items,
  onAction,
  onClose,
}: TextContextMenuProps) {
  return (
    <PositionedMenu
      open={isOpen}
      x={position.x}
      y={position.y}
      onClose={onClose}
      ariaLabel={'Text editing menu'}
      contentClassName="min-w-56"
    >
      {isOpen &&
        items.map((item, index) => {
          const disabled =
            item.disabled ??
            (item.action === 'cut' || item.action === 'copy' || item.action === 'delete'
              ? !hasSelection
              : item.action === 'paste' || item.action === 'pasteAsPlainText'
                ? !isEditable
                : false);
          return (
            <Fragment key={`${item.action}-${index}`}>
              <ActionMenuItem
                item={item}
                disabled={disabled}
                onSelect={() => onAction(item.action)}
              />
              {item.dividerAfter && <DropdownMenuSeparator />}
            </Fragment>
          );
        })}
    </PositionedMenu>
  );
}
