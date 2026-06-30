/**
 * Holds the editor's current `Document` — the rendered source of truth fed to
 * the PagedEditor, section/header-footer resolution, and the agent.
 *
 * Plain state, NOT an undo/redo stack: ProseMirror owns undo/redo (the `Mod-z`
 * keymap in the core `HistoryExtension`), so the React layer only tracks the
 * latest document. No equality guard is needed — the PagedEditor already fires
 * `onDocumentChange` only on real changes (`transaction.docChanged`), so every
 * `set` carries a genuinely new document.
 */

import { useMemo, useState } from 'react';

export interface DocumentStateApi<T> {
  /** The current document (the rendered source of truth). */
  state: T;
  /** Replace the current document — on an edit or a fresh load. */
  set: (next: T) => void;
}

export function useDocumentState<T>(initial: T): DocumentStateApi<T> {
  const [state, setState] = useState<T>(initial);
  // Stable object identity (changes only when `state` does) so consumers'
  // `[docState]`-keyed memoizations actually memoize. `setState` is stable.
  return useMemo(() => ({ state, set: setState }), [state]);
}
