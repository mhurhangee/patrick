import { useCallback } from 'react';
import type { PagedEditorRef } from '../components/editor/paged-editor';

/**
 * Bundles the editor's view + focus/undo/redo helpers, threaded to every
 * callback that dispatches into PM so call sites don't reach through
 * `pagedEditorRef.current` directly.
 */
export function useActiveEditor({
  pagedEditorRef,
}: {
  pagedEditorRef: React.RefObject<PagedEditorRef | null>;
}) {
  const getActiveEditorView = useCallback(
    () => pagedEditorRef.current?.getView(),
    [pagedEditorRef]
  );

  const focusActiveEditor = useCallback(() => {
    pagedEditorRef.current?.focus();
  }, [pagedEditorRef]);

  const undoActiveEditor = useCallback(() => {
    pagedEditorRef.current?.undo();
  }, [pagedEditorRef]);

  const redoActiveEditor = useCallback(() => {
    pagedEditorRef.current?.redo();
  }, [pagedEditorRef]);

  return { getActiveEditorView, focusActiveEditor, undoActiveEditor, redoActiveEditor };
}
