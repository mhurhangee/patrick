/**
 * Adjacency lookups used by every suggesting-mode handler to coalesce
 * consecutive edits into one revisionId. Looks for an existing mark of
 * the same kind + author either touching the cursor or in a neighboring
 * block — the cross-block lookup is what makes "type, Enter, type" share
 * one revisionId even though Enter splits the parent.
 */

import type { Node as PMNode } from 'prosemirror-model';

import { projectMarkAttrs } from './markAttrs';
import type { MarkAttrs } from './state';

/**
 * Find the first text node inside `block` that carries a mark of the given
 * type by the given author. Walks all text nodes — needed when a paragraph
 * contains BOTH a deletion and an insertion (replace operation) and the
 * caller wants whichever matches the target mark type. Returning just the
 * first or last text would silently miss the matching one in that case.
 */
export function findMarkedTextIn(
  block: PMNode,
  markTypeName: string,
  author: string
): MarkAttrs | null {
  let hit: MarkAttrs | null = null;
  block.descendants((node) => {
    if (hit) return false;
    if (!node.isText) return true;
    const mark = node.marks.find((m) => m.type.name === markTypeName && m.attrs.author === author);
    if (mark) {
      hit = projectMarkAttrs(mark.attrs);
      return false;
    }
    return true;
  });
  return hit;
}

/**
 * Find an adjacent mark of the same type by the same author.
 * Reuses its revisionId so consecutive edits group into one change.
 *
 * Looks in three places, in this priority order:
 *   1. `$pos.nodeBefore` / `nodeAfter` (same parent — handles in-block typing)
 *   2. Last text node of the previous block when at a block start
 *   3. First text node of the next block when at a block end
 *
 * Cross-block lookup is what makes "type abc, Enter, type def" coalesce
 * into one tracked change even though Enter splits the parent.
 */
export function findAdjacentRevision(
  doc: PMNode,
  pos: number,
  markTypeName: string,
  author: string
): MarkAttrs | null {
  const matches = (node: PMNode | null | undefined): MarkAttrs | null => {
    if (!node?.isText) return null;
    const mark = node.marks.find((m) => m.type.name === markTypeName && m.attrs.author === author);
    return mark ? projectMarkAttrs(mark.attrs) : null;
  };
  try {
    const $pos = doc.resolve(pos);
    for (const node of [$pos.nodeBefore, $pos.nodeAfter]) {
      const hit = matches(node);
      if (hit) return hit;
    }
    // Cross-block: at a block boundary, scan the neighboring block for ANY
    // text node carrying the matching mark+author. Using first/lastTextOf
    // alone would miss the case where the boundary text node is the wrong
    // mark type (e.g. previous block ends with a tracked deletion but
    // also contains an insertion earlier on — a replace operation).
    if ($pos.parentOffset === 0 && $pos.depth > 0) {
      const blockStart = $pos.before($pos.depth);
      if (blockStart > 0) {
        const prevBlock = doc.resolve(blockStart).nodeBefore;
        if (prevBlock) {
          const hit = findMarkedTextIn(prevBlock, markTypeName, author);
          if (hit) return hit;
        }
      }
    }
    if ($pos.parentOffset === $pos.parent.content.size && $pos.depth > 0) {
      const blockEnd = $pos.after($pos.depth);
      const nextBlock = doc.resolve(blockEnd).nodeAfter;
      if (nextBlock) {
        const hit = findMarkedTextIn(nextBlock, markTypeName, author);
        if (hit) return hit;
      }
    }
    // Typing inside a tracked-inserted cell — inherit the cell's
    // `cellMarker` revision so the cell content folds into the
    // surrounding "Inserted table" entry. Without this, every typing
    // session inside a freshly tracked table mints a new revisionId
    // and the user sees a separate card per cell. Same idea for
    // tracked-deleted cells.
    if (markTypeName === 'insertion' || markTypeName === 'deletion') {
      const wantedKind = markTypeName === 'insertion' ? 'ins' : 'del';
      for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d);
        const isCell = node.type.name === 'tableCell' || node.type.name === 'tableHeader';
        if (!isCell) continue;
        const marker = node.attrs.cellMarker as {
          kind: 'ins' | 'del' | 'merge';
          info: MarkAttrs;
        } | null;
        if (marker && marker.kind === wantedKind && marker.info && marker.info.author === author) {
          return projectMarkAttrs(marker.info as unknown as Record<string, unknown>);
        }
        break; // only check the immediate parent cell
      }
    }
  } catch {
    /* position out of range */
  }
  return null;
}

/**
 * Find an adjacent revision at either edge of a range.
 * This keeps consecutive backspaces grouped even though the cursor moves left.
 */
export function findAdjacentRevisionForRange(
  doc: PMNode,
  from: number,
  to: number,
  markTypeName: string,
  author: string
): MarkAttrs | null {
  return (
    findAdjacentRevision(doc, from, markTypeName, author) ??
    findAdjacentRevision(doc, to, markTypeName, author)
  );
}

/**
 * Find a `pPrIns`/`pPrDel` revision on a paragraph adjacent to `paraStart`
 * carried by the same author. Used to coalesce consecutive Enter / Backspace
 * presses into one tracked change so the sidebar shows a single card and
 * a single Accept resolves the whole run (matches Word's grouping).
 *
 * `attr` selects which paragraph-mark attr to look for; the lookup checks
 * BOTH the previous and next paragraph since a new pPrIns may sit either
 * side of an existing run depending on cursor position.
 */
export function findAdjacentParagraphMark(
  doc: PMNode,
  paraStart: number,
  attr: 'pPrIns' | 'pPrDel',
  author: string
): MarkAttrs | null {
  // The inline mark that pairs with this paragraph-mark attr — pPrIns lives
  // in the same conceptual change as inline `insertion` marks, pPrDel with
  // inline `deletion` marks. Sharing revisionIds across paragraph-mark and
  // adjacent inline marks lets one Accept resolve a whole editing run.
  const inlineMarkName = attr === 'pPrIns' ? 'insertion' : 'deletion';
  try {
    const $pos = doc.resolve(paraStart);
    // Sibling paragraph carrying the same paragraph-mark attr.
    for (const node of [$pos.nodeBefore, $pos.nodeAfter]) {
      if (node?.type.name !== 'paragraph') continue;
      const existing = node.attrs[attr] as MarkAttrs | null;
      if (existing && existing.author === author) return existing;
    }
    // Inline mark by the same author anywhere in the previous or current
    // paragraph. Walk all text nodes (not just first/last) so a paragraph
    // that contains BOTH a deletion and an insertion (replace operation)
    // still surfaces the matching mark — lastTextOf might land on a
    // deletion when we need the insertion, and vice versa.
    const prev = $pos.nodeBefore;
    if (prev?.type.name === 'paragraph') {
      const hit = findMarkedTextIn(prev, inlineMarkName, author);
      if (hit) return hit;
    }
    const next = $pos.nodeAfter;
    if (next?.type.name === 'paragraph') {
      const hit = findMarkedTextIn(next, inlineMarkName, author);
      if (hit) return hit;
    }
  } catch {
    /* paragraph at start/end of doc */
  }
  return null;
}
