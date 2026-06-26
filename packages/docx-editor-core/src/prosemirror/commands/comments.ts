/**
 * Comment and Track Changes Commands
 *
 * PM commands for adding/removing comments and accepting/rejecting tracked changes.
 */

import type { Command, Transaction } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { SUGGESTION_BYPASS_META } from '../plugins/suggestionMode';

/**
 * Add a comment mark to the current selection.
 */
export function addCommentMark(commentId: number): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) return false;

    const commentType = state.schema.marks.comment;
    if (!commentType) return false;

    if (dispatch) {
      const tr = state.tr.addMark(from, to, commentType.create({ commentId }));
      dispatch(tr);
    }
    return true;
  };
}

/**
 * Remove a comment mark by ID from the entire document.
 */
export function removeCommentMark(commentId: number): Command {
  return (state, dispatch) => {
    const commentType = state.schema.marks.comment;
    if (!commentType) return false;

    if (dispatch) {
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (node.isText) {
          for (const mark of node.marks) {
            if (mark.type === commentType && mark.attrs.commentId === commentId) {
              tr.removeMark(pos, pos + node.nodeSize, mark);
            }
          }
        }
      });
      if (tr.steps.length > 0) {
        dispatch(tr);
      }
    }
    return true;
  };
}

/**
 * Resolve a tracked change: accept or reject.
 * - Accept: keep insertions (remove mark), delete deletions (remove text)
 * - Reject: keep deletions (remove mark), delete insertions (remove text)
 */
function resolveChange(from: number, to: number, mode: 'accept' | 'reject'): Command {
  return (state, dispatch) => {
    const insertionType = state.schema.marks.insertion;
    const deletionType = state.schema.marks.deletion;
    if (!insertionType && !deletionType) return false;

    // "keep" mark type: remove the mark but keep the text
    // "remove" mark type: remove both the mark and the text
    const keepType = mode === 'accept' ? insertionType : deletionType;
    const removeType = mode === 'accept' ? deletionType : insertionType;

    if (dispatch) {
      const tr = state.tr;
      const deleteRanges: Array<{ from: number; to: number }> = [];

      state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isInline) return;
        const nodeEnd = pos + node.nodeSize;
        const rangeFrom = Math.max(from, pos);
        const rangeTo = Math.min(to, nodeEnd);

        if (removeType && node.marks.some((m) => m.type === removeType)) {
          deleteRanges.push({ from: rangeFrom, to: rangeTo });
        }

        if (keepType && node.marks.some((m) => m.type === keepType)) {
          tr.removeMark(rangeFrom, rangeTo, keepType);
        }
      });

      for (const range of deleteRanges.reverse()) {
        tr.delete(range.from, range.to);
      }

      if (tr.steps.length > 0) {
        dispatch(tr);
      }
    }
    return true;
  };
}

/**
 * Accept a tracked change at the given range.
 * - Insertion: remove mark, keep text
 * - Deletion: remove mark AND text
 *
 * Use {@link acceptChangeById} when accepting a coalesced revision —
 * a single editing session can scatter sites across multiple paragraphs
 * and only the by-id resolver walks every site.
 *
 * @example
 * ```ts
 * import { acceptChange } from '@eigenpal/docx-editor-core/prosemirror/commands';
 * acceptChange(from, to)(view.state, view.dispatch);
 * ```
 */
export function acceptChange(from: number, to: number): Command {
  return resolveChange(from, to, 'accept');
}

/**
 * Reject a tracked change at the given range.
 * - Insertion: remove mark AND text
 * - Deletion: remove mark, keep text
 *
 * Use {@link rejectChangeById} when rejecting a coalesced revision.
 */
export function rejectChange(from: number, to: number): Command {
  return resolveChange(from, to, 'reject');
}

/**
 * Walk the document and collect every distinct `revisionId` carried by
 * any tracked-change site: inline insertion/deletion marks, paragraph-
 * mark `pPrIns`/`pPrDel`, paragraph `pPrChange` entries, table row
 * `trIns`/`trDel`, row `trPrChange`, cell `cellMarker`/`tcPrChange`,
 * table `tblPrChange`. The ids are returned in document order; bare-id
 * (without author/date) is sufficient for the resolver since it walks
 * every matching site for each id.
 */
