/**
 * Footnote Layout Utilities
 *
 * Footnote/endnote rendering pipeline plus page-mapping helpers:
 * - scanning FlowBlocks for footnote references and their PM positions
 * - mapping references to the page that ends up containing them
 * - converting a Footnote → FootnoteContent via the body pipeline
 *   (footnoteToProseDoc → toFlowBlocks → caller-supplied measureBlocks)
 * - reserving per-page footnote area heights for layout
 *
 * Everything that's pure OOXML / FlowBlock semantics lives here so the
 * React, Vue, and any future adapters can share the conversion logic
 * and just supply their own measurement function (which depends on
 * platform-specific Canvas/font metrics).
 */

import type {
  BlockId,
  FlowBlock,
  ParagraphBlock,
  Measure,
  Page,
  Layout,
  FootnoteContent,
  TextRun,
} from '../layout-engine/types';
import { layoutDocument, type LayoutOptions } from '../layout-engine';
import type { Document, Footnote, StyleDefinitions, Theme } from '../types/document';
import type { FootnoteRenderItem } from '../layout-painter';
import { footnoteToProseDoc } from '../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from './toFlowBlocks';
import { getFootnoteText } from '../docx/footnoteParser';

/** Separator line height + vertical padding in pixels. */
export const FOOTNOTE_SEPARATOR_HEIGHT = 12;

/**
 * Gutter between footnote columns when `w15:footnoteColumns` > 1, in pixels
 * (≈ 0.25in). Shared by the reserved-height/measurement path (core) and the
 * footnote painter so a footnote measured at column width paints into a column
 * of exactly that width. Single-column footnotes never consult it.
 */
export const FOOTNOTE_COLUMN_GAP_PX = 24;

/**
 * Hard cap on the multi-pass footnote layout loop. Reserving footnote
 * space can move a reference to another page, so adapters keep remapping
 * until the page→height contract is stable. Dense layouts converge in
 * 2–3 passes in practice; 6 is a safe ceiling.
 */
export const MAX_FOOTNOTE_LAYOUT_PASSES = 6;

/**
 * Compare two per-page footnote reservation maps. Used by the React +
 * Vue adapters to detect when the multi-pass loop has converged.
 */
export function footnoteReservedHeightsEqual(
  a: Map<number, number>,
  b: Map<number, number>
): boolean {
  if (a.size !== b.size) return false;
  for (const [pageNumber, height] of a) {
    if (b.get(pageNumber) !== height) return false;
  }
  return true;
}

function footnoteReservedHeightsCover(
  reserved: Map<number, number>,
  required: Map<number, number>
): boolean {
  for (const [pageNumber, height] of required) {
    if ((reserved.get(pageNumber) ?? 0) < height) return false;
  }
  return true;
}

function mergeFootnoteReservedHeights(
  a: Map<number, number>,
  b: Map<number, number>
): Map<number, number> {
  const merged = new Map(a);
  for (const [pageNumber, height] of b) {
    merged.set(pageNumber, Math.max(merged.get(pageNumber) ?? 0, height));
  }
  return merged;
}

/**
 * Default footnote font size in points. Word's built-in "Footnote Text"
 * style sets 8pt; we apply this only when the footnote's runs don't
 * already specify a fontSize (avoids overriding authored sizes).
 *
 * TODO once the style cascade for paragraph styles is fully wired through
 * the bridge, footnotes should pick this up from the resolved
 * "FootnoteText" / "footnote text" style instead of hardcoding the value.
 */
const FOOTNOTE_FONT_SIZE_PT = 8;

// ============================================================================
// 1. Scan FlowBlocks for footnote references
// ============================================================================

/**
 * Where a footnote reference lives, as found by {@link collectFootnoteRefs}.
 *
 * `pmPos` alone is enough to attribute a reference to a page for ordinary
 * (paragraph) content, whose fragments carry a per-page pm sub-range. A table
 * is different: it splits across pages by ROW, but every `TableFragment` keeps
 * the whole table's `pmStart`/`pmEnd` (those drive selection mapping and must
 * not be narrowed). So for a reference authored inside a table cell we also
 * record the OUTERMOST table's id and the index of the row that contains it,
 * letting {@link mapFootnotesToPages} attribute the reference to the page that
 * actually laid out that row.
 */
