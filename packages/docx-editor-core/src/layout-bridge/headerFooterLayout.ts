/**
 * Header / Footer Layout Utilities
 *
 * The header/footer rendering pipeline lives here so any rendering adapter
 * (React, Vue, etc.) can share the conversion logic and just supply its
 * platform-specific {@link MeasureBlocksFn}. Mirrors the footnote pipeline
 * in `footnoteLayout.ts`.
 *
 * Pipeline:
 *   HF.content → headerFooterToProseDoc → toFlowBlocks
 *     → measureBlocks (caller-supplied, Canvas-aware)
 *     → HeaderFooterContent (blocks, measures, height, visualTop/Bottom)
 *
 * The render side uses the normalized block list so paint and measurement stay
 * in lockstep. Visual-bounds calculation still inspects the original block
 * list because floating images can paint above/below the nominal flow box even
 * when they do not contribute to flow height.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { FlowBlock, ImageRun, Measure, PageMargins, TableBlock } from '../layout-engine/types';
import type { HeaderFooter, StyleDefinitions, Theme } from '../types/document';
import type { HeaderFooterContent } from '../layout-painter/renderPage';
import { headerFooterToProseDoc } from '../prosemirror/conversion/toProseDoc';
import { emuToPixels } from '../utils/units';
import { toFlowBlocks } from './toFlowBlocks';
import type { MeasureBlocksFn } from './footnoteLayout';

// ============================================================================
// 1. Page-level metrics passed in by the caller
// ============================================================================

export type HeaderFooterMetrics = {
  section: 'header' | 'footer';
  pageSize: { w: number; h: number };
  margins: PageMargins;
};

// ============================================================================
// 2. Measurement-time block normalization
// ============================================================================
//
// Two transforms are applied to the FlowBlock list before measurement/render:
//
// 1. **Strip style-inherited paragraph spacing** (#380) — Word visibly
//    does NOT honor inherited `spaceBefore` / `spaceAfter` (e.g. Normal's
//    default 8pt-after) inside the HF text frame. Inline `<w:spacing>`
//    set explicitly on the HF paragraph IS honored. The parser flags
//    inline spacing via `spacingExplicit.before` / `.after`; anything
//    not flagged was inherited from the style chain and is zeroed for
//    both measurement and painting.
//
// 2. **Zero trailing empty paragraph after a table** (#381) — OOXML
//    requires a trailing block-level element after the last `<w:tbl>`
//    in any block container, including `<w:hdr>` / `<w:ftr>`. Word
//    renders that empty paragraph as a zero-height anchor (just the
//    paragraph mark glyph) when it has no runs AND no authored visual
//    content (no paragraph borders, no explicit spacing). We mark its
//    measure with `suppressEmptyParagraphHeight` so the BLOCK survives
//    (click-to-position into the empty space below the table places
//    the cursor in the trailing paragraph, matching Word) but the
//    measure returns zero height. Empty paragraphs with authored
//    `pBdr` (e.g. a horizontal rule under the header) or
//    `spacingExplicit` are NOT suppressed — they exist for their
//    visual side effect, not just as a structural anchor.

function hasAuthoredVisualContent(block: FlowBlock): boolean {
  if (block.kind !== 'paragraph') return false;
  const attrs = block.attrs;
  if (!attrs) return false;
  if (attrs.borders?.top || attrs.borders?.bottom) return true;
  if (attrs.spacingExplicit?.before || attrs.spacingExplicit?.after) return true;
  return false;
}

export function normalizeHeaderFooterMeasureBlocks(blocks: FlowBlock[]): FlowBlock[] {
  return normalizeFlowBlockArray(blocks);
}

function normalizeFlowBlockArray(blocks: FlowBlock[]): FlowBlock[] {
  const trailingEmptyAfterTable = new Set<number>();
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1];
    const cur = blocks[i];
    if (prev.kind !== 'table') continue;
    if (cur.kind !== 'paragraph') continue;
    if (cur.runs.length > 0) continue;
    if (hasAuthoredVisualContent(cur)) continue;
    trailingEmptyAfterTable.add(i);
  }

  return blocks.map((block, index) => {
    if (block.kind === 'table') {
      return normalizeTableBlock(block);
    }
    if (block.kind !== 'paragraph') return block;

    const isTrailingEmpty = trailingEmptyAfterTable.has(index);

    const explicit = block.attrs?.spacingExplicit;
    const hasResolvedBefore = block.attrs?.spacing?.before != null;
    const hasResolvedAfter = block.attrs?.spacing?.after != null;
    const beforeIsInherited = hasResolvedBefore && !explicit?.before;
    const afterIsInherited = hasResolvedAfter && !explicit?.after;
    const stripsSpacing = beforeIsInherited || afterIsInherited;

    if (!stripsSpacing && !isTrailingEmpty) return block;

    let attrs = block.attrs;
    if (stripsSpacing && attrs?.spacing) {
      attrs = {
        ...attrs,
        spacing: {
          ...attrs.spacing,
          before: explicit?.before ? attrs.spacing.before : undefined,
          after: explicit?.after ? attrs.spacing.after : undefined,
        },
      };
    }

    if (isTrailingEmpty) {
      attrs = { ...(attrs ?? {}), suppressEmptyParagraphHeight: true };
    }

    return { ...block, attrs };
  });
}

function normalizeTableBlock(block: TableBlock): TableBlock {
  let changed = false;
  const rows = block.rows.map((row) => {
    let rowChanged = false;
    const cells = row.cells.map((cell) => {
      const normalizedBlocks = normalizeFlowBlockArray(cell.blocks);
      const cellChanged = normalizedBlocks.some(
        (normalizedBlock, idx) => normalizedBlock !== cell.blocks[idx]
      );
      if (!cellChanged) return cell;
      rowChanged = true;
      return { ...cell, blocks: normalizedBlocks };
    });
    if (!rowChanged) return row;
    changed = true;
    return { ...row, cells };
  });

  return changed ? { ...block, rows } : block;
}

// ============================================================================
// 3. Visual bounds (account for floating images that paint above/below the
//    nominal flow rectangle so HF clipping & shadow regions size correctly)
// ============================================================================

type PositionedAxis = {
  relativeTo?: string;
  posOffset?: number;
  align?: string;
  alignment?: string;
};

function getPositionAlignment(axis: PositionedAxis | undefined): string | undefined {
  return axis?.align ?? axis?.alignment;
}

export function resolveHeaderFooterVisualTop(
  run: ImageRun,
  paragraphY: number,
  flowHeight: number,
  metrics: HeaderFooterMetrics
): number {
  const flowTop =
    metrics.section === 'header'
      ? (metrics.margins.header ?? 48)
      : metrics.pageSize.h - (metrics.margins.footer ?? 48) - flowHeight;
  const vertical = run.position?.vertical;

  if (!vertical) {
    return paragraphY;
  }

  const align = getPositionAlignment(vertical);
  const offsetPx = vertical.posOffset !== undefined ? emuToPixels(vertical.posOffset) : undefined;

  if (vertical.relativeTo === 'page') {
    if (offsetPx !== undefined) return offsetPx - flowTop;
    if (align === 'top') return -flowTop;
    if (align === 'bottom') return metrics.pageSize.h - run.height - flowTop;
    if (align === 'center') return (metrics.pageSize.h - run.height) / 2 - flowTop;
  }

  if (vertical.relativeTo === 'margin') {
    const marginTop = metrics.margins.top;
    const marginHeight = metrics.pageSize.h - metrics.margins.top - metrics.margins.bottom;
    if (offsetPx !== undefined) return marginTop + offsetPx - flowTop;
    if (align === 'top') return marginTop - flowTop;
    if (align === 'bottom') return marginTop + marginHeight - run.height - flowTop;
    if (align === 'center') return marginTop + (marginHeight - run.height) / 2 - flowTop;
  }

  if (offsetPx !== undefined) {
    return paragraphY + offsetPx;
  }

  return paragraphY;
}

/**
 * Whether a header/footer block participates in the in-flow band height that
 * pushes the body margin.
 *
 * OOXML semantics: Word grows the header/footer band — and shifts body text —
 * based only on the story's in-flow content. A floating/anchored object
 * (`wp:anchor` DrawingML or an absolutely-positioned VML shape, e.g. a
 * full-page letterhead anchored to the page in a header) is removed from the
 * text flow and positioned on the page; it does NOT grow the band or push the
 * body. So only inline-flow blocks count here. Anchored image *runs* inside a
 * paragraph are likewise out of flow, but they don't contribute to the
 * paragraph's measured line height, so paragraphs need no special handling.
 *
 * @public
 */