function collectAllRevisionIds(state: EditorState): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  const add = (id: unknown): void => {
    if (typeof id === 'number' && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  const insertionType = state.schema.marks.insertion;
  const deletionType = state.schema.marks.deletion;
  state.doc.descendants((node) => {
    // Paragraph-mark and paragraph-property revisions.
    if (node.type.name === 'paragraph') {
      add((node.attrs.pPrIns as { revisionId: number } | null)?.revisionId);
      add((node.attrs.pPrDel as { revisionId: number } | null)?.revisionId);
      const pPrChange = node.attrs.pPrChange as Array<{ info: { id: number } }> | null;
      if (Array.isArray(pPrChange)) for (const e of pPrChange) add(e.info.id);
    }
    // Table row revisions.
    if (node.type.name === 'tableRow') {
      add((node.attrs.trIns as { revisionId: number } | null)?.revisionId);
      add((node.attrs.trDel as { revisionId: number } | null)?.revisionId);
      const trPrChange = node.attrs.trPrChange as Array<{ info: { id: number } }> | null;
      if (Array.isArray(trPrChange)) for (const e of trPrChange) add(e.info.id);
    }
    // Table cell revisions.
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      const m = node.attrs.cellMarker as { info: { revisionId: number } } | null;
      add(m?.info?.revisionId);
      const tcPrChange = node.attrs.tcPrChange as Array<{ info: { id: number } }> | null;
      if (Array.isArray(tcPrChange)) for (const e of tcPrChange) add(e.info.id);
    }
    // Table-level revisions.
    if (node.type.name === 'table') {
      const tblPrChange = node.attrs.tblPrChange as Array<{ info: { id: number } }> | null;
      if (Array.isArray(tblPrChange)) for (const e of tblPrChange) add(e.info.id);
    }
    // Inline insertion/deletion marks (text and inline atoms like images).
    if (node.isInline) {
      for (const mark of node.marks) {
        if (
          (insertionType && mark.type === insertionType) ||
          (deletionType && mark.type === deletionType)
        ) {
          add(mark.attrs.revisionId);
        }
      }
    }
  });
  return ids;
}

/**
 * Accept every tracked change in the document — inline marks plus
 * structural revisions (paragraph-mark, row, cell, property changes).
 *
 * Dispatches one transaction per distinct `revisionId` so each revision
 * remains individually undoable. The acceptance order follows document
 * order; later transactions read fresh state and skip ids whose sites
 * were already removed.
 *
 * @example
 * ```ts
 * import { acceptAllChanges } from '@eigenpal/docx-editor-core/prosemirror/commands';
 * acceptAllChanges()(view.state, view.dispatch);
 * ```
 */
export function acceptAllChanges(): Command {
  return (state, dispatch) => {
    const ids = collectAllRevisionIds(state);
    if (ids.length === 0) return false;
    if (!dispatch) return true;
    // Dispatch each `resolveById` sequentially against the LATEST state
    // after the previous resolution applied. Each call produces its own
    // transaction (one undo step per revision id), matching Word's UX
    // where each accept is individually undoable.
    let lastState: EditorState = state;
    const capturingDispatch = (tr: Transaction) => {
      dispatch(tr);
      lastState = lastState.apply(tr);
    };
    for (const id of ids) {
      resolveById(id, 'accept')(lastState, capturingDispatch);
    }
    return true;
  };
}

/**
 * Reject all tracked changes in the document — inverse of `acceptAllChanges`.
 */
export function rejectAllChanges(): Command {
  return (state, dispatch) => {
    const ids = collectAllRevisionIds(state);
    if (ids.length === 0) return false;
    if (!dispatch) return true;
    let lastState: EditorState = state;
    const capturingDispatch = (tr: Transaction) => {
      dispatch(tr);
      lastState = lastState.apply(tr);
    };
    for (const id of ids) {
      resolveById(id, 'reject')(lastState, capturingDispatch);
    }
    return true;
  };
}

interface ChangeRange {
  from: number;
  to: number;
  type: 'insertion' | 'deletion';
}

