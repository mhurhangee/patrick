/**
 * Suggesting-mode paste path. Pasting over a non-empty text selection is a
 * replace op: the selected text is marked as a tracked deletion and the
 * pasted content is inserted after it as a tracked insertion — mirroring
 * what `applySuggestionInsert` does for a typed-over selection. The deletion
 * and insertion share the (author, date) triple so `extractTrackedChanges`
 * folds them into a single "replacement" card. Pasting at a collapsed cursor
 * (or a non-text selection) is left to the default paste plus the plugin's
 * append-transaction catch-all, which already marks the inserted content.
 */

import { TextSelection } from 'prosemirror-state';
import type { Slice } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

import { findAdjacentRevision } from '../adjacency';
import { makeMarkAttrs } from '../markAttrs';
import { SUGGESTION_META, type SuggestionModeState } from '../state';
import { markRangeAsDeleted } from './delete';
import { markRangeAsInserted } from './insert';

/**
 * Paste a slice over a non-empty text selection as a tracked replacement.
 * Returns `false` (declining the paste) for collapsed cursors and non-text
 * selections so the default paste path handles them.
 */
export function applySuggestionPaste(
  view: EditorView,
  slice: Slice,
  pluginState: SuggestionModeState
): boolean {
  const insertionType = view.state.schema.marks.insertion;
  const deletionType = view.state.schema.marks.deletion;
  if (!insertionType || !deletionType) return false;

  const { selection } = view.state;
  // Only a non-empty text selection is a "replace"; cell/node selections and
  // collapsed cursors fall through to the default paste + catch-all.
  if (!(selection instanceof TextSelection) || selection.empty) return false;

  const { from, to } = selection;
  const tr = view.state.tr;
  tr.setMeta(SUGGESTION_META, true);

  const insertAttrs =
    findAdjacentRevision(view.state.doc, from, 'insertion', pluginState.author) ||
    makeMarkAttrs(pluginState);

  // Mark the replaced selection as deleted, sharing the insertion's date so
  // the del+ins pair folds into one replacement entry. The text stays in the
  // doc (struck through); own-author insertions inside the range are retracted.
  markRangeAsDeleted(
    tr,
    view.state.doc,
    from,
    to,
    insertionType,
    deletionType,
    pluginState,
    insertAttrs.date
  );

  // Insert the pasted slice immediately after the now-deleted text.
  const insertAt = tr.mapping.map(to);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt)));
  tr.replaceSelection(slice);
  const insertEnd = tr.selection.from;

  if (insertEnd > insertAt) {
    markRangeAsInserted(tr, tr.doc, insertAt, insertEnd, insertionType, deletionType, insertAttrs);
  }

  view.dispatch(tr.scrollIntoView());
  return true;
}