export function contributesToHeaderFooterFlowHeight(block: FlowBlock): boolean {
  switch (block.kind) {
    case 'paragraph':
    case 'table':
      return true;
    case 'image':
      // Inline images count; page/paragraph-anchored floats do not.
      return !block.anchor?.isAnchored;
    case 'textBox':
      // Only genuinely inline text boxes count. 'float' (square/tight/through/
      // behind/inFront) and 'block' (topAndBottom) are positioned out of the
      // body's flow and must not push the body margin.
      return block.displayMode === undefined || block.displayMode === 'inline';
    default:
      return false; // sectionBreak / pageBreak / columnBreak
  }
}

function measureFlowHeight(measure: Measure | undefined): number {
  if (!measure) return 0;
  if (measure.kind === 'paragraph') return measure.totalHeight;
  if (measure.kind === 'table') return measure.totalHeight;
  if (measure.kind === 'image') return measure.height;
  if (measure.kind === 'textBox') return measure.height;
  return 0;
}

export function calculateHeaderFooterVisualBounds(
  blocks: FlowBlock[],
  measures: Measure[],
  flowHeight: number,
  metrics: HeaderFooterMetrics
): { visualTop: number; visualBottom: number } {
  let visualTop = 0;
  // Accumulate the real extent from the blocks below. Do NOT seed with the
  // caller's `flowHeight` arg (it is the float-inclusive `totalHeight`): when a
  // floating box doesn't advance the cursor, seeding with the stacked total
  // would keep `visualBottom` artificially tall and the header container/hover
  // highlight would read taller than the painted content (#705/#729).
  let visualBottom = 0;
  let cursorY = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const measure = measures[i];
    if (!block || !measure) continue;

    if (block.kind === 'paragraph' && measure.kind === 'paragraph') {
      const paragraphStartY = cursorY;
      const paragraphBottomY = paragraphStartY + measure.totalHeight;
      visualTop = Math.min(visualTop, paragraphStartY);
      visualBottom = Math.max(visualBottom, paragraphBottomY);

      for (const run of block.runs) {
        if (run.kind !== 'image' || !run.position) continue;
        const runTop = resolveHeaderFooterVisualTop(run, paragraphStartY, flowHeight, metrics);
        visualTop = Math.min(visualTop, runTop);
        visualBottom = Math.max(visualBottom, runTop + run.height);
      }

      cursorY = paragraphBottomY;
    } else if (block.kind === 'table' && measure.kind === 'table') {
      const blockBottomY = cursorY + measure.totalHeight;
      visualTop = Math.min(visualTop, cursorY);
      visualBottom = Math.max(visualBottom, blockBottomY);
      cursorY = blockBottomY;
    } else if (block.kind === 'image' && measure.kind === 'image') {
      const blockBottomY = cursorY + measure.height;
      visualTop = Math.min(visualTop, cursorY);
      visualBottom = Math.max(visualBottom, blockBottomY);
      cursorY = blockBottomY;
    } else if (block.kind === 'textBox' && measure.kind === 'textBox') {
      const blockBottomY = cursorY + measure.height;
      visualTop = Math.min(visualTop, cursorY);
      visualBottom = Math.max(visualBottom, blockBottomY);
      // A floating text box is positioned, not in-flow: it extends the visual
      // bounds (so the band/container stays tall enough to show it) but does
      // NOT advance the cursor, mirroring the painter (renderHeaderFooterContent)
      // and floating tables. Otherwise the header container outgrows its actual
      // content and the hover highlight reads taller than the header (#705/#729).
      if (block.displayMode !== 'float') {
        cursorY = blockBottomY;
      }
    }
  }

  return { visualTop, visualBottom };
}