/**
 * Find the next tracked-change range (inline insertion / deletion mark)
 * after `startPos`. Wraps to the document start when no later change is
 * found. Useful for "next change" / "previous change" toolbar buttons.
 *
 * Only walks inline marks — structural revisions (pPrIns / pPrDel / row
 * / cell) are not surfaced here. Use {@link extractTrackedChanges} for a
 * complete revision list.
 */
export function findNextChange(state: EditorState, startPos: number): ChangeRange | null {
  const insertionType = state.schema.marks.insertion;
  const deletionType = state.schema.marks.deletion;
  if (!insertionType && !deletionType) return null;

  let result: ChangeRange | null = null;

  state.doc.descendants((node, pos) => {
    if (result) return false;
    if (!node.isInline) return;
    if (pos + node.nodeSize <= startPos) return;

    for (const mark of node.marks) {
      if (mark.type === insertionType || mark.type === deletionType) {
        result = {
          from: Math.max(pos, startPos),
          to: pos + node.nodeSize,
          type: mark.type === insertionType ? 'insertion' : 'deletion',
        };
        return false;
      }
    }
  });

  // Wrap around (only once)
  if (!result && startPos > 0) {
    return findNextChange(state, 0);
  }

  return result;
}

// ============================================================================
// REVISION-ID-ADDRESSABLE COMMANDS (structural revisions on node attrs)
// ============================================================================

interface ParagraphMarkSite {
  /** Position immediately before the paragraph's open tag. */
  pos: number;
  /** The paragraph node carrying the revision attr. */
  // Kept as `any` here to avoid the Node import cycle; callers handle typing.
  node: import('prosemirror-model').Node;
  kind: 'pPrIns' | 'pPrDel';
}

interface ParagraphPropertyChangeSite {
  pos: number;
  node: import('prosemirror-model').Node;
  /** Index into the paragraph's `pPrChange` array (since multiple authors can stack). */
  entryIndex: number;
  /** The prior `ParagraphFormatting` snapshot from the matching entry. */
  prior: import('../../types/document').ParagraphFormatting | undefined;
  /** The post-change snapshot, when present — used to detect numbering the change added. */
  current: import('../../types/document').ParagraphFormatting | undefined;
}

interface TableRowSite {
  pos: number;
  node: import('prosemirror-model').Node;
  kind: 'trIns' | 'trDel';
}

interface TableCellMarkerSite {
  pos: number;
  node: import('prosemirror-model').Node;
  cellKind: 'ins' | 'del' | 'merge';
}

/**
 * Walk the document and collect every paragraph that carries a
 * `pPrIns` or `pPrDel` attr with the given revision id.
 */
function findParagraphMarkSites(state: EditorState, revisionId: number): ParagraphMarkSite[] {
  const sites: ParagraphMarkSite[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    const ins = node.attrs.pPrIns as { revisionId: number } | null;
    const del = node.attrs.pPrDel as { revisionId: number } | null;
    if (ins && ins.revisionId === revisionId) {
      sites.push({ pos, node, kind: 'pPrIns' });
    }
    if (del && del.revisionId === revisionId) {
      sites.push({ pos, node, kind: 'pPrDel' });
    }
  });
  return sites;
}

/**
 * Walk the document for paragraph nodes whose `pPrChange` array has an
 * entry with `info.id === revisionId`. Returns one site per matching entry
 * with the entry index for later mutation.
 */
function findParagraphPropertyChangeSites(
  state: EditorState,
  revisionId: number
): ParagraphPropertyChangeSite[] {
  const sites: ParagraphPropertyChangeSite[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    const changes = node.attrs.pPrChange as Array<{
      info: { id: number };
      previousFormatting?: unknown;
      currentFormatting?: unknown;
    }> | null;
    if (!Array.isArray(changes)) return;
    changes.forEach((entry, idx) => {
      // Defensive: skip malformed entries (no info, non-numeric id) so a
      // bad attr cannot crash the resolver.
      if (!entry?.info || typeof entry.info.id !== 'number') return;
      if (entry.info.id === revisionId) {
        sites.push({
          pos,
          node,
          entryIndex: idx,
          prior: entry.previousFormatting as
            | import('../../types/document').ParagraphFormatting
            | undefined,
          current: entry.currentFormatting as
            | import('../../types/document').ParagraphFormatting
            | undefined,
        });
      }
    });
  });
  return sites;
}