export type FootnoteRefLocation = {
  footnoteId: number;
  pmPos: number;
  /** Id of the outermost enclosing table block, when the ref is in a table cell. */
  tableBlockId?: BlockId;
  /** Index (into the outermost table's `rows`) of the row holding the ref. */
  rowIndex?: number;
};

/**
 * Scan FlowBlocks for runs with footnoteRefId set.
 * Returns a list of {@link FootnoteRefLocation} in document order.
 *
 * Recurses into container blocks (table cells, text boxes) so footnote
 * references authored anywhere in the body reach the page-reservation
 * pass. Without this, a `footnoteRefId` nested inside a table cell never
 * gets mapped to a page and the per-page `.layout-footnote-area` silently
 * drops that entry even though the body still renders the in-line ref
 * marker.
 *
 * For refs inside a table, the OUTERMOST table's id and row index are
 * recorded (a nested table keeps the outer context, since the outer row is
 * what the paginator splits into per-page fragments).
 */
export function collectFootnoteRefs(blocks: FlowBlock[]): FootnoteRefLocation[] {
  const refs: FootnoteRefLocation[] = [];

  const walk = (
    input: FlowBlock[],
    tableCtx?: { tableBlockId: BlockId; rowIndex: number }
  ): void => {
    for (const block of input) {
      if (block.kind === 'paragraph') {
        for (const run of block.runs) {
          if (run.kind === 'text' && run.footnoteRefId != null) {
            refs.push({
              footnoteId: run.footnoteRefId,
              pmPos: run.pmStart ?? 0,
              ...(tableCtx ?? {}),
            });
          }
        }
      } else if (block.kind === 'table') {
        block.rows.forEach((row, rowIndex) => {
          for (const cell of row.cells) {
            // Keep the outermost table context for nested tables: the outer
            // row is the unit the paginator places on a page.
            walk(cell.blocks, tableCtx ?? { tableBlockId: block.id, rowIndex });
          }
        });
      } else if (block.kind === 'textBox') {
        walk(block.content, tableCtx);
      }
    }
  };

  walk(blocks);

  return refs;
}

// ============================================================================
// 2. Map footnote references to pages
// ============================================================================

/**
 * After layout, determine which footnotes appear on which pages.
 * Checks each page's fragments to see if any footnoteRef PM positions fall within.
 *
 * Returns Map<pageNumber, footnoteId[]> in document order.
 */
