import { DropdownMenuItem, DropdownMenuShortcut } from '@patrick/ui/components/dropdown-menu';
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
import type { TextContextAction, TextContextMenuItem } from './types';

/** Action → lucide icon. Table ops mirror the toolbar's table group for a
 *  consistent vocabulary (Rows3 / Columns3 / Merge / Split / Trash2). */
export const ICON_BY_ACTION: Partial<Record<TextContextAction, LucideIcon>> = {
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

/** One context-menu action row — icon + label + optional shortcut. Shared by
 *  the text and image menus so their clipboard rows can't drift apart. */
export function ActionMenuItem({
  item,
  disabled,
  onSelect,
}: {
  item: TextContextMenuItem;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const Icon = ICON_BY_ACTION[item.action];
  return (
    <DropdownMenuItem disabled={disabled ?? item.disabled} onSelect={onSelect}>
      {Icon && <Icon className="size-4" />}
      <span className="flex-1">{item.label}</span>
      {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
}
