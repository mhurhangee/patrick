/**
 * Holds the editor's current `Document` — the rendered source of truth fed to
 * the PagedEditor, section/header-footer resolution, and the agent.
 *
 * This is plain state, NOT an undo/redo stack. ProseMirror owns undo/redo (the
 * `Mod-z` keymap in the core `HistoryExtension`), so the React layer only needs
 * to track the latest document. `set` dedupes on document/header/footer
 * identity so a no-op change can't trigger a needless re-render.
 */

import { useCallback, useState } from 'react';

interface DocumentPackageLike {
  package?: { document?: unknown; headers?: unknown; footers?: unknown } | null;
}

export interface DocumentStateApi<T> {
  /** The current document (the rendered source of truth). */
  state: T;
  /** Replace the current document after an edit (no-op when content is unchanged). */
  set: (next: T) => void;
  /** Replace the document on a fresh load. */
  reset: (next: T) => void;
}

/** Compare document content, headers, and footers — Maps use reference equality first. */
function documentsEqual<T extends DocumentPackageLike | null>(a: T, b: T): boolean {
  if (a?.package?.document !== b?.package?.document) {
    if (JSON.stringify(a?.package?.document) !== JSON.stringify(b?.package?.document)) {
      return false;
    }
  }
  if (a?.package?.headers !== b?.package?.headers) return false;
  if (a?.package?.footers !== b?.package?.footers) return false;
  return true;
}

export function useDocumentState<T extends DocumentPackageLike | null>(
  initial: T
): DocumentStateApi<T> {
  const [state, setState] = useState<T>(initial);

  const set = useCallback((next: T) => {
    setState((prev) => (documentsEqual(prev, next) ? prev : next));
  }, []);

  const reset = useCallback((next: T) => {
    setState(next);
  }, []);

  return { state, set, reset };
}
