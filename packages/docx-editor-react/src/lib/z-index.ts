/**
 * Z-index stacking order for editor chrome.
 *
 * Single source of truth so layered UI doesn't drift into ad-hoc numbers.
 *
 * Order, low to high:
 *   page content (default 0)
 *   HF inline editor      — sits above page content, below chrome
 *   outline               — floating toggle + panel beside the page
 *   dropdown / popover    — opens from toolbar buttons or HF options
 *   context menu / modal  — top-most, transient surfaces
 */
export const Z_INDEX = {
  hfInlineEditor: 10,
  outline: 40,
  dropdown: 100,
  contextMenu: 10000,
} as const;