// ============================================================================
// 4. HeaderFooter → HeaderFooterContent (the public entry point)
// ============================================================================

export type ConvertHeaderFooterOptions = {
  styles?: StyleDefinitions | null;
  theme?: Theme | null;
  measureBlocks: MeasureBlocksFn;
  /**
   * `w:defaultTabStop` (twips) read from `state.doc.attrs.defaultTabStopTwips`
   * on the body doc — HF content doesn't carry its own doc-level setting,
   * so pass it through so list markers inside headers/footers honor the
   * same tab grid as the body.
   */
  defaultTabStopTwips?: number | null;
};

/**
 * Convert HeaderFooter (document type) to HeaderFooterContent (render type).
 *
 * Routes through the same pipeline as the body: HF.content →
 * headerFooterToProseDoc → toFlowBlocks → measureBlocks. The inline editor
 * uses the same conversion chain, so block support (paragraph, table, image,
 * textBox, fields) and the inline editor's content stay in lockstep.
 */
export function convertHeaderFooterToContent(
  headerFooter: HeaderFooter | null | undefined,
  contentWidth: number,
  metrics: HeaderFooterMetrics,
  options: ConvertHeaderFooterOptions
): HeaderFooterContent | undefined {
  if (!headerFooter || !headerFooter.content || headerFooter.content.length === 0) {
    return undefined;
  }

  const pmDoc = headerFooterToProseDoc(headerFooter.content, {
    styles: options.styles ?? undefined,
    theme: options.theme ?? null,
    defaultTabStopTwips: options.defaultTabStopTwips ?? null,
  });
  return convertHeaderFooterPmDocToContent(pmDoc, contentWidth, metrics, options);
}