export function mapFootnotesToPages(
  pages: Page[],
  footnoteRefs: FootnoteRefLocation[]
): Map<number, number[]> {
  const pageFootnotes = new Map<number, number[]>();

  if (footnoteRefs.length === 0) return pageFootnotes;

  const assign = (pageNumber: number, footnoteId: number): void => {
    const existing = pageFootnotes.get(pageNumber) ?? [];
    // Avoid duplicates (same footnote shouldn't appear twice on same page)
    if (!existing.includes(footnoteId)) existing.push(footnoteId);
    pageFootnotes.set(pageNumber, existing);
  };

  // For each footnote ref, find which page it lands on.
  for (const ref of footnoteRefs) {
    let found = false;
    for (const page of pages) {
      for (const fragment of page.fragments) {
        let match = false;
        if (ref.tableBlockId != null && ref.rowIndex != null) {
          // In-table ref: a table splits across pages by row, but every
          // fragment keeps the whole table's pm range, so a pm-position match
          // would land every ref on the first table page. Attribute the ref to
          // the fragment whose [fromRow, toRow) slice contains its row.
          match =
            fragment.kind === 'table' &&
            fragment.blockId === ref.tableBlockId &&
            ref.rowIndex >= fragment.fromRow &&
            ref.rowIndex < fragment.toRow;
        } else {
          const pmStart = fragment.pmStart ?? -1;
          const pmEnd = fragment.pmEnd ?? -1;
          match = pmStart >= 0 && pmEnd >= 0 && ref.pmPos >= pmStart && ref.pmPos < pmEnd;
        }
        if (match) {
          assign(page.number, ref.footnoteId);
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  return pageFootnotes;
}

// ============================================================================
// 3. Convert a footnote to renderable FlowBlocks (body-pipeline)
// ============================================================================

/**
 * Footnote-specific block normalization. Mirrors the spirit of
 * `normalizeHeaderFooterMeasureBlocks`: post-process the body-pipeline
 * output for a single footnote so it carries the correct visual prefix
 * (its display number, rendered as a superscript) and a default 8pt font
 * for any run that didn't specify a size.
 *
 * The displayNumber is prepended onto the FIRST paragraph as a fresh
 * superscript text run — visually matches Word's footnote numbering
 * without disturbing the authored runs.
 *
 * Exported for callers that want to compose their own conversion
 * pipeline; `convertFootnoteToContent` calls it as part of its flow.
 */
export function applyFootnotePresentation(blocks: FlowBlock[], displayNumber: number): FlowBlock[] {
  if (blocks.length === 0) {
    return [
      {
        kind: 'paragraph',
        id: `fn-empty-${displayNumber}`,
        runs: [
          {
            kind: 'text',
            text: `${displayNumber}  `,
            fontSize: FOOTNOTE_FONT_SIZE_PT,
            superscript: true,
          },
        ],
      } as ParagraphBlock,
    ];
  }

  // Apply default 8pt to every run that didn't specify a fontSize. Mutating
  // a copy keeps the input blocks pure for caching upstream.
  const out = blocks.map((b) => {
    if (b.kind !== 'paragraph') return b;
    const para = b as ParagraphBlock;
    return {
      ...para,
      runs: para.runs.map((r) => {
        if (r.kind === 'text' || r.kind === 'tab') {
          if (r.fontSize == null) {
            return { ...r, fontSize: FOOTNOTE_FONT_SIZE_PT };
          }
        }
        return r;
      }),
    } as ParagraphBlock;
  });

  // Prepend display number on the first paragraph.
  const first = out[0];
  if (first.kind === 'paragraph') {
    const firstPara = first as ParagraphBlock;
    // Match the marker's font to the note text it precedes. Word renders the
    // footnote number in the FootnoteText paragraph font; the FootnoteReference
    // char style only adds superscript, not a face. Without this the synthetic
    // run carries no fontFamily and the painter falls back to the inherited
    // container default, so the number renders in a different font than the
    // note text. When the note text itself has no explicit font we leave the
    // marker unset too (both then inherit the same container font and match).
    const firstTextRun = firstPara.runs.find((r) => r.kind === 'text') as TextRun | undefined;
    const numberRun: TextRun = {
      kind: 'text',
      text: `${displayNumber}  `,
      fontSize: FOOTNOTE_FONT_SIZE_PT,
      superscript: true,
      ...(firstTextRun?.fontFamily ? { fontFamily: firstTextRun.fontFamily } : {}),
    };
    out[0] = {
      ...firstPara,
      runs: [numberRun, ...firstPara.runs],
    } as ParagraphBlock;
  }

  return out;
}

/**
 * Adapter-supplied block measurement function. The caller (React /
 * Vue / etc.) supplies its platform's measure routine — at minimum
 * paragraph + table + image + textBox — so this core helper stays
 * Canvas-free.
 */
export type MeasureBlocksFn = (blocks: FlowBlock[], contentWidth: number) => Measure[];

/**
 * Options for {@link convertFootnoteToContent}.
 */
export type ConvertFootnoteOptions = {
  /** The document's parsed style definitions, threaded into the body pipeline. */
  styles?: StyleDefinitions | null;
  /** Theme for resolving themed fills / fonts inside the footnote. */
  theme?: Theme | null;
  /** Measure callback supplied by the rendering adapter. */
  measureBlocks: MeasureBlocksFn;
  /**
   * Doc-level `w:defaultTabStop` (twips) from the body so list markers
   * inside footnotes honor the same tab grid.
   */
  defaultTabStopTwips?: number | null;
};

/**
 * Convert a Footnote to renderable FootnoteContent via the body pipeline:
 * `footnoteToProseDoc → toFlowBlocks → applyFootnotePresentation →
 * measureBlocks`. Pre-PR (#378) this lived in a hand-rolled shadow stack
 * that silently dropped non-paragraph content; routing through the body
 * pipeline gives footnotes full block-kind support — paragraph + table
 * + image + textBox + fields.
 */
export function convertFootnoteToContent(
  footnote: Footnote,
  displayNumber: number,
  contentWidth: number,
  options: ConvertFootnoteOptions
): FootnoteContent {
  const pmDoc = footnoteToProseDoc(footnote.content, {
    styles: options.styles ?? undefined,
    theme: options.theme ?? null,
    defaultTabStopTwips: options.defaultTabStopTwips ?? null,
  });
  const rawBlocks = toFlowBlocks(pmDoc, { theme: options.theme ?? undefined });
  const blocks = applyFootnotePresentation(rawBlocks, displayNumber);

  const measures = options.measureBlocks(blocks, contentWidth);

  const totalHeight = measures.reduce((h, m) => {
    if (m.kind === 'paragraph') return h + m.totalHeight;
    if (m.kind === 'table') return h + m.totalHeight;
    if (m.kind === 'image') return h + m.height;
    if (m.kind === 'textBox') return h + m.height;
    return h;
  }, 0);

  return {
    id: footnote.id,
    displayNumber,
    blocks,
    measures,
    height: totalHeight,
  };
}

/**
 * Build footnote content for all footnotes referenced in the document.
 * Display numbers are assigned by first-appearance order (the same way
 * Word renders them).
 */
export function buildFootnoteContentMap(
  footnotes: Footnote[],
  footnoteRefs: Array<{ footnoteId: number }>,
  contentWidth: number,
  options: ConvertFootnoteOptions
): Map<number, FootnoteContent> {
  const contentMap = new Map<number, FootnoteContent>();
  const footnoteById = new Map<number, Footnote>();

  for (const fn of footnotes) {
    if (fn.noteType === 'normal' || fn.noteType == null) {
      footnoteById.set(fn.id, fn);
    }
  }

  let displayNumber = 1;
  const seen = new Set<number>();

  for (const ref of footnoteRefs) {
    if (seen.has(ref.footnoteId)) continue;
    seen.add(ref.footnoteId);

    const footnote = footnoteById.get(ref.footnoteId);
    if (!footnote) continue;

    contentMap.set(
      ref.footnoteId,
      convertFootnoteToContent(footnote, displayNumber, contentWidth, options)
    );
    displayNumber++;
  }

  return contentMap;
}

// ============================================================================
// 4. Per-page footnote area height reservation
// ============================================================================

/**
 * Distribute footnote items across `columns` balanced columns, preserving
 * document order (footnotes must still read in numeric sequence). Items fill
 * the first column until it reaches the balanced target height (≈ total / N),
 * then spill into the next column — the same order-preserving balance Word
 * applies to its footnote columns, not a greedy shortest-column packing
 * (which would scramble the reading order).
 *
 * `columns <= 1` (the default for ordinary single-column footnotes) returns a
 * single column unchanged, so callers that never opt into multi-column
 * footnotes are byte-for-byte unaffected.
 *
 * Pure and shared by the reserved-height calculation (core) and the footnote
 * painter (layout-painter) so the reserved area and the rendered columns are
 * computed from the same partition.
 */
export function distributeFootnotesIntoColumns<T extends { height: number }>(
  items: T[],
  columns: number
): T[][] {
  const n = Math.max(1, Math.floor(columns));
  if (n <= 1 || items.length <= 1) return [items];

  const total = items.reduce((sum, item) => sum + item.height, 0);
  const target = total / n;

  const result: T[][] = [[]];
  let columnHeight = 0;
  for (const item of items) {
    // Move to the next column once the current one has passed the balanced
    // target (measured at the item's midpoint to avoid lopsided splits) and
    // columns remain. Never leave a column empty.
    if (result.length < n && columnHeight > 0 && columnHeight + item.height / 2 > target) {
      result.push([]);
      columnHeight = 0;
    }
    result[result.length - 1].push(item);
    columnHeight += item.height;
  }

  return result;
}

/**
 * Calculate per-page footnote reserved heights.
 * Returns Map<pageNumber, reservedHeight>.
 *
 * With `columns > 1` the footnotes are balanced across that many columns and
 * the reserved height is the tallest column (plus the separator), since the
 * columns sit side by side — not the sum of every footnote height.
 */
export function calculateFootnoteReservedHeights(
  pageFootnoteMap: Map<number, number[]>,
  footnoteContentMap: Map<number, { height: number }>,
  columns: number = 1
): Map<number, number> {
  const reserved = new Map<number, number>();

  for (const [pageNumber, footnoteIds] of pageFootnoteMap) {
    const heights = footnoteIds
      .map((fnId) => footnoteContentMap.get(fnId)?.height ?? 0)
      .filter((h) => h > 0)
      .map((height) => ({ height }));

    if (heights.length === 0) continue;

    const cols = distributeFootnotesIntoColumns(heights, columns);
    const tallestColumn = cols.reduce(
      (max, col) =>
        Math.max(
          max,
          col.reduce((sum, item) => sum + item.height, 0)
        ),
      0
    );

    if (tallestColumn > 0) {
      // Add separator height
      reserved.set(pageNumber, tallestColumn + FOOTNOTE_SEPARATOR_HEIGHT);
    }
  }

  return reserved;
}

// ============================================================================
// 4b. Multi-pass footnote layout convergence
// ============================================================================

export interface StabilizeFootnoteLayoutArgs {
  blocks: FlowBlock[];
  measures: Measure[];
  layoutOpts: LayoutOptions;
  footnoteRefs: FootnoteRefLocation[];
  footnoteContentMap: Map<number, FootnoteContent>;
  /** First-pass layout already computed by the caller without reserved heights. */
  initialLayout: Layout;
  /**
   * Number of columns the footnote area is laid out in (`w15:footnoteColumns`).
   * Defaults to 1. When > 1, reserved heights are balanced across the columns
   * (tallest column wins) instead of summing every footnote, and the value is
   * written onto each footnote-bearing page as `page.footnoteColumns`.
   */
  footnoteColumns?: number;
}

export interface StabilizeFootnoteLayoutResult {
  layout: Layout;
  pageFootnoteMap: Map<number, number[]>;
  /** True if the loop converged before hitting MAX_FOOTNOTE_LAYOUT_PASSES. */
  converged: boolean;
}

/**
 * Run the multi-pass footnote layout loop. Reserving footnote space on a
 * page can move a reference to another page, which changes the reservation,
 * which can move references again. Iterate until the page→height contract
 * is the same one used by the latest layout, or `MAX_FOOTNOTE_LAYOUT_PASSES`
 * passes have run.
 *
 * Lives in core so the React + Vue adapters call the same loop and stay in
 * lockstep on convergence behaviour. Writes `page.footnoteIds` onto each
 * page in the returned layout so renderers can paint footnote areas.
 */
export function stabilizeFootnoteLayout(
  args: StabilizeFootnoteLayoutArgs
): StabilizeFootnoteLayoutResult {
  const { blocks, measures, layoutOpts, footnoteRefs, footnoteContentMap, initialLayout } = args;
  const footnoteColumns = Math.max(1, args.footnoteColumns ?? 1);

  let pageFootnoteMap = mapFootnotesToPages(initialLayout.pages, footnoteRefs);
  let footnoteReservedHeights = calculateFootnoteReservedHeights(
    pageFootnoteMap,
    footnoteContentMap,
    footnoteColumns
  );

  if (footnoteReservedHeights.size === 0) {
    return { layout: initialLayout, pageFootnoteMap, converged: true };
  }

  let newLayout = initialLayout;
  let converged = false;
  for (let pass = 0; pass < MAX_FOOTNOTE_LAYOUT_PASSES; pass++) {
    newLayout = layoutDocument(blocks, measures, {
      ...layoutOpts,
      footnoteReservedHeights,
    });

    const nextPageFootnoteMap = mapFootnotesToPages(newLayout.pages, footnoteRefs);
    const nextFootnoteReservedHeights = calculateFootnoteReservedHeights(
      nextPageFootnoteMap,
      footnoteContentMap,
      footnoteColumns
    );

    pageFootnoteMap = nextPageFootnoteMap;
    if (footnoteReservedHeightsEqual(footnoteReservedHeights, nextFootnoteReservedHeights)) {
      footnoteReservedHeights = nextFootnoteReservedHeights;
      converged = true;
      break;
    }
    footnoteReservedHeights = nextFootnoteReservedHeights;
  }

  if (!converged) {
    let fallbackReservedHeights = footnoteReservedHeights;
    let fallbackCovered = false;
    for (let pass = 0; pass < MAX_FOOTNOTE_LAYOUT_PASSES; pass++) {
      newLayout = layoutDocument(blocks, measures, {
        ...layoutOpts,
        footnoteReservedHeights: fallbackReservedHeights,
      });
      pageFootnoteMap = mapFootnotesToPages(newLayout.pages, footnoteRefs);
      const requiredHeights = calculateFootnoteReservedHeights(
        pageFootnoteMap,
        footnoteContentMap,
        footnoteColumns
      );
      if (footnoteReservedHeightsCover(fallbackReservedHeights, requiredHeights)) {
        fallbackCovered = true;
        break;
      }
      fallbackReservedHeights = mergeFootnoteReservedHeights(
        fallbackReservedHeights,
        requiredHeights
      );
    }
    if (!fallbackCovered) {
      newLayout = layoutDocument(blocks, measures, {
        ...layoutOpts,
        footnoteReservedHeights: fallbackReservedHeights,
      });
      pageFootnoteMap = mapFootnotesToPages(newLayout.pages, footnoteRefs);
    }
    console.warn(
      `[docx-editor] footnote layout did not stabilize within ${MAX_FOOTNOTE_LAYOUT_PASSES} passes; ` +
        'settling with conservative page reservations. If footnotes appear misplaced, please file a bug with the document.'
    );
  }

  for (const [pageNum, fnIds] of pageFootnoteMap) {
    const page = newLayout.pages.find((p) => p.number === pageNum);
    if (page) {
      page.footnoteIds = fnIds;
      if (footnoteColumns > 1) page.footnoteColumns = footnoteColumns;
    }
  }

  return { layout: newLayout, pageFootnoteMap, converged };
}

// ============================================================================
// 5. Build per-page render items
// ============================================================================

/**
 * Turn the page→footnote-id map into the per-page render payload that
 * `renderPages` consumes via `footnotesByPage`. Skips non-`normal` notes
 * (separators, continuation notices), reads the display number out of the
 * content map, and pulls plain text via `getFootnoteText`.
 *
 * Lives in core (not in either adapter) so React + Vue both call the
 * same helper — same rule as the rest of this module.
 */
export function buildFootnoteRenderItems(
  pageFootnoteMap: Map<number, number[]>,
  footnoteContentMap: Map<number, FootnoteContent>,
  doc: Document | null
): Map<number, FootnoteRenderItem[]> {
  const result = new Map<number, FootnoteRenderItem[]>();
  if (!doc?.package?.footnotes) return result;

  const fnLookup = new Map<number, Footnote>();
  for (const fn of doc.package.footnotes) {
    if (fn.noteType && fn.noteType !== 'normal') continue;
    fnLookup.set(fn.id, fn);
  }

  for (const [pageNumber, footnoteIds] of pageFootnoteMap) {
    const items: FootnoteRenderItem[] = [];
    for (const fnId of footnoteIds) {
      const fn = fnLookup.get(fnId);
      if (!fn) continue;
      const content = footnoteContentMap.get(fnId);
      const displayNum = content?.displayNumber ?? 0;
      items.push({
        displayNumber: String(displayNum),
        text: getFootnoteText(fn),
        content,
      });
    }
    if (items.length > 0) result.set(pageNumber, items);
  }

  return result;
}