/** Find every inline `insertion`/`deletion` mark range with the given id. */
function findInlineMarkSites(
  state: EditorState,
  revisionId: number
): Array<{ from: number; to: number; markName: 'insertion' | 'deletion' }> {
  const sites: Array<{ from: number; to: number; markName: 'insertion' | 'deletion' }> = [];
  const insertionType = state.schema.marks.insertion;
  const deletionType = state.schema.marks.deletion;
  state.doc.descendants((node, pos) => {
    // Text AND inline atoms (image, shape) can carry tracked-change marks, so
    // rejecting an inserted picture removes it just like inserted text.
    if (!node.isInline) return;
    for (const mark of node.marks) {
      if (
        (insertionType && mark.type === insertionType) ||
        (deletionType && mark.type === deletionType)
      ) {
        if (mark.attrs.revisionId === revisionId) {
          const markName: 'insertion' | 'deletion' =
            mark.type === insertionType ? 'insertion' : 'deletion';
          // Coalesce contiguous siblings sharing the same id.
          const last = sites[sites.length - 1];
          if (last && last.markName === markName && last.to === pos) {
            last.to = pos + node.nodeSize;
          } else {
            sites.push({ from: pos, to: pos + node.nodeSize, markName });
          }
        }
      }
    }
  });
  return sites;
}

/**
 * Join paragraph at position `paraStart` (start-of-open-tag) with the
 * following sibling paragraph. The joined paragraph inherits the
 * SECOND paragraph's pPr (matches Word: the surviving mark wins). Both
 * paragraphs must exist; caller checks.
 */
function joinParagraphWithNext(
  tr: Transaction,
  paraStart: number,
  options: { inheritFromSecond: boolean }
): void {
  const para = tr.doc.nodeAt(paraStart);
  if (!para) return;
  const nextParaStart = paraStart + para.nodeSize;
  const nextPara = tr.doc.nodeAt(nextParaStart);
  if (!nextPara || nextPara.type.name !== 'paragraph') return;
  // Per-OOXML: rejecting a paragraph-mark insertion (or accepting a deletion)
  // collapses the boundary; the resulting paragraph's properties come from
  // the SECOND paragraph (the one whose mark survives the join).
  if (options.inheritFromSecond) {
    // Replace para's attrs with nextPara's attrs first, then join.
    tr.setNodeMarkup(paraStart, undefined, { ...nextPara.attrs, pPrIns: null, pPrDel: null });
  }
  // `tr.join(pos)` joins the block ending immediately before `pos` with
  // the block starting at `pos`. `nextParaStart` is between the two paragraphs.
  tr.join(nextParaStart);
}

/** Clear pPrIns/pPrDel attrs on the paragraph at `paraStart`. */
function clearParagraphMarkRevision(
  tr: Transaction,
  paraStart: number,
  kind: 'pPrIns' | 'pPrDel'
): void {
  const para = tr.doc.nodeAt(paraStart);
  if (!para) return;
  const newAttrs = { ...para.attrs };
  newAttrs[kind] = null;
  tr.setNodeMarkup(paraStart, undefined, newAttrs);
}

/**
 * Remove a `pPrChange` entry by array index from the paragraph at `paraStart`.
 * If the array becomes empty, the attr is set to `null` so PM treats it as
 * absent on save.
 */
function clearParagraphPropertyChangeEntry(
  tr: Transaction,
  paraStart: number,
  entryIndex: number
): void {
  const para = tr.doc.nodeAt(paraStart);
  if (!para) return;
  const existing = para.attrs.pPrChange as Array<unknown> | null;
  if (!Array.isArray(existing) || entryIndex < 0 || entryIndex >= existing.length) return;
  const next = existing.slice();
  next.splice(entryIndex, 1);
  tr.setNodeMarkup(paraStart, undefined, {
    ...para.attrs,
    pPrChange: next.length > 0 ? next : null,
  });
}

/**
 * Restore fields from a prior `ParagraphFormatting` snapshot onto the
 * paragraph's PM attrs. Only the user-visible fields are copied — anything
 * not in `prior` is left untouched.
 */
