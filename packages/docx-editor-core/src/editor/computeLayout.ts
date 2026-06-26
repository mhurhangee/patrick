/**
 * The pure layout COMPUTE pass shared by the React and Vue adapters — issue
 * #696 Tier 2, the clean half of the engine spine.
 *
 * This is the 6-step pass from React's `useLayoutPipeline` minus the DOM paint
 * + scroll/event side-effects (which stay adapter-side, where the framework
 * timing lives): PM doc → flow blocks → measure → header/footer resolve →
 * margin extension → `layoutDocument` (+ two-pass footnote stabilization) →
 * footnote render items. It is pure (no DOM, no refs, no rAF) and returns
 * everything the adapter needs to paint.
 *
 * The one injected seam is `measureBlocks` — each adapter passes its own
 * measurer (React's is caching), same pattern as `measureBlocksWithFloats`.
 * `getHfPmDoc` is the HF-unification seam (prefer the persistent PM doc over
 * re-parsing `HeaderFooter.content`).
 */

import type { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';

import {
  layoutDocument,
  type ColumnLayout,
  type FlowBlock,
  type FootnoteContent,
  type Layout,
  type Measure,
  type PageMargins,
} from '../layout-engine';
import {
  toFlowBlocks,
  computePerBlockWidths,
  demoteBlockLikeFloatingTables,
  collectFootnoteRefs,
  convertHeaderFooterToContent,
  convertHeaderFooterPmDocToContent,
  buildFootnoteContentMap,
  buildFootnoteRenderItems,
  stabilizeFootnoteLayout,
  FOOTNOTE_COLUMN_GAP_PX,
  extendMarginsForHeaderFooter,
  twipsToPixels,
  type FloatPageGeometry,
} from '../layout-bridge';
import {
  pageGeometryFromPage,
  type FootnoteRenderItem,
  type HeaderFooterContent,
} from '../layout-painter';
import type {
  Document,
  HeaderFooter,
  SectionProperties,
  StyleDefinitions,
  Theme,
  Watermark,
} from '../types/document';

interface PageSizePx {
  w: number;
  h: number;
}

/** Adapter-supplied block measurer (React's is caching). */
export type MeasureBlocksFn = (
  blocks: FlowBlock[],
  contentWidth: number | number[],
  pageGeometry?: FloatPageGeometry
) => Measure[];

export interface ComputeLayoutInputs {
  state: EditorState;
  document: Document | null;
  pageSize: PageSizePx;
  margins: PageMargins;
  columns: ColumnLayout | undefined;
  finalPageSize: PageSizePx;
  finalMargins: PageMargins;
  finalColumns: ColumnLayout | undefined;
  pageGap: number;
  contentWidth: number;
  theme: Theme | null | undefined;
  styles: StyleDefinitions | null | undefined;
  sectionProperties: SectionProperties | null | undefined;
  finalSectionProperties: SectionProperties | null | undefined;
  /** Resolved HF objects for the section (default + first-page). */
  headerContent: HeaderFooter | null | undefined;
  footerContent: HeaderFooter | null | undefined;
  firstPageHeaderContent: HeaderFooter | null | undefined;
  firstPageFooterContent: HeaderFooter | null | undefined;
  measureBlocks: MeasureBlocksFn;
  /** HF unification: the persistent PM doc for an HF, or null to re-parse content. */
  getHfPmDoc: (hf: HeaderFooter) => PMNode | null | undefined;
}

export interface LayoutComputation {
  blocks: FlowBlock[];
  measures: Measure[];
  layout: Layout;
  headerContentForRender: HeaderFooterContent | undefined;
  footerContentForRender: HeaderFooterContent | undefined;
  firstPageHeaderForRender: HeaderFooterContent | undefined;
  firstPageFooterForRender: HeaderFooterContent | undefined;
  hasTitlePg: boolean;
  watermark: Watermark | undefined;
  headerDistancePx: number | undefined;
  footerDistancePx: number | undefined;
  pageBorders: SectionProperties['pageBorders'] | undefined;
  footnotesByPage: Map<number, FootnoteRenderItem[]> | undefined;
}

/**
 * Resolve the document-level footnote column layout from `w15:footnoteColumns`.
 *
 * Footnotes paint N-up when any section opts into multiple footnote columns.
 * In a mixed-section document we take the first multi-column section's count
 * and full content width (a documented limitation — per-section footnote
 * column counts are a follow-up); the overwhelmingly common case is a single
 * uniform setting. Returns `{ columns: 1, columnWidth: fallback }` — i.e. the
 * unchanged single-column path — when no section opts in.
 */
function resolveFootnoteColumnLayout(
  document: Document | null,
  fallbackColumnWidth: number
): { columns: number; columnWidth: number } {
  const body = document?.package?.document;
  const sectionProps: Array<SectionProperties | null | undefined> = body
    ? [...(body.sections ?? []).map((s) => s.properties), body.finalSectionProperties]
    : [];
  const fnSection = sectionProps.find((p) => (p?.footnoteColumns ?? 1) > 1);
  if (!fnSection?.footnoteColumns) {
    return { columns: 1, columnWidth: fallbackColumnWidth };
  }

  const columns = fnSection.footnoteColumns;
  // Footnote columns span the section's full content width, independent of the
  // body's w:cols. Mirror the painter's width math so a footnote measured here
  // wraps exactly as it paints.
  const sectionContentWidthPx =
    fnSection.pageWidth != null
      ? twipsToPixels(
          fnSection.pageWidth - (fnSection.marginLeft ?? 1440) - (fnSection.marginRight ?? 1440)
        )
      : fallbackColumnWidth;
  const columnWidth = (sectionContentWidthPx - (columns - 1) * FOOTNOTE_COLUMN_GAP_PX) / columns;
  return { columns, columnWidth: Math.max(1, columnWidth) };
}

/**
 * Run the pure layout compute pass (the 6 steps in this file's header), lifted
 * verbatim from `useLayoutPipeline`. The adapter performs the DOM paint
 * (`renderPages`), scroll-restore, `painter:painted`, and state writeback with
 * the returned values.
 */
export function computeLayout(inputs: ComputeLayoutInputs): LayoutComputation {
  const {
    state,
    document,
    pageSize,
    margins,
    columns,
    finalPageSize,
    finalMargins,
    finalColumns,
    pageGap,
    contentWidth,
    theme,
    styles,
    sectionProperties,
    finalSectionProperties,
    headerContent,
    footerContent,
    firstPageHeaderContent,
    firstPageFooterContent,
    measureBlocks,
    getHfPmDoc,
  } = inputs;

  // Step 1: PM doc → flow blocks.
  const pageContentHeight = pageSize.h - margins.top - margins.bottom;
  const blocks = toFlowBlocks(state.doc, { theme, pageContentHeight });

  // Step 2: Measure all blocks (per-section widths; full measure for float context).
  const blockWidths = computePerBlockWidths(
    blocks,
    { pageSize, margins, columns },
    { pageSize: finalPageSize, margins: finalMargins, columns: finalColumns }
  );

  // Step 1.5: Demote full-width "floating" tables to inline. A positioned table
  // that leaves no room for text to wrap beside it (a common full-width contract
  // form table) is block-like in Word/Google Docs — it paginates across pages.
  // Our floating path instead paints it as one overflowing fragment AND makes
  // the next paragraph skip past the whole table height (a wrap zone), stranding
  // it off-page. Clearing `floating` here — before measure and layout — routes
  // it through `layoutTable` (which breaks rows across pages) and suppresses the
  // wrap zone. Purely a layout transform on the ephemeral FlowBlocks; the PM doc
  // and the saved DOCX keep the original floating table.
  demoteBlockLikeFloatingTables(blocks, blockWidths, contentWidth);

  const measures = measureBlocks(
    blocks,
    blockWidths,
    pageGeometryFromPage({ size: pageSize, margins })
  );

  // Step 2.5: Footnote references.
  const footnoteRefs = collectFootnoteRefs(blocks);
  const hasFootnotes = footnoteRefs.length > 0 && !!document?.package?.footnotes;

  // Step 2.75: Header/footer content for rendering (needed before layout to
  // compute effective margins when HF content exceeds available space).
  const hfMetricsHeader = { section: 'header' as const, pageSize, margins };
  const hfMetricsFooter = { section: 'footer' as const, pageSize, margins };
  const defaultTabStopTwips = state.doc.attrs?.defaultTabStopTwips as number | null;
  const hfOptions = { styles, theme, measureBlocks, defaultTabStopTwips };

  // HF unification phase 1: prefer the persistent PM doc when mounted.
  const convertHf = (
    hf: HeaderFooter | null | undefined,
    metrics: typeof hfMetricsHeader | typeof hfMetricsFooter
  ): HeaderFooterContent | undefined => {
    if (!hf) return undefined;
    const pmDoc = getHfPmDoc(hf);
    if (pmDoc) {
      return convertHeaderFooterPmDocToContent(pmDoc, contentWidth, metrics, hfOptions);
    }
    return convertHeaderFooterToContent(hf, contentWidth, metrics, hfOptions);
  };

  const headerContentForRender = convertHf(headerContent, hfMetricsHeader);
  const footerContentForRender = convertHf(footerContent, hfMetricsFooter);
  const hasTitlePg = sectionProperties?.titlePg === true;
  const firstPageHeaderForRender = hasTitlePg
    ? convertHf(firstPageHeaderContent, hfMetricsHeader)
    : undefined;
  const firstPageFooterForRender = hasTitlePg
    ? convertHf(firstPageFooterContent, hfMetricsFooter)
    : undefined;

  // Watermark rides PM state as a doc attr (so it's undoable).
  const watermark = (state.doc.attrs?.watermark as Watermark | null) ?? undefined;

  // Margin extension — push body clear of the header/footer bands (Word grows
  // the band when in-flow content exceeds the authored margin). Shared core
  // helper: uses in-flow `flowHeight` so page/margin-anchored floats (e.g. a
  // letterhead) don't push the body (issue #705), with a content-area clamp;
  // mutates each `sectionBreak.margins` in place.
  const { margins: effectiveMargins, finalMargins: effectiveFinalMargins } =
    extendMarginsForHeaderFooter({
      pageSize,
      margins,
      finalMargins,
      bodyBlocks: blocks,
      headers: [headerContentForRender, firstPageHeaderForRender],
      footers: [footerContentForRender, firstPageFooterForRender],
      warn: (msg) => console.warn(`[computeLayout] ${msg}`),
    });

  // Step 3: Layout onto pages (two-pass when footnotes exist).
  const bodyBreakType = finalSectionProperties?.sectionStart as
    | 'continuous'
    | 'nextPage'
    | 'evenPage'
    | 'oddPage'
    | undefined;
  const layoutOpts = {
    pageSize,
    margins: effectiveMargins,
    finalPageSize,
    finalMargins: effectiveFinalMargins,
    columns: finalColumns,
    bodyBreakType,
    pageGap,
  };

  let layout: Layout;
  let pageFootnoteMap = new Map<number, number[]>();
  let footnoteContentMap = new Map<number, FootnoteContent>();

  if (hasFootnotes) {
    const pass1Layout = layoutDocument(blocks, measures, layoutOpts);
    // w15:footnoteColumns: when a section lays its footnotes out in multiple
    // columns, measure each footnote at the column width (so it wraps the way
    // it will paint) rather than the full content width.
    const { columns: footnoteColumns, columnWidth: footnoteColumnWidth } =
      resolveFootnoteColumnLayout(document, contentWidth);
    footnoteContentMap = buildFootnoteContentMap(
      document!.package.footnotes!,
      footnoteRefs,
      footnoteColumnWidth,
      {
        styles: styles ?? undefined,
        theme: theme ?? null,
        measureBlocks,
        defaultTabStopTwips,
      }
    );
    const stabilized = stabilizeFootnoteLayout({
      blocks,
      measures,
      layoutOpts,
      footnoteRefs,
      footnoteContentMap,
      initialLayout: pass1Layout,
      footnoteColumns,
    });
    layout = stabilized.layout;
    pageFootnoteMap = stabilized.pageFootnoteMap;
  } else {
    layout = layoutDocument(blocks, measures, layoutOpts);
  }

  const footnotesByPage = hasFootnotes
    ? buildFootnoteRenderItems(pageFootnoteMap, footnoteContentMap, document)
    : undefined;

  return {
    blocks,
    measures,
    layout,
    headerContentForRender,
    footerContentForRender,
    firstPageHeaderForRender,
    firstPageFooterForRender,
    hasTitlePg,
    watermark,
    // Nullish, not truthy: an explicit `w:header="0"` must paint the header at
    // the page top, not fall back to the painter's 0.5in default (#740).
    headerDistancePx:
      sectionProperties?.headerDistance != null
        ? twipsToPixels(sectionProperties.headerDistance)
        : undefined,
    footerDistancePx:
      sectionProperties?.footerDistance != null
        ? twipsToPixels(sectionProperties.footerDistance)
        : undefined,
    pageBorders: sectionProperties?.pageBorders,
    footnotesByPage: footnotesByPage?.size ? footnotesByPage : undefined,
  };
}
