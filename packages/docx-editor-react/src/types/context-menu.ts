/** Shared context-menu action + item types (consumed by the glue and the menus). */

export type TextContextAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'pasteAsPlainText'
  | 'selectAll'
  | 'delete'
  | 'separator'
  | 'addRowAbove'
  | 'addRowBelow'
  | 'deleteRow'
  | 'addColumnLeft'
  | 'addColumnRight'
  | 'deleteColumn'
  | 'mergeCells'
  | 'splitCell'
  | 'selectTable'
  | 'tableProperties'
  | 'deleteTable'
  | 'addComment';

export interface TextContextMenuItem {
  action: TextContextAction;
  /** Display label (already translated by the glue). */
  label: string;
  /** Keyboard shortcut hint (already formatted for the platform). */
  shortcut?: string;
  disabled?: boolean;
  /** Render a divider after this item. */
  dividerAfter?: boolean;
}

/** The clipboard actions that ride along inside the image menu — same shape. */
export type ImageContextMenuTextAction = TextContextMenuItem;

/** A right-clicked image's `cssFloat` attr (disambiguates square-left vs -right). */
export type ImageAttrsCssFloat = 'left' | 'right' | 'none' | null;
