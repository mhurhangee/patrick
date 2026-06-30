import { useCallback, useState } from 'react';
import { setImageWrapType } from '@eigenpal/docx-editor-core/prosemirror/commands';
import {
  captureInlinePositionEmu,
  toolbarValueToLayoutTarget,
} from '@eigenpal/docx-editor-core/layout-painter';
import type { EditorView } from 'prosemirror-view';
import type { ImagePropertiesData } from '../types/image';

/** Minimal shape the hook needs from the parent's selection-tracker state. */
interface ImageContext {
  pos: number;
}

/**
 * Image-related dialog + toolbar actions:
 *  - wrap type (inline ↔ float-wrap variants) via setImageWrapType
 *  - 90° rotate + horizontal/vertical flip via transform attr
 *  - properties dialog (alt text, border, width/height)
 *
 * Owns the properties dialog's open/closed state; the JSX consumer reads
 * the `imagePropsOpen` flag + the apply/cancel callbacks. `pmImageContext`
 * comes from the parent's selection-tracker state because it's set by the
 * image right-click flow.
 */
export function useImageActions({
  pmImageContext,
  zoom,
  getActiveEditorView,
  getCaretRect,
  focusActiveEditor,
}: {
  pmImageContext: ImageContext | null | undefined;
  zoom: number;
  getActiveEditorView: () => EditorView | null | undefined;
  getCaretRect: () => DOMRect | null;
  focusActiveEditor: () => void;
}) {
  const [imagePropsOpen, setImagePropsOpen] = useState(false);
  const [imagePropsRect, setImagePropsRect] = useState<DOMRect | null>(null);

  // Opened from the toolbar button (no arg → anchor at the painted caret/image
  // box, which is live because the button keeps editor focus) or from the image
  // context menu, which passes its click point: opening the menu blurs the
  // editor and clears the image selection, so the image box is gone by the time
  // the action fires — the menu's own coords are the only stable anchor.
  const handleOpenImageProperties = useCallback(
    (rect?: DOMRect | null) => {
      setImagePropsRect(rect ?? getCaretRect());
      setImagePropsOpen(true);
    },
    [getCaretRect]
  );

  const handleImageWrapType = useCallback(
    (toolbarValue: string) => {
      const view = getActiveEditorView();
      if (!view || !pmImageContext) return;
      const pos = pmImageContext.pos;
      const node = view.state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'image') return;

      // The toolbar and the right-click menu share `setImageWrapType` and its
      // `resolveAnchorAttrs` taxonomy; `toolbarValueToLayoutTarget` lives in core.
      const target = toolbarValueToLayoutTarget(toolbarValue);
      if (!target) return;

      // For inline → anchor, capture the inline glyph's rendered offset so the
      // new float lands at the same X/Y (Word's behavior). The core helper
      // handles the zoom + EMU conversion uniformly.
      let opts: { initialPositionEmu?: { horizontalEmu: number; verticalEmu: number } } | undefined;
      if (node.attrs.wrapType === 'inline' && target !== 'inline') {
        const inlineEl = window.document.querySelector(
          `.layout-run-image[data-pm-start="${pos}"]`
        ) as HTMLElement | null;
        const captured = inlineEl ? captureInlinePositionEmu(inlineEl, zoom) : undefined;
        if (captured) opts = { initialPositionEmu: captured };
      }

      setImageWrapType(pos, target, opts)(view.state, view.dispatch);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor, pmImageContext, zoom]
  );

  const handleImageTransform = useCallback(
    (action: 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV') => {
      const view = getActiveEditorView();
      if (!view || !pmImageContext) return;

      const pos = pmImageContext.pos;
      const node = view.state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'image') return;

      const currentTransform = (node.attrs.transform as string) || '';
      const rotateMatch = currentTransform.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/);
      let rotation = rotateMatch ? parseFloat(rotateMatch[1]) : 0;
      let hasFlipH = /scaleX\(-1\)/.test(currentTransform);
      let hasFlipV = /scaleY\(-1\)/.test(currentTransform);

      switch (action) {
        case 'rotateCW':
          rotation = (rotation + 90) % 360;
          break;
        case 'rotateCCW':
          rotation = (rotation - 90 + 360) % 360;
          break;
        case 'flipH':
          hasFlipH = !hasFlipH;
          break;
        case 'flipV':
          hasFlipV = !hasFlipV;
          break;
      }

      const parts: string[] = [];
      if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
      if (hasFlipH) parts.push('scaleX(-1)');
      if (hasFlipV) parts.push('scaleY(-1)');
      const newTransform = parts.length > 0 ? parts.join(' ') : null;

      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        transform: newTransform,
      });
      view.dispatch(tr.scrollIntoView());
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor, pmImageContext]
  );

  const handleApplyImageProperties = useCallback(
    (data: ImagePropertiesData) => {
      const view = getActiveEditorView();
      if (!view || !pmImageContext) return;

      const pos = pmImageContext.pos;
      const node = view.state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'image') return;

      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        alt: data.alt ?? null,
        borderWidth: data.borderWidth ?? null,
        borderColor: data.borderColor ?? null,
        borderStyle: data.borderStyle ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
      });
      view.dispatch(tr.scrollIntoView());
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor, pmImageContext]
  );

  return {
    imagePropsOpen,
    setImagePropsOpen,
    imagePropsRect,
    handleOpenImageProperties,
    handleImageWrapType,
    handleImageTransform,
    handleApplyImageProperties,
  };
}