function applyPriorParagraphFormattingToAttrs(
  attrs: Record<string, unknown>,
  prior: import('../../types/document').ParagraphFormatting,
  current?: import('../../types/document').ParagraphFormatting
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...attrs };
  // Only fields whose PM-attr shape matches the model `ParagraphFormatting`
  // shape are safe to copy verbatim. Specifically EXCLUDED:
  //
  //   - `borders` — model is `{ top?: BorderSpec, ... }`, PM attr same
  //     shape — IS safe and IS included below.
  //   - `shading` — same shape — IS safe.
  //   - `tabs` — model `TabStop[]`, PM same — IS safe.
  //   - `numPr` — model `{ numId?, ilvl? }`, PM same — IS safe.
  //   - `frame` — model `FrameProperties`; PM has no equivalent attr —
  //     SKIPPED.
  //   - `runProperties` — model rPr; PM uses resolved `defaultTextFormatting`
  //     via a style cascade — SKIPPED (would overwrite resolved data).
  //   - `widowControl`, `suppressLineNumbers`, `suppressAutoHyphens` — model
  //     has them but PM does not surface as attrs — SKIPPED until plumbed.
  //
  // Fields below are confirmed congruent in both shapes. Adding a new
  // ParagraphFormatting field requires verifying its PM attr shape (see
  // `packages/core/src/prosemirror/schema/nodes.ts`'s ParagraphAttrs).
  const fields: Array<keyof import('../../types/document').ParagraphFormatting> = [
    'alignment',
    'spaceBefore',
    'spaceAfter',
    'lineSpacing',
    'lineSpacingRule',
    'beforeAutospacing',
    'afterAutospacing',
    'spacingExplicit',
    'indentLeft',
    'indentRight',
    'indentFirstLine',
    'hangingIndent',
    'styleId',
    'borders',
    'shading',
    'tabs',
    'pageBreakBefore',
    'keepNext',
    'keepLines',
    'contextualSpacing',
    'bidi',
    'outlineLevel',
    'numPr',
  ];
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(prior, f)) {
      next[f as string] = prior[f] ?? null;
    }
  }
  // Numbering added by the change must be removed on reject. When `prior` has
  // no `numPr` the loop above leaves the current numbering in place — correct
  // for an unrelated property change (e.g. alignment) on a list item, but
  // wrong when THIS change is what introduced the numbering. Disambiguate via
  // `current`: if the post-change snapshot carried `numPr` and the prior did
  // not, the numbering was part of the change, so clear it. This is the path a
  // list-creation suggestion takes after a save/reload, where the empty prior
  // `<w:pPr/>` round-trips without a `numPr` key (issue #634).
  if (current?.numPr && !Object.prototype.hasOwnProperty.call(prior, 'numPr')) {
    next.numPr = null;
  }
  // Keep the render-only list attrs consistent with `numPr`: once numbering is
  // gone, the bullet/format/marker hints must go too, or a stale glyph lingers.
  if (next.numPr == null) {
    next.listIsBullet = null;
    next.listNumFmt = null;
    next.listMarker = null;
  }
  return next;
}

/**
 * Resolve every site sharing a revision id in one PM transaction. Bypass
 * the suggesting-mode keymap (we're applying, not authoring).
 *
 * Per-marker semantics (see openspec/changes/tracked-structural-changes):
 *   accept pPrIns → clear marker, keep split.
 *   reject pPrIns → join with following paragraph; result inherits second's pPr.
 *   accept pPrDel → join with following paragraph; result inherits second's pPr.
 *   reject pPrDel → clear marker, keep split.
 *   accept insertion mark → keep text, drop mark.
 *   reject insertion mark → remove text and mark.
 *   accept deletion mark → remove text and mark.
 *   reject deletion mark → keep text, drop mark.
 */
/** Find every table row carrying `trIns` or `trDel` with the given id. */
function findTableRowSites(state: EditorState, revisionId: number): TableRowSite[] {
  const sites: TableRowSite[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'tableRow') return;
    const ins = node.attrs.trIns as { revisionId: number } | null;
    const del = node.attrs.trDel as { revisionId: number } | null;
    if (ins && ins.revisionId === revisionId) sites.push({ pos, node, kind: 'trIns' });
    if (del && del.revisionId === revisionId) sites.push({ pos, node, kind: 'trDel' });
  });
  return sites;
}

