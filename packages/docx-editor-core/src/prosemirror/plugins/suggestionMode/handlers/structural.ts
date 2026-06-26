/**
 * Suggesting-mode structural handlers: Enter (tracked paragraph split),
 * Backspace-at-start (tracked pPrDel + own-pPrIns retract), Delete-at-end
 * (mirror of Backspace, current paragraph's break gets the marker).
 */

import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';

import {
  applyPostSplitInheritance,
  STYLE_MARK_NAMES,
} from '../../../extensions/features/BaseKeymapExtension';
import { getDocumentStyleResolver } from '../../documentStyles';
import { findAdjacentParagraphMark } from '../adjacency';
import { makeMarkAttrs } from '../markAttrs';
import { suggestionModeKey, SUGGESTION_META, type MarkAttrs } from '../state';
import { markRangeAsDeleted } from './delete';

/**
 * Suggesting-mode Enter handler. Splits the paragraph (via the existing
 * BaseKeymapExtension `splitBlockClearBorders` behavior, re-implemented
 * inline so we can capture the resulting transaction and add a `pPrIns`
 * attr on the *first* paragraph in the same PM transaction).
 *
 * Per ECMA-376 §17.13.5, the paragraph mark of the FIRST paragraph after
 * a split is the one that was newly introduced. Reject of `pPrIns` joins
 * the first paragraph back with the next; accept just clears the marker.
 */
export function handleSuggestionEnter(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined
): boolean {
  const pluginState = suggestionModeKey.getState(state);
  if (!pluginState?.active) return false;

  // Selection must be inside a paragraph (other block types fall through).
  const { $from, $to } = state.selection;
  if ($from.parent.type.name !== 'paragraph') return false;
  if ($to.parent.type.name !== 'paragraph') return false;

  if (!dispatch) return true;

  // If the selection covers content, mark it as deletion first (existing
  // suggesting-mode behavior) so the split happens at the selection start.
  const insertionType = state.schema.marks.insertion;
  const deletionType = state.schema.marks.deletion;
  if (!insertionType || !deletionType) return false;

  // Capture source paragraph + active style marks BEFORE any tr work so
  // `applyPostSplitInheritance` can match `splitBlockClearBorders` behavior:
  // typed text after the split inherits font / size / color via setStoredMarks.
  const sourcePara = $from.parent;
  const preMarks = state.storedMarks ?? $from.marks();
  const styleMarks = preMarks.filter((m) => STYLE_MARK_NAMES.has(m.type.name));

  const tr = state.tr;
  tr.setMeta(SUGGESTION_META, true);

  if (!state.selection.empty) {
    markRangeAsDeleted(tr, state.doc, $from.pos, $to.pos, insertionType, deletionType, pluginState);
    // Collapse cursor to the deletion start before splitting.
    const collapsePos = tr.mapping.map($from.pos);
    tr.setSelection(TextSelection.near(tr.doc.resolve(collapsePos)));
  }

  // The first paragraph is the one whose mark just got introduced. We need
  // its absolute position BEFORE the split to find it again after.
  const $cursor = tr.selection.$from;
  const firstParaStart = $cursor.before($cursor.depth);

  // Split the paragraph at the cursor. After tr.split, the cursor (mapped)
  // lands at the start of the NEW paragraph, which is what
  // applyPostSplitInheritance expects.
  tr.split(tr.selection.from, 1);

  // Set pPrIns on the FIRST paragraph (the one before the split). Coalesce
  // with an adjacent same-author pPrIns so consecutive Enters in one editing
  // session show as a single tracked change in the sidebar.
  const firstPara = tr.doc.nodeAt(firstParaStart);
  if (firstPara && firstPara.type.name === 'paragraph') {
    const info =
      findAdjacentParagraphMark(tr.doc, firstParaStart, 'pPrIns', pluginState.author) ??
      makeMarkAttrs(pluginState);
    tr.setNodeMarkup(firstParaStart, undefined, {
      ...firstPara.attrs,
      pPrIns: info,
    });
  }

  // Shared with plain Enter: inherits style attrs, clears borders, and
  // (for an empty new paragraph) sets stored marks so typed text picks up
  // the source paragraph's font / size / color.
  applyPostSplitInheritance(
    tr,
    sourcePara,
    styleMarks,
    state.schema,
    getDocumentStyleResolver(state)
  );

  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Suggesting-mode Backspace at the start of a non-first paragraph: set
 * `pPrDel` on the PREVIOUS paragraph (its terminating mark is the one
 * being eaten). Caret lands at the end of the previous paragraph.
 *
 * Returns false at the very start of the document (nothing to mark), so
 * the base keymap can chain through (which itself is a no-op there).
 */
export function handleSuggestionBackspaceAtStart(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined
): boolean {
  const pluginState = suggestionModeKey.getState(state);
  if (!pluginState?.active) return false;
  const { $from, empty } = state.selection;
  if (!empty) return false;
  if ($from.parentOffset !== 0) return false;
  if ($from.parent.type.name !== 'paragraph') return false;

  const paraStart = $from.before($from.depth);
  if (paraStart <= 0) return false; // first paragraph in the document
  // `paraStart` is the position immediately before the current paragraph's
  // open tag. `nodeBefore` at that position returns the previous sibling.
  const prevPara = state.doc.resolve(paraStart).nodeBefore;
  if (!prevPara || prevPara.type.name !== 'paragraph') return false;

  // Retract own pPrIns: the paragraph break we're about to backspace OVER
  // was inserted by THIS author in the current suggesting session. Word's
  // semantic — and the user's expectation — is that Backspace just undoes
  // the break (joins the paragraphs back) rather than stacking a pPrDel
  // on top of a pPrIns. Mirrors the inline `isOwnInsert` retract in
  // `markRangeAsDeleted`.
  const ownPrevPPrIns = prevPara.attrs.pPrIns as MarkAttrs | null;
  if (ownPrevPPrIns && ownPrevPPrIns.author === pluginState.author) {
    if (!dispatch) return true;
    const prevParaStart = paraStart - prevPara.nodeSize;
    const curPara = $from.parent;
    // The joined paragraph inherits the SECOND paragraph's pPr (matches
    // reject-pPrIns semantic at resolveById; also matches Word). curPara's
    // own pPrIns/pPrDel describe a DIFFERENT boundary (end of curPara, which
    // still exists after the join) — never clobber them, even when they
    // belong to a different author.
    const tr = state.tr.setNodeMarkup(prevParaStart, undefined, curPara.attrs);
    tr.join(paraStart);
    tr.setMeta(SUGGESTION_META, true);
    dispatch(tr.scrollIntoView());
    return true;
  }

  // Already marked as deleted by the same author — second Backspace is a no-op.
  if (prevPara.attrs.pPrDel) {
    if (dispatch) {
      const prevParaEnd = paraStart - 1;
      const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(prevParaEnd)));
      dispatch(tr);
    }
    return true;
  }

  if (!dispatch) return true;

  const prevParaStart = paraStart - prevPara.nodeSize;
  // Coalesce with adjacent same-author pPrDel so a run of Backspaces shows
  // as one tracked change.
  const info =
    findAdjacentParagraphMark(state.doc, prevParaStart, 'pPrDel', pluginState.author) ??
    makeMarkAttrs(pluginState);
  const tr = state.tr.setNodeMarkup(prevParaStart, undefined, {
    ...prevPara.attrs,
    pPrDel: info,
  });
  tr.setMeta(SUGGESTION_META, true);
  // Caret to end of previous paragraph.
  const prevParaEnd = paraStart - 1;
  tr.setSelection(TextSelection.near(tr.doc.resolve(prevParaEnd)));
  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Suggesting-mode Delete at end of a non-last paragraph: set `pPrDel` on
 * the CURRENT paragraph.
 */
