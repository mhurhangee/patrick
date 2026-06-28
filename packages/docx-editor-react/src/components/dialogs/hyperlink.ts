/**
 * Hyperlink state + helpers — the glue-facing surface that outlived the modal.
 * The editing UI is now the cursor-anchored hyperlink popover; this holds the
 * data shape, the open/close state hook, and URL normalization.
 */

import { useCallback, useState } from 'react';

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

/** Trim + default to https:// (keeping mailto:/tel:/ftp:). */
export function normalizeUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('ftp://')) {
    return trimmed;
  }
  if (!trimmed.match(/^https?:\/\//)) {
    return `https://${trimmed}`;
  }
  return trimmed;
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

/** Open/close + insert-vs-edit state for the hyperlink popover. */
export function useHyperlinkDialog(): UseHyperlinkDialogReturn {
  const [state, setState] = useState<UseHyperlinkDialogState>({ isOpen: false, isEditing: false });

  const openInsert = useCallback((selectedText?: string) => {
    setState({ isOpen: true, selectedText, initialData: undefined, isEditing: false });
  }, []);

  const openEdit = useCallback((data: HyperlinkData) => {
    setState({ isOpen: true, initialData: data, selectedText: data.displayText, isEditing: true });
  }, []);

  const close = useCallback(() => setState((prev) => ({ ...prev, isOpen: false })), []);
  const toggle = useCallback(() => setState((prev) => ({ ...prev, isOpen: !prev.isOpen })), []);

  return { state, openInsert, openEdit, close, toggle };
}