/**
 * Same pipeline as {@link convertHeaderFooterToContent}, but starts from an
 * already-built ProseMirror document instead of `HeaderFooter.content`.
 *
 * The unified HF editing model (see `openspec/changes/unify-hf-editing/`)
 * maintains one persistent hidden PM EditorView per HF `rId`. The painter
 * reads from that EditorView's current `state.doc` rather than re-parsing
 * the Document-model `HeaderFooter` every layout pass — this is what
 * actually makes the painter and the editor stay in lockstep.
 *
 * `headerFooterToProseDoc` is still the right entry point when there is no
 * mounted PM for the slot (cold load, or rId not yet projected).
 *
 * @public
 */
export function convertHeaderFooterPmDocToContent(
  pmDoc: PMNode,
  contentWidth: number,
  metrics: HeaderFooterMetrics,
  options: ConvertHeaderFooterOptions
): HeaderFooterContent | undefined {
  const blocks = toFlowBlocks(pmDoc, { theme: options.theme ?? undefined });
  if (blocks.length === 0) return undefined;

  const blocksForMeasure = normalizeHeaderFooterMeasureBlocks(blocks);
  const measures = options.measureBlocks(blocksForMeasure, contentWidth);
  let totalHeight = 0;
  let flowHeight = 0;
  for (let i = 0; i < blocksForMeasure.length; i++) {
    const h = measureFlowHeight(measures[i]);
    totalHeight += h;
    if (contributesToHeaderFooterFlowHeight(blocksForMeasure[i])) flowHeight += h;
  }
  // Use `blocksForMeasure` (the normalized list the `measures` were computed
  // from), NOT the raw `blocks` — otherwise block[i] and measure[i] can desync
  // and per-block flags like `displayMode` are read off the wrong block.
  const { visualTop, visualBottom } = calculateHeaderFooterVisualBounds(
    blocksForMeasure,
    measures,
    totalHeight,
    metrics
  );

  return {
    blocks: blocksForMeasure,
    measures,
    height: totalHeight,
    flowHeight,
    visualTop,
    visualBottom,
  };
}