export function handleSuggestionDeleteAtEnd(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined
): boolean {
  const pluginState = suggestionModeKey.getState(state);
  if (!pluginState?.active) return false;
  const { $from, empty } = state.selection;
  if (!empty) return false;
  if ($from.parent.type.name !== 'paragraph') return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;

  const para = $from.parent;
  const paraStart = $from.before($from.depth);
  const paraEnd = paraStart + para.nodeSize;
  if (paraEnd >= state.doc.content.size) return false; // last paragraph
  const $afterPara = state.doc.resolve(paraEnd);
  const nextPara = $afterPara.nodeAfter;
  if (!nextPara || nextPara.type.name !== 'paragraph') return false;

  // Retract own pPrIns: Delete at end joining over a paragraph break that
  // we just authored should undo the break (same semantics as Backspace at
  // start retracting own pPrIns on the previous paragraph).
  const ownCurPPrIns = para.attrs.pPrIns as MarkAttrs | null;
  if (ownCurPPrIns && ownCurPPrIns.author === pluginState.author) {
    if (!dispatch) return true;
    // Joined paragraph inherits the SECOND paragraph's pPr (`nextPara`).
    // nextPara's own pPrIns/pPrDel describe a different boundary (end of
    // nextPara, still present after the join) — preserve them, regardless
    // of author.
    const tr = state.tr.setNodeMarkup(paraStart, undefined, nextPara.attrs);
    tr.join(paraEnd);
    tr.setMeta(SUGGESTION_META, true);
    dispatch(tr.scrollIntoView());
    return true;
  }

  if (para.attrs.pPrDel) {
    return true; // already marked
  }

  if (!dispatch) return true;

  // Coalesce with adjacent same-author pPrDel.
  const info =
    findAdjacentParagraphMark(state.doc, paraStart, 'pPrDel', pluginState.author) ??
    makeMarkAttrs(pluginState);
  const tr = state.tr.setNodeMarkup(paraStart, undefined, {
    ...para.attrs,
    pPrDel: info,
  });
  tr.setMeta(SUGGESTION_META, true);
  dispatch(tr.scrollIntoView());
  return true;
}
