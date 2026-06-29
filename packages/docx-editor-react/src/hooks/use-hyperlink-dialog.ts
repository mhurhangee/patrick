import { useCallback, useState } from 'react';
import type { HyperlinkData, UseHyperlinkDialogReturn, UseHyperlinkDialogState } from '../types/hyperlink';

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