// ============================================================================
// HF caret rect — used by both React and Vue adapters
// ============================================================================

/**
 * Viewport-relative caret rect for a persistent HF EditorView's selection
 * head. Resolves against the painter's `data-pm-start`/`data-pm-end` spans
 * inside `.layout-page-header` / `.layout-page-footer`. The same HF doc is
 * painted on every page (multi-page docs, titlePg), so this walks every
 * candidate host and picks the one whose spans bracket the PM head; falls
 * back to the first so empty paragraphs still resolve to a paragraph anchor.
 *
 * Public so the React + Vue adapters can share a single implementation
 * (`packages/{react,vue}` adapters used to carry byte-identical copies).
 *
 * @public
 */
type HfDomSnapshot = {
  host: HTMLElement;
  spans: HTMLElement[];
  ranged: HTMLElement[];
};

// Resolved HF DOM snapshot cached between calls, keyed by section. Invalidated
// by the painter's `painter:painted` event (`invalidateHfDomCache()` below) so
// the snapshot is always at most one paint stale. Without this, every
// HF caret + selection-rect computation re-walked every span on every
// page, which on multi-page docs is O(pages × spans) per scroll-rAF.
//
// Keyed by section because the header and footer are distinct PM docs painted
// in distinct hosts. A single shared slot let the first match in DOM order
// (always the header) shadow the footer, so an active footer's caret/selection
// resolved against the header's spans (#671).
const hfDomCache: { header: HfDomSnapshot | null; footer: HfDomSnapshot | null } = {
  header: null,
  footer: null,
};

/**
 * Drop the cached HF host + span lists. Hosts/painters call this after
 * a repaint (or HF mode toggle) so the next caret / selection compute
 * re-walks the DOM. Public so adapters can call it from their painter
 * commit signal.
 *
 * @public
 */
export function invalidateHfDomCache(): void {
  hfDomCache.header = null;
  hfDomCache.footer = null;
}

function getHfDomSnapshot(
  section: 'header' | 'footer',
  doc: globalThis.Document
): HfDomSnapshot | null {
  // The same HF doc is painted on every page (shared by `r:id`), so any painted
  // instance carries the right PM coords. But the caret/selection overlay must
  // render on the instance the user is actually editing — pick the host nearest
  // the viewport center. Always taking the first (page 1) host drew the overlay
  // on page 1 even while editing a header/footer on a later page, so the user
  // saw no caret or highlight where they were typing (#691 footer).
  // Scoping to `.layout-page-${section}` keeps the header and footer from
  // shadowing each other (#671).
  const hosts = doc.querySelectorAll<HTMLElement>(`.layout-page-${section}`);
  if (hosts.length === 0) return null;
  const win = doc.defaultView;
  const vpCenter = win ? win.innerHeight / 2 : 0;
  let host = hosts[0];
  let bestDist = Infinity;
  for (const h of Array.from(hosts)) {
    const r = h.getBoundingClientRect();
    const dist = Math.abs((r.top + r.bottom) / 2 - vpCenter);
    if (dist < bestDist) {
      bestDist = dist;
      host = h;
    }
  }
  // Reuse the cached span lists only when they belong to the same painted host
  // (and it's still live). The host changes as the user scrolls between pages,
  // so a section-only cache would keep resolving against the wrong instance.
  const cached = hfDomCache[section];
  if (cached && cached.host === host && cached.host.isConnected) return cached;
  const spans = Array.from(host.querySelectorAll<HTMLElement>('span[data-pm-start][data-pm-end]'));
  const ranged = Array.from(host.querySelectorAll<HTMLElement>('[data-pm-start][data-pm-end]'));
  const snapshot = { host, spans, ranged };
  hfDomCache[section] = snapshot;
  return snapshot;
}

