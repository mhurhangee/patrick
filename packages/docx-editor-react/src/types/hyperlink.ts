/** Hyperlink data shape + the hyperlink dialog-state hook's public types. */

export interface HyperlinkData {
  /** URL for external link */
  url?: string;
  /** Display text for the link */
  displayText?: string;
  /** Internal bookmark name */
  bookmark?: string;
  /** Tooltip text */
  tooltip?: string;
}

export interface UseHyperlinkDialogState {
  isOpen: boolean;
  initialData?: HyperlinkData;
  selectedText?: string;
  isEditing: boolean;
}

export interface UseHyperlinkDialogReturn {
  state: UseHyperlinkDialogState;
  openInsert: (selectedText?: string) => void;
  openEdit: (data: HyperlinkData) => void;
  close: () => void;
  toggle: () => void;
}
