import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@patrick/ui/components/dropdown-menu';
import {
  ClipboardPaste,
  ClipboardType,
  Columns3,
  Copy,
  Delete,
  type LucideIcon,
  Merge,
  MessageSquarePlus,
  Rows3,
  Scissors,
  Settings2,
  Split,
  Table2,
  TextSelect,
  Trash2,
} from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from '../../i18n';
import type { TextContextAction, TextContextMenuItem } from '../../types/context-menu';
import { PositionedMenu } from './positioned-menu';

/** Action → lucide icon. Table ops mirror the toolbar's table group for a
 *  consistent vocabulary (Rows3 / Columns3 / Merge / Split / Trash2). */
const ICON_BY_ACTION: Partial<Record<TextContextAction, LucideIcon>> = {
  cut: Scissors,
  copy: Copy,
  paste: ClipboardPaste,
  pasteAsPlainText: ClipboardType,
  delete: Delete,
  selectAll: TextSelect,
  addComment: MessageSquarePlus,
  addRowAbove: Rows3,
  addRowBelow: Rows3,
  deleteRow: Rows3,
  addColumnLeft: Columns3,
  addColumnRight: Columns3,
  deleteColumn: Columns3,
  mergeCells: Merge,
  splitCell: Split,
  selectTable: Table2,
  tableProperties: Settings2,
  deleteTable: Trash2,
};

export interface TextContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  hasSelection: boolean;
  isEditable: boolean;
  hasClipboardContent?: boolean;
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
  hasClipboardContent = true,
  items,
  onAction,
  onClose,
}: TextContextMenuProps) {
  const { t } = useTranslation();

  return (
    <PositionedMenu
      open={isOpen}
      x={position.x}
      y={position.y}
      onClose={onClose}
      ariaLabel={t('contextMenu.textMenuAriaLabel')}
      contentClassName="min-w-56"
    >
      {items.map((item, index) => {
        if (item.action === 'separator') {
          return <DropdownMenuSeparator key={`sep-${index}`} />;
        }
        const Icon = ICON_BY_ACTION[item.action];
        const disabled =
          item.disabled ??
          (item.action === 'cut' || item.action === 'copy' || item.action === 'delete'
            ? !hasSelection
            : item.action === 'paste' || item.action === 'pasteAsPlainText'
              ? !isEditable || !hasClipboardContent
              : false);
        return (
          <Fragment key={`${item.action}-${index}`}>
            <DropdownMenuItem disabled={disabled} onSelect={() => onAction(item.action)}>
              {Icon && <Icon className="size-4" />}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
            </DropdownMenuItem>
            {item.dividerAfter && <DropdownMenuSeparator />}
          </Fragment>
        );
      })}
    </PositionedMenu>
  );
}
