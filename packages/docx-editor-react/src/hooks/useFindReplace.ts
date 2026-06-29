/**
 * useFindReplace Hook
 *
 * React hook for the find/replace bar's open/close + match-index state.
 * The bar owns its own search text, replace text, and find options; the
 * bridge owns the authoritative match list. This hook only tracks what the
 * shell needs: whether the bar is open, the seed search text, replace mode,
 * and the current match index.
 */

import { useState, useCallback } from 'react';
import type { FindMatch } from '@eigenpal/docx-editor-core/utils/findReplace';

// ============================================================================
// TYPES
// ============================================================================

/**
 * State for the find/replace hook
 */
export interface FindReplaceState {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Current search text */
  searchText: string;
  /** All matches found */
  matches: FindMatch[];
  /** Current match index */
  currentIndex: number;
  /** Whether in replace mode */
  replaceMode: boolean;
}

/**
 * Return type for the useFindReplace hook
 */
export interface UseFindReplaceReturn {
  /** Current state */
  state: FindReplaceState;
  /** Open the find dialog */
  openFind: (selectedText?: string) => void;
  /** Open the replace dialog */
  openReplace: (selectedText?: string) => void;
  /** Close the dialog */
  close: () => void;
  /** Set search results */
  setMatches: (matches: FindMatch[], currentIndex?: number) => void;
  /** Go to a specific match by index */
  goToMatch: (index: number) => void;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for managing find/replace dialog state
 */
export function useFindReplace(): UseFindReplaceReturn {
  const [state, setState] = useState<FindReplaceState>({
    isOpen: false,
    searchText: '',
    matches: [],
    currentIndex: 0,
    replaceMode: false,
  });

  const openFind = useCallback((selectedText?: string) => {
    setState((prev) => ({
      ...prev,
      isOpen: true,
      replaceMode: false,
      searchText: selectedText || prev.searchText,
      matches: [],
      currentIndex: 0,
    }));
  }, []);

  const openReplace = useCallback((selectedText?: string) => {
    setState((prev) => ({
      ...prev,
      isOpen: true,
      replaceMode: true,
      searchText: selectedText || prev.searchText,
      matches: [],
      currentIndex: 0,
    }));
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  const setMatches = useCallback((matches: FindMatch[], currentIndex: number = 0) => {
    const newIndex = Math.max(0, Math.min(currentIndex, matches.length - 1));
    setState((prev) => ({
      ...prev,
      matches,
      currentIndex: matches.length > 0 ? newIndex : 0,
    }));
  }, []);

  const goToMatch = useCallback((index: number) => {
    setState((prev) => {
      if (prev.matches.length === 0 || index < 0 || index >= prev.matches.length) {
        return prev;
      }
      return { ...prev, currentIndex: index };
    });
  }, []);

  return {
    state,
    openFind,
    openReplace,
    close,
    setMatches,
    goToMatch,
  };
}
