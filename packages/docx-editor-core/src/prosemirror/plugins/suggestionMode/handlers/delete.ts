/**
 * Suggesting-mode deletion paths. `markRangeAsDeleted` is the shared core
 * (used by Backspace/Delete, by the structural Enter handler for replace
 * selections, and by `applySuggestionInsert` for paste-replace).
 */

import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { Node as PMNode, MarkType } from 'prosemirror-model';

import { findAdjacentRevisionForRange } from '../adjacency';
import { makeMarkAttrs } from '../markAttrs';
import { suggestionModeKey, SUGGESTION_META, type SuggestionModeState } from '../state';

/**
 * Walk a text range and either mark as deletion or retract own insertions.
 * Processes in reverse order to maintain position validity.
 */
export function markRangeAsDeleted(
  tr: Transaction,
  doc: PMNode,
  from: number,
  to: number,
  insertionType: MarkType,
  deletionType: MarkType,
  pluginState: SuggestionModeState,
  /** When the caller is a replace op, pass the insertion's date so the
   * deletion shares the (author, date) triple — that's what the sidebar
   * uses to detect replace pairs and fold them into one 'replacement'
   * card. The `w:id` stays distinct so we don't trip the OOXML move-pair
   * serializer (fromProseDoc/paragraph.ts:340). */
  shareDate?: string
): void {
  const ranges: { from: number; to: number; isOwnInsert: boolean }[] = [];

  doc.nodesBetween(from, to, (node, pos) => {
    // Text AND inline atoms (image, shape) that accept the mark, so deleting a
    // picture in suggesting mode strikes it through (or retracts an own-insert)
    // just like deleting text.
    if (!node.isText && !(node.isInline && node.type.allowsMarkType(deletionType))) return;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (start >= end) return;
    const isOwnInsert = node.marks.some(
      (m) => m.type === insertionType && m.attrs.author === pluginState.author
    );
    ranges.push({ from: start, to: end, isOwnInsert });
  });

  if (ranges.length === 0) return;

  const delAttrs =
    findAdjacentRevisionForRange(doc, from, to, 'deletion', pluginState.author) ??
    makeMarkAttrs(pluginState, shareDate);

  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    if (range.isOwnInsert) {
      tr.delete(range.from, range.to);
    } else {
      tr.addMark(range.from, range.to, deletionType.create(delAttrs));
    }
  }
}

/**
 * Handle delete (forward or backward) in suggestion mode.
 */
export function handleSuggestionDelete(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  direction: 'backward' | 'forward'
): boolean {
  const pluginState = suggestionModeKey.getState(state);
  if (!pluginState?.active) return false;

  const { $from, $to, empty } = state.selection;
  const insertionType = state.schema.marks.insertion;
  const deletionType = state.schema.marks.deletion;
  if (!insertionType || !deletionType) return false;

  if (!dispatch) return true;

  const tr = state.tr;
  tr.setMeta(SUGGESTION_META, true);

  // --- Selection delete ---
  if (!empty) {
    markRangeAsDeleted(tr, state.doc, $from.pos, $to.pos, insertionType, deletionType, pluginState);
    // Collapse cursor to after the marked/retracted content
    const cursorPos = tr.mapping.map($to.pos);
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
    return true;
  }

  // --- Single character delete ---
  const isBackward = direction === 'backward';
  const deletePos = isBackward ? $from.pos - 1 : $from.pos;
  const deleteEnd = isBackward ? $from.pos : $from.pos + 1;

  if (deletePos < 0 || deleteEnd > state.doc.content.size) return true;

  const $deletePos = state.doc.resolve(deletePos);
  const nodeAfter = $deletePos.nodeAfter;

  // At a block boundary — let default behavior handle (e.g. join paragraphs).
  // Text and inline atoms (image, shape) that accept the deletion mark are
  // handled below; other inline nodes fall through to the default delete.
  if (
    !nodeAfter ||
    !(nodeAfter.isText || (nodeAfter.isInline && nodeAfter.type.allowsMarkType(deletionType)))
  ) {
    return false;
  }

  const hasOwnInsertion = nodeAfter.marks.some(
    (m) => m.type === insertionType && m.attrs.author === pluginState.author
  );
  const hasDeletion = nodeAfter.marks.some((m) => m.type === deletionType);

  if (hasDeletion) {
    // Already deleted — skip cursor past it
    const newPos = isBackward ? deletePos : deleteEnd;
    tr.setSelection(TextSelection.near(tr.doc.resolve(newPos)));
  } else if (hasOwnInsertion) {
    // Retract own insertion — actually delete the character
    tr.delete(deletePos, deleteEnd);
  } else {
    // Mark as deletion instead of removing
    const delAttrs =
      findAdjacentRevisionForRange(
        state.doc,
        deletePos,
        deleteEnd,
        'deletion',
        pluginState.author
      ) || makeMarkAttrs(pluginState);
    tr.addMark(deletePos, deleteEnd, deletionType.create(delAttrs));
    // Move cursor past the deletion mark
    const newPos = isBackward ? deletePos : deleteEnd;
    tr.setSelection(TextSelection.near(tr.doc.resolve(newPos)));
  }

  dispatch(tr.scrollIntoView());
  return true;
}
