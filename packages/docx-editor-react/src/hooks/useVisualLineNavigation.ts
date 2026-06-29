/**
 * Visual-line-aware ArrowUp/ArrowDown navigation with sticky X.
 *
 * The algorithm (caret-X probing, visual-line lookup, sticky-X key handling)
 * lives in core's `prosemirror/utils/visualLineNavigation` so the React and Vue
 * adapters share one implementation. This hook is the thin React wrapper: it
 * holds the mutable `VisualLineState` in a ref and forwards the live pages
 * container into the shared key handler.
 */

import { useCallback, useRef } from 'react';
import type { EditorView } from 'prosemirror-view';
import {
  createVisualLineState,
  handleVisualLineKeyDown,
  type VisualLineState,
} from '@eigenpal/docx-editor-core/prosemirror/utils/visualLineNavigation';

export interface VisualLineNavigationOptions {
  pagesContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useVisualLineNavigation({ pagesContainerRef }: VisualLineNavigationOptions) {
  const stateRef = useRef<VisualLineState>(createVisualLineState());

  const handlePMKeyDown = useCallback(
    (view: EditorView, event: KeyboardEvent): boolean =>
      handleVisualLineKeyDown(stateRef.current, view, event, pagesContainerRef.current),
    [pagesContainerRef]
  );

  return { handlePMKeyDown };
}
