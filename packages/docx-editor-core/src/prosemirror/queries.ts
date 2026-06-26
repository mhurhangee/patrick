/**
 * Pure ref-API query helpers — read-only inspectors over the PM document
 * and the paginated layout. Back the adapters' `findInDocument`,
 * `getSelectionInfo`, and `getPageContent` ref methods.
 *
 * Every function takes the PM view (or layout + view) as a parameter
 * instead of closing over a framework ref, so the React and Vue adapters
 * (and the future vanilla wrapper) share one implementation.
 */

import type { EditorView } from 'prosemirror-view';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Layout } from '../layout-engine';
import { getVanillaNodeText, getVanillaTextBetween } from './paraText';
import { extractTrackedChanges } from './utils/extractTrackedChanges';

/** A resolved PM position range — half-open `[from, to)` in PM coordinates. */
export interface PmRange {
  from: number;
  to: number;
}

/**
 * Clamp a caller-supplied `[from, to]` range to a valid in-document span, or
 * return `null` when it cannot be made valid: non-integer, negative, reversed
 * (`to < from`), or a `from` past the document end. `to` is clamped to the
 * document size so an out-of-range end never makes `doc.resolve()` throw a
 * `RangeError`. Both adapters' `highlightRange` route raw caller positions
 * through this so the no-op contract holds identically.
 */
export function clampRangeToDoc(doc: ProseMirrorNode, from: number, to: number): PmRange | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) return null;
  const max = doc.content.size;
  if (from > max) return null;
  return { from, to: Math.min(to, max) };
}

/**
 * Resolve a `commentId` to the PM position range its `comment` mark
 * spans. Walks every inline node carrying a `comment` mark with the
 * matching id and returns the union range (earliest start → latest end),
 * so a comment whose range is interrupted by un-marked inline atoms still
 * resolves to a single span. Returns `null` when the id is no longer
 * present (the comment was deleted, or the marked text was removed) — the
 * caller distinguishes "scrolled" from "stale" on that signal.
 *
 * Pure read over `view.state`; no dispatch.
 */
export function findCommentRange(view: EditorView | null, commentId: number): PmRange | null {
  if (!view) return null;
  const commentType = view.state.schema.marks.comment;
  if (!commentType) return null;
  let from = Infinity;
  let to = -Infinity;
  view.state.doc.descendants((node, pos) => {
    if (!node.isInline) return;
    for (const mark of node.marks) {
      if (mark.type === commentType && mark.attrs.commentId === commentId) {
        from = Math.min(from, pos);
        to = Math.max(to, pos + node.nodeSize);
      }
    }
  });
  if (to < 0) return null;
  return { from, to };
}

/**
 * Resolve a tracked-change `revisionId` to the PM position range of its
 * first site. Delegates to {@link extractTrackedChanges} so a coalesced
 * revision (sites scattered across paragraphs, replace pairs, Enter
 * chains) resolves to the same entry the sidebar shows. Matches on the
 * entry's primary `revisionId`, its `insertionRevisionId`, or any
 * `coalescedRevisionIds` member. Returns `null` when no entry carries the
 * id (the change was accepted/rejected/deleted) — the caller uses this to
 * show a "location no longer exists" affordance instead of a silent
 * no-op.
 *
 * Pure read over `view.state`; no dispatch.
 */
export function findChangeRange(view: EditorView | null, revisionId: number): PmRange | null {
  if (!view) return null;
  const { entries } = extractTrackedChanges(view.state);
  const entry = entries.find(
    (e) =>
      e.revisionId === revisionId ||
      e.insertionRevisionId === revisionId ||
      e.coalescedRevisionIds?.includes(revisionId)
  );
  if (!entry) return null;
  return { from: entry.from, to: entry.to };
}

export interface FindInDocumentMatch {
  paraId: string;
  match: string;
  before: string;
  after: string;
}

/**
 * Walk the PM doc looking for `query`. Returns up to `limit` matches —
 * one per paragraph (rejects paragraphs where the query appears more
 * than once, mirroring `findTextInPmParagraph`'s ambiguity guard so the
 * LLM gets a clearer error than a silent mistarget).
 */