/**
 * TODO(unify-hf-editing follow-up): this function duplicates the
 * span-walking + Range/TreeWalker logic in
 * `packages/react/src/components/DocxEditor/internals/domSelection.ts:getCaretFromDom`
 * (body). The body's helper is scoped to `.layout-page-content` via
 * `findBodyPmSpans`; we walk the same shape scoped to `.layout-page-header /
 * .layout-page-footer` here. Unification path:
 *   1. Add `findHfPmSpans` / `findHfEmptyRuns` mirrors next to the body
 *      ones in `packages/core/src/layout-bridge/findBodyPmSpans.ts`.
 *   2. Add `scope: 'body' | 'hf'` param to `getCaretFromDom` +
 *      `computeSelectionRectsFromDom`; switch the helper internally.
 *   3. Move the (now scope-aware) helpers into core so React + Vue both
 *      call them.
 *   4. Delete this function and `computeHfSelectionRectsFromView` —
 *      `DocxEditorPagedArea` calls `getCaretFromDom(scope: 'hf', ...)`.
 * Reviewer estimate: ~30 LOC net deletion + body↔HF parity for free
 * (lineHeight from `.layout-line` ancestor, empty-paragraph fallback
 * via `findBodyEmptyRuns`, etc.). Deferred because it's a multi-file
 * shape change that doesn't affect observable behavior.
 *
 * @public
 */