/** Find every table cell carrying `cellMarker` with the given id. */
function findTableCellMarkerSites(state: EditorState, revisionId: number): TableCellMarkerSite[] {
  const sites: TableCellMarkerSite[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'tableCell' && node.type.name !== 'tableHeader') return;
    const m = node.attrs.cellMarker as {
      kind: 'ins' | 'del' | 'merge';
      info: { revisionId: number };
    } | null;
    if (m?.info?.revisionId === revisionId) {
      sites.push({ pos, node, cellKind: m.kind });
    }
  });
  return sites;
}

function resolveById(revisionId: number, mode: 'accept' | 'reject'): Command {
  return (state, dispatch) => {
    const paragraphMarkSites = findParagraphMarkSites(state, revisionId);
    const inlineSites = findInlineMarkSites(state, revisionId);
    const propChangeSites = findParagraphPropertyChangeSites(state, revisionId);
    const tableRowSites = findTableRowSites(state, revisionId);
    const tableCellSites = findTableCellMarkerSites(state, revisionId);
    if (
      paragraphMarkSites.length === 0 &&
      inlineSites.length === 0 &&
      propChangeSites.length === 0 &&
      tableRowSites.length === 0 &&
      tableCellSites.length === 0
    ) {
      return false;
    }

    if (!dispatch) return true;

    const tr = state.tr;
    tr.setMeta(SUGGESTION_BYPASS_META, true);

    // Process inline marks FIRST (positions still valid in original doc), in
    // reverse order so deletions don't shift earlier positions.
    const insertionType = state.schema.marks.insertion;
    const deletionType = state.schema.marks.deletion;
    const sortedInline = [...inlineSites].sort((a, b) => b.from - a.from);
    for (const site of sortedInline) {
      const isInsertion = site.markName === 'insertion';
      const removeText = (mode === 'accept' && !isInsertion) || (mode === 'reject' && isInsertion);
      if (removeText) {
        tr.delete(site.from, site.to);
      } else {
        const markType = isInsertion ? insertionType : deletionType;
        if (markType) tr.removeMark(site.from, site.to, markType);
      }
    }

    // Then process paragraph-mark revisions. Process in reverse position order
    // so earlier-positioned joins don't shift later sites. Track resolved
    // positions through tr.mapping.
    const sortedPara = [...paragraphMarkSites].sort((a, b) => b.pos - a.pos);
    for (const site of sortedPara) {
      const mappedPos = tr.mapping.map(site.pos);
      const liveNode = tr.doc.nodeAt(mappedPos);
      if (!liveNode || liveNode.type.name !== 'paragraph') continue;
      // Re-confirm the revision is still on the live node (inline-mark
      // deletions above may have removed text but won't have removed the
      // paragraph attrs).
      const stillHasIns =
        site.kind === 'pPrIns' &&
        (liveNode.attrs.pPrIns as { revisionId: number } | null)?.revisionId === revisionId;
      const stillHasDel =
        site.kind === 'pPrDel' &&
        (liveNode.attrs.pPrDel as { revisionId: number } | null)?.revisionId === revisionId;
      if (!stillHasIns && !stillHasDel) continue;

      const shouldJoin =
        (mode === 'reject' && site.kind === 'pPrIns') ||
        (mode === 'accept' && site.kind === 'pPrDel');

      if (shouldJoin) {
        // No following paragraph → just clear the marker (last-paragraph edge case).
        const liveParaEnd = mappedPos + liveNode.nodeSize;
        const after = tr.doc.nodeAt(liveParaEnd);
        if (!after || after.type.name !== 'paragraph') {
          clearParagraphMarkRevision(tr, mappedPos, site.kind);
        } else {
          // Clear our marker first, then perform the join inheriting the
          // second paragraph's pPr.
          clearParagraphMarkRevision(tr, mappedPos, site.kind);
          joinParagraphWithNext(tr, mappedPos, { inheritFromSecond: true });
        }
      } else {
        clearParagraphMarkRevision(tr, mappedPos, site.kind);
      }
    }

    // Finally, paragraph-property changes. Accept clears the matching entry
    // (current props win). Reject restores the entry's `prior` fields onto
    // the paragraph's attrs and clears the entry.
    const sortedPropChanges = [...propChangeSites].sort((a, b) => b.pos - a.pos);
    for (const site of sortedPropChanges) {
      const mappedPos = tr.mapping.map(site.pos);
      const liveNode = tr.doc.nodeAt(mappedPos);
      if (!liveNode || liveNode.type.name !== 'paragraph') continue;
      const liveChanges = liveNode.attrs.pPrChange as Array<{ info: { id: number } }> | null;
      if (!Array.isArray(liveChanges)) continue;
      const liveIndex = liveChanges.findIndex((e) => e.info.id === revisionId);
      if (liveIndex < 0) continue;

      if (mode === 'reject' && site.prior) {
        // Restore prior fields BEFORE clearing the entry so we don't lose
        // the snapshot in the intermediate state. `current` lets the restore
        // detect (and clear) numbering the change introduced.
        const restored = applyPriorParagraphFormattingToAttrs(
          liveNode.attrs,
          site.prior,
          site.current
        );
        const nextChanges = liveChanges.slice();
        nextChanges.splice(liveIndex, 1);
        tr.setNodeMarkup(mappedPos, undefined, {
          ...restored,
          pPrChange: nextChanges.length > 0 ? nextChanges : null,
        });
      } else {
        clearParagraphPropertyChangeEntry(tr, mappedPos, liveIndex);
      }
    }

    // Table-cell markers (cellIns / cellDel / cellMerge).
    //   accept ins  → clear marker (cell stays in its new form)
    //   reject ins  → clear marker (Phase 2c: should delete the cell;
    //                 mid-grid cell removal requires prosemirror-tables
    //                 grid surgery and is deferred)
    //   accept del  → clear marker (Phase 2c: should delete the cell)
    //   reject del  → clear marker (cell stays)
    //   accept/reject merge → clear marker
    // Clear-only is non-destructive in every mode and gets the cell into a
    // "marker resolved" state. The structural mutation lives in the
    // suggesting-aware path on the next slice.
    const sortedCells = [...tableCellSites].sort((a, b) => b.pos - a.pos);
    for (const site of sortedCells) {
      const mappedPos = tr.mapping.map(site.pos);
      const live = tr.doc.nodeAt(mappedPos);
      if (!live || (live.type.name !== 'tableCell' && live.type.name !== 'tableHeader')) continue;
      const m = live.attrs.cellMarker as {
        kind: 'ins' | 'del' | 'merge';
        info: { revisionId: number };
      } | null;
      if (!m || m.info.revisionId !== revisionId) continue;
      tr.setNodeMarkup(mappedPos, undefined, { ...live.attrs, cellMarker: null });
    }

    // Table-row markers (trIns / trDel). Per Word's accept/reject semantics:
    //   accept trIns  → clear marker (the row stays as a real row)
    //   reject trIns  → delete the row (rolls back the insertion)
    //   accept trDel  → delete the row (confirms the deletion)
    //   reject trDel  → clear marker (the row stays)
    // Reverse-position order so an earlier row's removal doesn't shift the
    // mapped position of later sites in the same transaction. If the row
    // is the only row in its table, the entire table is removed (PM-tables
    // requires at least one row per table).
    const sortedRows = [...tableRowSites].sort((a, b) => b.pos - a.pos);
    for (const site of sortedRows) {
      const mappedPos = tr.mapping.map(site.pos);
      const live = tr.doc.nodeAt(mappedPos);
      if (!live || live.type.name !== 'tableRow') continue;
      const trIns = live.attrs.trIns as { revisionId: number } | null;
      const trDel = live.attrs.trDel as { revisionId: number } | null;
      const hasIns = trIns?.revisionId === revisionId;
      const hasDel = trDel?.revisionId === revisionId;
      if (!hasIns && !hasDel) continue;

      const removeRow = (mode === 'reject' && hasIns) || (mode === 'accept' && hasDel);

      if (removeRow) {
        // Walk back from the row's position to find its parent table.
        // `tr.doc.resolve(mappedPos).node()` returns the parent at that
        // depth; for a tableRow that's the table.
        const $row = tr.doc.resolve(mappedPos + 1);
        const parentTable = $row.node($row.depth - 1);
        const parentTableStart = $row.before($row.depth - 1);
        if (parentTable?.type.name === 'table' && parentTable.childCount > 1) {
          tr.delete(mappedPos, mappedPos + live.nodeSize);
        } else if (parentTable?.type.name === 'table') {
          // Single-row table — remove the whole table. If the table is the
          // only child of its parent (e.g., the only block in the doc),
          // replace with an empty paragraph so the parent's `+` content
          // constraint stays satisfied. Otherwise the apply would throw.
          const $table = tr.doc.resolve(parentTableStart);
          const isOnlyChild = $table.parent.childCount === 1;
          if (isOnlyChild) {
            const paraType = tr.doc.type.schema.nodes.paragraph;
            tr.replaceWith(
              parentTableStart,
              parentTableStart + parentTable.nodeSize,
              paraType.create()
            );
          } else {
            tr.delete(parentTableStart, parentTableStart + parentTable.nodeSize);
          }
        } else {
          // Defensive: parent isn't a table (shouldn't happen). Fall back
          // to clearing the marker.
          const newAttrs = { ...live.attrs };
          if (hasIns) newAttrs.trIns = null;
          if (hasDel) newAttrs.trDel = null;
          tr.setNodeMarkup(mappedPos, undefined, newAttrs);
        }
      } else {
        const newAttrs = { ...live.attrs };
        if (hasIns) newAttrs.trIns = null;
        if (hasDel) newAttrs.trDel = null;
        tr.setNodeMarkup(mappedPos, undefined, newAttrs);
      }
    }

    if (tr.steps.length === 0) return false;
    dispatch(tr);
    return true;
  };
}