export function findInDocument(
  view: EditorView | null,
  query: string,
  opts?: { caseSensitive?: boolean; limit?: number }
): FindInDocumentMatch[] {
  if (!view || !query) return [];
  const caseSensitive = opts?.caseSensitive ?? false;
  const limit = opts?.limit ?? 20;
  const needle = caseSensitive ? query : query.toLowerCase();
  const results: FindInDocumentMatch[] = [];

  view.state.doc.descendants((node) => {
    if (results.length >= limit) return false;
    if (!node.isTextblock) return true;
    const paraId = node.attrs?.paraId as string | undefined;
    if (!paraId) return false;
    const text = getVanillaNodeText(node);
    const haystack = caseSensitive ? text : text.toLowerCase();
    const at = haystack.indexOf(needle);
    // Reject not-found and ambiguous (more than one match) — agent narrows query.
    if (at === -1 || haystack.indexOf(needle, at + 1) !== -1) return false;
    const context = 40;
    results.push({
      paraId,
      match: text.slice(at, at + query.length),
      before: text.slice(Math.max(0, at - context), at),
      after: text.slice(at + query.length, at + query.length + context),
    });
    return false;
  });

  return results;
}

export interface SelectionInfo {
  paraId: string | null;
  selectedText: string;
  paragraphText: string;
  before: string;
  after: string;
}

/**
 * Describe the current selection in agent-readable form — paraId of the
 * containing paragraph, the selected text, the full paragraph text, and
 * the leading/trailing slices. Vanilla view: insertion-marked text never
 * appears, matching what the agent reads and can anchor against.
 */
export function getSelectionInfo(view: EditorView | null): SelectionInfo | null {
  if (!view) return null;
  const { selection, doc } = view.state;
  const $from = selection.$from;
  let depth = $from.depth;
  while (depth > 0 && !$from.node(depth).isTextblock) depth--;
  const para = depth > 0 ? $from.node(depth) : null;
  if (!para) return null;
  const paraId = (para.attrs?.paraId as string | undefined) ?? null;
  const paraStart = $from.start(depth);
  const paraEnd = paraStart + para.content.size;
  const before = getVanillaTextBetween(doc, paraStart, selection.from);
  const selectedText = getVanillaTextBetween(doc, selection.from, selection.to);
  const after = getVanillaTextBetween(doc, selection.to, paraEnd);
  return { paraId, selectedText, paragraphText: before + selectedText + after, before, after };
}

export interface PageContent {
  pageNumber: number;
  text: string;
  paragraphs: Array<{ paraId: string; text: string; styleId?: string }>;
}

/**
 * Collect paragraphs visible on `pageNumber` (1-indexed) from the
 * paginated `layout`. Dedupes by paraId so paragraphs split across page
 * boundaries are reported once.
 */
export function getPageContent(
  view: EditorView | null,
  layout: Layout | null,
  pageNumber: number
): PageContent | null {
  if (!layout || !view) return null;
  const page = layout.pages[pageNumber - 1];
  if (!page) return null;

  const seen = new Set<string>();
  const paragraphs: PageContent['paragraphs'] = [];
  for (const fragment of page.fragments) {
    if (fragment.kind !== 'paragraph') continue;
    const pmStart = fragment.pmStart;
    if (pmStart == null) continue;
    const node = view.state.doc.nodeAt(pmStart);
    if (!node || !node.isTextblock) continue;
    const paraId = node.attrs?.paraId as string | undefined;
    if (!paraId || seen.has(paraId)) continue;
    seen.add(paraId);
    paragraphs.push({
      paraId,
      text: getVanillaNodeText(node),
      styleId: (node.attrs?.styleId as string | undefined) ?? undefined,
    });
  }

  const text = paragraphs.map((paragraph) => `[${paragraph.paraId}] ${paragraph.text}`).join('\n');
  return { pageNumber, text, paragraphs };
}