export function computeHfCaretRectFromView(
  view: EditorView,
  section: 'header' | 'footer',
  doc: globalThis.Document = globalThis.document
): { top: number; left: number; height: number } | null {
  const sel = view.state.selection;
  if (!sel.empty) return null;
  const pmPos = sel.head;
  const snapshot = getHfDomSnapshot(section, doc);
  if (!snapshot) return null;
  const { host, spans } = snapshot;
  for (const span of spans) {
    const start = Number(span.dataset.pmStart);
    const end = Number(span.dataset.pmEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (pmPos >= start && pmPos <= end) {
      const range = host.ownerDocument.createRange();
      const walker = host.ownerDocument.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let remaining = pmPos - start;
      let textNode = walker.nextNode() as Text | null;
      while (textNode) {
        const len = textNode.data.length;
        if (remaining <= len) {
          try {
            range.setStart(textNode, remaining);
            range.setEnd(textNode, remaining);
            const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
            if (rect && rect.height > 0) {
              return { top: rect.top, left: rect.left, height: rect.height };
            }
          } catch {
            // fall through
          }
          break;
        }
        remaining -= len;
        textNode = walker.nextNode() as Text | null;
      }
      const spanRect = span.getBoundingClientRect();
      const ratio = (pmPos - start) / Math.max(1, end - start);
      return {
        top: spanRect.top,
        left: spanRect.left + spanRect.width * ratio,
        height: spanRect.height,
      };
    }
  }
  // Exact paragraph/line anchor at `pmPos` (when the painter emits one).
  const anchor = host.querySelector<HTMLElement>(`[data-pm-start="${pmPos}"]`);
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    return { top: rect.top, left: rect.left + 1, height: rect.height || 16 };
  }

  // Fallback for empty paragraphs / line-ends: walk every painted element
  // that carries `[data-pm-start][data-pm-end]` and find the one whose
  // range brackets `pmPos`. Use its rect — left edge for an empty
  // paragraph (cursor at the paragraph's start), right edge if the cursor
  // is at the paragraph's end. Without this, hitting Enter into a new
  // empty paragraph hid the caret entirely until the user typed.
  const ranged = snapshot.ranged;
  let bestEl: HTMLElement | null = null;
  let bestSpan = Infinity;
  for (const el of ranged) {
    const start = Number(el.dataset.pmStart);
    const end = Number(el.dataset.pmEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (pmPos < start || pmPos > end) continue;
    const span = end - start;
    if (span < bestSpan) {
      bestSpan = span;
      bestEl = el;
    }
  }
  if (bestEl) {
    const rect = bestEl.getBoundingClientRect();
    const end = Number(bestEl.dataset.pmEnd);
    const atEnd = pmPos >= end;
    return {
      top: rect.top,
      left: atEnd ? rect.right : rect.left + 1,
      height: rect.height || 16,
    };
  }

  // Cursor sits past every painted element's `[pmStart, pmEnd]` range —
  // typically because the cursor is at `doc.content.size` (end of last
  // paragraph). Find the painted element with the largest `pmStart` that
  // is still `<= pmPos` and snap the caret to its trailing edge. This is
  // a much better visual than "top-left of host" when the user has just
  // hit Enter to add a paragraph and is now sitting at the end of the
  // content.
  let trailingEl: HTMLElement | null = null;
  let trailingStart = -Infinity;
  for (const el of ranged) {
    const start = Number(el.dataset.pmStart);
    if (!Number.isFinite(start)) continue;
    if (start > pmPos) continue;
    if (start > trailingStart) {
      trailingStart = start;
      trailingEl = el;
    }
  }
  if (trailingEl) {
    const rect = trailingEl.getBoundingClientRect();
    return { top: rect.top, left: rect.right, height: rect.height || 16 };
  }

  // Last resort: anchor at the host's top-left so the caret is at least
  // visible while in HF edit mode. Better than disappearing.
  const hostRect = host.getBoundingClientRect();
  return {
    top: hostRect.top + 2,
    left: hostRect.left + 2,
    height: 16,
  };
}

/**
 * Selection-rect set for a non-empty HF selection, projected against the
 * painted HF spans. Mirror of `computeSelectionRectsFromDom` but scoped to
 * `.layout-page-header` / `.layout-page-footer` instead of the body. Used
 * so the painter draws a visible highlight when the user drag-selects
 * inside a header/footer in edit mode.
 *
 * Returns viewport-relative `{top, left, width, height}` rects. Empty
 * array when selection is collapsed or no painted spans overlap the range.
 *
 * @public
 */
export function computeHfSelectionRectsFromView(
  view: EditorView,
  section: 'header' | 'footer',
  doc: globalThis.Document = globalThis.document
): Array<{ top: number; left: number; width: number; height: number }> {
  const sel = view.state.selection;
  if (sel.empty) return [];
  const from = sel.from;
  const to = sel.to;
  const out: Array<{ top: number; left: number; width: number; height: number }> = [];

  // Reuse the cached HF DOM snapshot for this section. Every painted HF host
  // for the section shares the same PM coord space (only one HF doc, painted N
  // times for the N pages), so a single host's spans suffice for selection
  // rects.
  const snapshot = getHfDomSnapshot(section, doc);
  if (!snapshot) return out;
  const { host, spans } = snapshot;
  for (const spanEl of spans) {
    const pmStart = Number(spanEl.dataset.pmStart);
    const pmEnd = Number(spanEl.dataset.pmEnd);
    if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd)) continue;
    if (pmEnd <= from || pmStart >= to) continue;

    // Tab spans: full-span highlight.
    if (spanEl.classList.contains('layout-run-tab')) {
      const rect = spanEl.getBoundingClientRect();
      out.push({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      continue;
    }

    let textNode: Text | null = null;
    if (spanEl.firstChild?.nodeType === Node.TEXT_NODE) {
      textNode = spanEl.firstChild as Text;
    } else if (
      spanEl.firstChild?.nodeType === Node.ELEMENT_NODE &&
      (spanEl.firstChild as HTMLElement).tagName === 'A' &&
      spanEl.firstChild.firstChild?.nodeType === Node.TEXT_NODE
    ) {
      textNode = spanEl.firstChild.firstChild as Text;
    }
    if (!textNode) continue;

    const startChar = Math.max(0, from - pmStart);
    const endChar = Math.min(textNode.length, to - pmStart);
    if (startChar >= endChar) continue;

    const range = host.ownerDocument.createRange();
    range.setStart(textNode, startChar);
    range.setEnd(textNode, endChar);
    for (const rect of Array.from(range.getClientRects())) {
      out.push({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }
  }

  return out;
}