/**
 * Accept every site of a tracked revision in one PM transaction. Walks
 * the doc for all sites carrying `revisionId` — inline insertion/
 * deletion marks, paragraph-mark `pPrIns` / `pPrDel`, paragraph
 * property changes, table row / cell / table revisions — and applies
 * the accept semantics each requires.
 *
 * This is the right command for any coalesced revision (Enter chains,
 * replace pairs, multi-paragraph runs) because one editing session can
 * scatter sites across the doc; the range-based {@link acceptChange}
 * only clears sites within its `(from, to)`.
 *
 * Returns `false` (no-op) if the id is not present.
 *
 * @example
 * ```ts
 * import { acceptChangeById } from '@eigenpal/docx-editor-core/prosemirror/commands';
 * acceptChangeById(revisionId)(view.state, view.dispatch);
 * ```
 */
export function acceptChangeById(revisionId: number): Command {
  return resolveById(revisionId, 'accept');
}

/**
 * Reject every site of a tracked revision in one PM transaction.
 * Inverse of {@link acceptChangeById} — inserts are removed, deletions
 * keep their text, paragraph-mark insertions join paragraphs back,
 * paragraph-mark deletions stay split, paragraph property changes
 * restore prior values, and tracked row insertions are removed.
 */
export function rejectChangeById(revisionId: number): Command {
  return resolveById(revisionId, 'reject');
}

/**
 * Find the previous tracked-change range (inline insertion / deletion
 * mark) before `startPos`. Wraps to the document end when no earlier
 * change is found. Counterpart to {@link findNextChange}.
 */
export function findPreviousChange(state: EditorState, startPos: number): ChangeRange | null {
  const insertionType = state.schema.marks.insertion;
  const deletionType = state.schema.marks.deletion;
  if (!insertionType && !deletionType) return null;

  let result: ChangeRange | null = null;

  state.doc.descendants((node, pos) => {
    if (!node.isInline) return;
    if (pos >= startPos) return false;

    for (const mark of node.marks) {
      if (mark.type === insertionType || mark.type === deletionType) {
        result = {
          from: pos,
          to: pos + node.nodeSize,
          type: mark.type === insertionType ? 'insertion' : 'deletion',
        };
      }
    }
  });

  // Wrap around (only once — guard prevents infinite recursion)
  if (!result && startPos < state.doc.content.size) {
    return findPreviousChange(state, state.doc.content.size);
  }

  return result;
}
