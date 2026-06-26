/**
 * Image commands — thin re-exports from the extension system.
 *
 * Wrap-type transitions for floating images. Inline↔anchor conversions are
 * structural and live in a follow-up; this surface only covers anchor↔anchor.
 */

import type { Command, EditorState, Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { singletonManager } from '../schema';
import { makeRevisionInfo } from '../plugins/revisionIds';
import type {
  ImageLayoutTarget,
  SetImageWrapTypeOptions,
} from '../extensions/nodes/ImageExtension';

const cmds = singletonManager.getCommands();

/**
 * Insert an image node at `pos`, wrapping with the `insertion` mark when
 * suggesting mode is active. Centralizes the tracked-image-insert flow
 * so React `useFileIO`, Vue `useImageActions`, and clipboard-paste
 * paths all share one source of truth — adding a fresh image in
 * suggesting mode always round-trips as `<w:ins>{run with drawing}</w:ins>`.
 *
 * Caller responsibility: produce the `image` node via `schema.nodes.image.create`.
 * This helper handles the dispatch + optional mark application.
 *
 * @public
 */
export function insertImageNode(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  imageNode: PMNode,
  pos: number
): boolean {
  if (!dispatch) return true;
  const tr = state.tr.insert(pos, imageNode);
  const info = makeRevisionInfo(state);
  const insertionType = state.schema.marks.insertion;
  if (info && insertionType) {
    tr.addMark(
      pos,
      pos + imageNode.nodeSize,
      insertionType.create({
        revisionId: info.revisionId,
        author: info.author,
        date: info.date,
      })
    );
  }
  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Default max width (px) for an image inserted from a file picker — the content
 * area of a US Letter page at 96dpi (~6.375in). Images wider than this are
 * scaled down to fit the column, matching Word and keeping the painter's
 * `max-width: 100%` from shrinking the rendered height out from under the
 * reserved line height (which would leave a gap below the image).
 */
export const INSERT_IMAGE_MAX_WIDTH_PX = 612;

/**
 * Read an image `File` (from a file picker or drop), fit it to the page width,
 * and insert it inline at the current selection. This is the single source of
 * truth for "insert an image from a file" — the React and Vue adapters both
 * call it, so insertion behaves identically: no intermediate dialog, the image
 * is sized to fit the column, and it round-trips as an inline drawing (with the
 * `insertion` mark applied in suggesting mode, via {@link insertImageNode}).
 *
 * The decode is async (FileReader → Image); `onError` reports a failed read or
 * decode, and `onInserted` runs after the node lands (e.g. to refocus).
 *
 * @public
 */
export function insertImageFromFile(
  view: EditorView,
  file: File,
  opts?: { maxWidth?: number; onError?: (error: unknown) => void; onInserted?: () => void }
): void {
  const maxWidth = opts?.maxWidth ?? INSERT_IMAGE_MAX_WIDTH_PX;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      const imageNode = view.state.schema.nodes.image.create({
        src: dataUrl,
        alt: file.name,
        width,
        height,
        // Entropy beyond the timestamp so two images inserted in the same
        // millisecond can't collide on rId (mirrors the clipboard-paste path).
        rId: `rId_img_${Date.now()}_${Math.round(Math.random() * 1e9)}`,
        wrapType: 'inline',
        displayMode: 'inline',
      });
      insertImageNode(view.state, view.dispatch, imageNode, view.state.selection.from);
      view.focus();
      opts?.onInserted?.();
    };
    img.onerror = () => opts?.onError?.(new Error('Failed to decode image'));
    img.src = dataUrl;
  };
  reader.onerror = () => opts?.onError?.(reader.error);
  reader.readAsDataURL(file);
}

/**
 * Change a floating image's wrap layout. `pos` is the PM document position of
 * the image node; `target` is either an OOXML wrap type (square / tight /
 * topAndBottom / behind / inFront / inline) or a directional convenience
 * choice (`squareLeft` / `squareRight`).
 *
 * `opts.initialPositionEmu` is used when promoting an inline image to an
 * anchor — the caller measures the image's current rendered offset relative
 * to the column origin in EMUs and passes it through, so the new float lands
 * exactly where the inline glyph used to sit (matches Word's behavior).
 */
export function setImageWrapType(
  pos: number,
  target: ImageLayoutTarget,
  opts?: SetImageWrapTypeOptions
): Command {
  return cmds.setImageWrapType(pos, target, opts);
}

export type {
  AnchorWrapType,
  ImageLayoutTarget,
  SetImageWrapTypeOptions,
} from '../extensions/nodes/ImageExtension';
