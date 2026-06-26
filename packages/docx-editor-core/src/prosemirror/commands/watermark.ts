/**
 * Watermark command.
 *
 * The document watermark lives as a `doc` node attribute (see DocExtension), so
 * setting it is a normal ProseMirror transaction — it rides undo/redo, the
 * toolbar undo/redo buttons, and Ctrl+Z like any other edit. The painter reads
 * the watermark from PM state; the conversion layer syncs it to/from
 * `HeaderFooter.watermark` for parse/serialize.
 */

import type { Command, EditorState } from 'prosemirror-state';
import type { Watermark } from '../../types/document';

/** Read the current watermark from a ProseMirror state's doc attrs. */
export function getWatermarkFromState(state: EditorState): Watermark | null {
  return (state.doc.attrs.watermark as Watermark | null) ?? null;
}

/**
 * Set (or clear, with `null`) the document watermark. Dispatches a
 * `setDocAttribute` transaction so the change is undoable.
 */
export function setWatermark(watermark: Watermark | null): Command {
  return (state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.setDocAttribute('watermark', watermark));
    }
    return true;
  };
}
