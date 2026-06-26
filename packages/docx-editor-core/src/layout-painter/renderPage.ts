/**
 * Page Renderer
 *
 * Renders a single page from Layout data to DOM elements.
 * Each page contains positioned fragments within a content area.
 *
 * This file owns the single-page orchestrator (`renderPage`) plus page-level
 * styling (background, borders, content area) and floating-image extraction
 * from paragraphs. Header/footer rendering lives in ./renderPage/headerFooter.ts,
 * footnote area rendering in ./renderPage/footnotes.ts, and the multi-page
 * virtualization / IntersectionObserver layer in ./renderPage/virtualization.ts.
 * @packageDocumentation
 * @public
 */

import type {
  Page,
  Fragment,
  ParagraphBlock,
  ParagraphMeasure,
  ParagraphFragment,
  ParagraphBorders,
  TableBlock,
  TableMeasure,
  TableFragment,
  ImageBlock,
  ImageMeasure,
  ImageFragment,
  ImageRun,
  TextBoxBlock,
  TextBoxMeasure,
  TextBoxFragment,
  SdtGroup,
} from '../layout-engine/types';
import { renderSdtBoundaryBoxes } from './sdtBoundary';
import { renderFragment } from './renderFragment';
import { renderParagraphFragment } from './renderParagraph';
import { renderTableFragment } from './renderTable';
import { renderImageFragment } from './renderImage';
import { renderTextBoxFragment } from './renderTextBox';
import type { BlockLookup } from './index';
import type { BorderSpec } from '../types/document';
import { borderToStyle } from '../utils/formatToStyle';
import type { Theme, Watermark } from '../types/document';
import { renderWatermarkLayer } from './renderWatermark';
import {
  measureParagraph,
  rectsToFloatingZones,
  type FloatingExclusionRect,
  type FloatingImageZone,
} from '../layout-bridge/measuring';
import { resolveFontFamily } from '../utils/fontResolver';
import { pointsToPixels } from '../utils/units';
import {
  floatingTextBoxReservesBand,
  floatingTextBoxWrapsText,
  isFloatingTextBoxBlock,
} from '../layout-engine/textBoxFlow';
import {
  floatingImageIsBehindDoc,
  floatingImageWrapsText,
  imageWrapTextFromCssFloat,
  isFloatingImageRun,
} from './floatingImageFlow';
import {
  pageGeometryFromPage,
  resolveAnchoredObjectPosition,
  type PageGeometry,
} from './anchoredObjectPosition';
import { renderFloatingImagesLayer } from './floatingImageLayer';
import {
  renderHeaderFooterContent,
  type HeaderFooterContent,
  type HeaderFooterLayoutInfo,
} from './renderPage/headerFooter';
import {
  renderFootnoteArea,
  calculateFootnoteAreaRenderHeight,
  type FootnoteRenderItem,
} from './renderPage/footnotes';

export {
  floatingImageIsBehindDoc,
  floatingImageWrapsText,
  isFloatingImageRun,
  isTextWrappingFloatingImageRun,
} from './floatingImageFlow';
export {
  renderFloatingImagesLayer,
  type FloatingImagePaintRecord,
  type FloatingImagesLayerOptions,
} from './floatingImageLayer';
export type { HeaderFooterContent, HeaderFooterLayoutInfo } from './renderPage/headerFooter';
export {
  resolveHeaderFooterFloatingTablePosition,
  resolveHeaderFooterFloatLeft,
} from './renderPage/headerFooter';
export type { FootnoteRenderItem } from './renderPage/footnotes';
export {
  renderPages,
  renderAllPagesNow,
  type RenderPagesUpdateKind,
} from './renderPage/virtualization';

/**
 * Page-level floating image that has been extracted from paragraphs.
 * These are positioned absolutely within the page's content area.
 */
interface PageFloatingImage {
  src: string;
  width: number;
  height: number;
  alt?: string;
  transform?: string;
  /** Which side: 'left' for left margin, 'right' for right margin */
  side: 'left' | 'right';
  /** X position relative to content area (0 = left edge of content) */
  x: number;
  /** Y position relative to content area (0 = top of content) */
  y: number;
  /** Wrap distances */
  distTop: number;
  distBottom: number;
  distLeft: number;
  distRight: number;
  /** ProseMirror start position for click-to-select */
  pmStart?: number;
  /** ProseMirror end position */
  pmEnd?: number;
  /** OOXML wrapText: which side(s) TEXT flows on */
  wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
  /** Wrap type (square, tight, through, topAndBottom) */
  wrapType?: string;
  /** wp:srcRect crop fractions [0..1]. */
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  /** a:alphaModFix → opacity. */
  opacity?: number;
}

/**
 * CSS class names for page elements
 */
export const PAGE_CLASS_NAMES = {
  page: 'layout-page',
  content: 'layout-page-content',
  header: 'layout-page-header',
  footer: 'layout-page-footer',
};

/**
 * Context passed to fragment renderers
 */
export interface RenderContext {
  /** Current page number (1-indexed) */
  pageNumber: number;
  /** Total number of pages */
  totalPages: number;
  /** Which section is being rendered */
  section: 'body' | 'header' | 'footer';
  /** Content width in pixels (page width minus margins) - used for justify */
  contentWidth?: number;
  /** When true, floating images render in-flow instead of being skipped (for table cells) */
  insideTableCell?: boolean;
  /** Comment IDs that are resolved — skip highlight for these */
  resolvedCommentIds?: Set<number>;
  /**
   * How the renderer should position its outer element. The body lays
   * fragments at absolute (x, y) on the page (`'absolute'`, the default),
   * while headers/footers and text boxes flow blocks vertically and let
   * normal document flow handle placement (`'flow'`). The caller passes
   * 'flow' instead of overwriting the renderer's inline styles after the
   * fact (#379).
   */
  positioning?: 'absolute' | 'flow';
}

/**
 * Options for rendering a page
 */
export interface RenderPageOptions {
  /** Document to create elements in (default: window.document) */
  document?: Document;
  /** Custom page class name */
  pageClassName?: string;
  /** Show page borders (for debugging) */
  showBorders?: boolean;
  /** Background color for pages */
  backgroundColor?: string;
  /** Drop shadow on pages */
  showShadow?: boolean;
  /** Header content to render (used for all pages, or pages 2+ when titlePg is set). */
  headerContent?: HeaderFooterContent;
  /** Footer content to render (used for all pages, or pages 2+ when titlePg is set). */
  footerContent?: HeaderFooterContent;
  /** Header content for the first page only (when titlePg is set). */
  firstPageHeaderContent?: HeaderFooterContent;
  /** Footer content for the first page only (when titlePg is set). */
  firstPageFooterContent?: HeaderFooterContent;
  /** Whether different first page headers/footers are enabled (w:titlePg). */
  titlePg?: boolean;
  /** Distance from page top to header content. */
  headerDistance?: number;
  /** Distance from page bottom to footer content. */
  footerDistance?: number;
  /** Block lookup for rendering actual content. */
  blockLookup?: BlockLookup;
  /** OOXML page borders from section properties. */
  pageBorders?: {
    top?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
    right?: BorderSpec;
    display?: 'allPages' | 'firstPage' | 'notFirstPage';
    offsetFrom?: 'page' | 'text';
    zOrder?: 'front' | 'back';
  };
  /** Theme for resolving border colors. */
  theme?: Theme | null;
  /** Footnotes to render at the bottom of this page. */
  footnoteArea?: FootnoteRenderItem[];
  /** Comment IDs that are resolved — skip highlight for these */
  resolvedCommentIds?: Set<number>;
  /** Watermark to paint behind body content (resolved from the page's section header). */
  watermark?: Watermark;
}

/**
 * Apply page styles to an element. Exported because virtualization.ts uses it
 * to size lightweight shells before content lands in them.
 */
export function applyPageStyles(
  element: HTMLElement,
  width: number,
  height: number,
  options: RenderPageOptions
): void {
  element.style.position = 'relative';
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  // Resolve via CSS custom properties so dark mode (.ep-root.dark) re-themes
  // the canvas without any adapter wiring. Word renders a dark page with light
  // text in dark mode; this is a VIEW transform only — the saved DOCX is never
  // changed, and authored run colors keep their own inline color.
  element.style.backgroundColor = options.backgroundColor ?? 'var(--doc-page-bg, #ffffff)';
  element.style.overflow = 'hidden';

  // Page-level default (11pt Calibri). Must use the same chain as canvas
  // measurement in measureContainer.ts, otherwise unbreakable runs that lack
  // an explicit fontFamily can overflow the page margin (#334).
  element.style.fontFamily = resolveFontFamily('Calibri').cssFallback;
  // Use pixels to match Canvas-based measurements (11pt = 11 * 96/72 ≈ 14.67px)
  element.style.fontSize = `${(11 * 96) / 72}px`;
  element.style.color = 'var(--doc-page-text, #000000)';

  if (options.showBorders) {
    element.style.border = '1px solid #ccc';
  }

  if (options.showShadow) {
    element.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
  }
}

function pageBorderShouldRender(
  pageNumber: number,
  display?: 'allPages' | 'firstPage' | 'notFirstPage'
): boolean {
  switch (display ?? 'allPages') {
    case 'firstPage':
      return pageNumber === 1;
    case 'notFirstPage':
      return pageNumber !== 1;
    case 'allPages':
    default:
      return true;
  }
}

function pageBorderSpacePx(border: BorderSpec | undefined): number {
  return border?.space !== undefined ? pointsToPixels(border.space) : 0;
}

function applyPageBorderSide(
  element: HTMLElement,
  border: BorderSpec | undefined,
  side: 'Top' | 'Bottom' | 'Left' | 'Right',
  theme?: Theme | null
): void {
  if (!border || border.style === 'none' || border.style === 'nil') return;

  const styles = borderToStyle(border, side, theme);
  for (const [key, value] of Object.entries(styles)) {
    (element.style as unknown as Record<string, string>)[key] = String(value);
  }

  const styleKey = `border${side}Style`;
  const widthKey = `border${side}Width`;
  const styleValue = (element.style as unknown as Record<string, string>)[styleKey];
  if (styleValue === 'double') {
    const widthValue = parseFloat((element.style as unknown as Record<string, string>)[widthKey]);
    if (!Number.isFinite(widthValue) || widthValue < 3) {
      (element.style as unknown as Record<string, string>)[widthKey] = '3px';
    }
  }
}

function renderPageBorderOverlay(
  page: Page,
  options: RenderPageOptions,
  doc: Document
): HTMLElement | null {
  const pb = options.pageBorders;
  if (!pb || !pageBorderShouldRender(page.number, pb.display)) return null;

  const hasBorder = [pb.top, pb.bottom, pb.left, pb.right].some(
    (border) => border && border.style !== 'none' && border.style !== 'nil'
  );
  if (!hasBorder) return null;

  const offsetFrom = pb.offsetFrom ?? 'text';
  const topOffset = pageBorderSpacePx(pb.top);
  const rightOffset = pageBorderSpacePx(pb.right);
  const bottomOffset = pageBorderSpacePx(pb.bottom);
  const leftOffset = pageBorderSpacePx(pb.left);

  const overlay = doc.createElement('div');
  overlay.className = 'layout-page-border';
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.boxSizing = 'border-box';
  overlay.style.zIndex = pb.zOrder === 'back' ? '0' : '20';

  if (offsetFrom === 'page') {
    overlay.style.top = `${topOffset}px`;
    overlay.style.right = `${rightOffset}px`;
    overlay.style.bottom = `${bottomOffset}px`;
    overlay.style.left = `${leftOffset}px`;
  } else {
    overlay.style.top = `${Math.max(0, page.margins.top - topOffset)}px`;
    overlay.style.right = `${Math.max(0, page.margins.right - rightOffset)}px`;
    overlay.style.bottom = `${Math.max(0, page.margins.bottom - bottomOffset)}px`;
    overlay.style.left = `${Math.max(0, page.margins.left - leftOffset)}px`;
  }

  applyPageBorderSide(overlay, pb.top, 'Top', options.theme);
  applyPageBorderSide(overlay, pb.bottom, 'Bottom', options.theme);
  applyPageBorderSide(overlay, pb.left, 'Left', options.theme);
  applyPageBorderSide(overlay, pb.right, 'Right', options.theme);

  return overlay;
}

/**
 * Apply content area styles to an element
 */
function applyContentAreaStyles(element: HTMLElement, page: Page): void {
  const margins = page.margins;

  element.style.position = 'absolute';
  element.style.top = `${margins.top}px`;
  element.style.left = `${margins.left}px`;
  element.style.right = `${margins.right}px`;
  element.style.bottom = `${margins.bottom}px`;
  element.style.overflow = 'visible';
}

/**
 * Apply fragment positioning styles
 * Note: Fragment x/y include page margins, but fragments are positioned
 * inside the content area which already has margin offsets applied.
 * So we subtract the margins to get content-area-relative positions.
 */
function applyFragmentStyles(
  element: HTMLElement,
  fragment: Fragment,
  margins: { left: number; top: number }
): void {
  element.style.position = 'absolute';
  element.style.left = `${fragment.x - margins.left}px`;
  // Tables draw 1px cell borders on an internal whole-pixel row grid; if the
  // table's own top is fractional those borders fall between device pixels and
  // render unevenly soft/thick. Snap a table's top (and height) to whole pixels
  // so its border grid aligns with the page (which sits on the pixel grid).
  const top = fragment.y - margins.top;
  element.style.top = `${fragment.kind === 'table' ? Math.round(top) : top}px`;
  element.style.width = `${fragment.width}px`;

  // Height handling varies by fragment type. Tables set their own height in
  // renderTableFragment (from the rounded row stack, so the bottom border isn't
  // clipped) — don't override it here.
  if ('height' in fragment && fragment.kind !== 'table') {
    element.style.height = `${fragment.height}px`;
  }
}

/**
 * Extract floating images from a paragraph block and determine their page-level positions.
 * Returns extracted images and info for the paragraph about space reserved.
 */
function extractFloatingImagesFromParagraph(
  block: ParagraphBlock,
  fragmentY: number, // Y position of the paragraph fragment on the page (relative to content area)
  contentWidth: number, // Width of the content area
  geometry?: PageGeometry
): PageFloatingImage[] {
  const floatingImages: PageFloatingImage[] = [];

  for (const run of block.runs) {
    if (run.kind !== 'image') continue;
    const imgRun = run as ImageRun;

    if (!isFloatingImageRun(imgRun)) continue;

    const distTop = imgRun.distTop ?? 0;
    const distBottom = imgRun.distBottom ?? 0;
    const distLeft = imgRun.distLeft ?? 12;
    const distRight = imgRun.distRight ?? 12;
    const { x, y, side } = resolveAnchoredObjectPosition(imgRun, fragmentY, contentWidth, geometry);

    floatingImages.push({
      src: imgRun.src,
      width: imgRun.width,
      height: imgRun.height,
      alt: imgRun.alt,
      transform: imgRun.transform,
      side,
      x,
      y,
      distTop,
      distBottom,
      distLeft,
      distRight,
      pmStart: imgRun.pmStart,
      pmEnd: imgRun.pmEnd,
      wrapText: imageWrapTextFromCssFloat(imgRun.cssFloat),
      wrapType: imgRun.wrapType,
      cropTop: imgRun.cropTop,
      cropRight: imgRun.cropRight,
      cropBottom: imgRun.cropBottom,
      cropLeft: imgRun.cropLeft,
      opacity: imgRun.opacity,
    });
  }

  return floatingImages;
}

/**
 * Render a single page to DOM
 *
 * @param page - The page to render
 * @param context - Rendering context
 * @param options - Rendering options
 * @returns The page DOM element
 */
export function renderPage(
  page: Page,
  context: RenderContext,
  options: RenderPageOptions = {}
): HTMLElement {
  const doc = options.document ?? document;

  // Create page container
  const pageEl = doc.createElement('div');
  pageEl.className = options.pageClassName ?? PAGE_CLASS_NAMES.page;
  pageEl.dataset.pageNumber = String(page.number);

  applyPageStyles(pageEl, page.size.w, page.size.h, options);

  // Watermark layer: painted first so it sits behind the body content area
  // (which is appended later), matching Word's behind-text watermark.
  if (options.watermark) {
    const watermarkLayer = renderWatermarkLayer(options.watermark, page, doc);
    if (watermarkLayer) {
      pageEl.appendChild(watermarkLayer);
    }
  }

  const pageBorderEl = renderPageBorderOverlay(page, options, doc);
  if (pageBorderEl && options.pageBorders?.zOrder === 'back') {
    pageEl.appendChild(pageBorderEl);
  }

  // Create content area
  const contentEl = doc.createElement('div');
  contentEl.className = PAGE_CLASS_NAMES.content;
  applyContentAreaStyles(contentEl, page);

  // Calculate content width for justify alignment
  const pageGeometry = pageGeometryFromPage(page);
  const contentWidth = pageGeometry.contentWidth;

  // PHASE 1: Extract all floating images from paragraphs on this page
  const allFloatingImages: PageFloatingImage[] = [];
  const floatingRects: FloatingExclusionRect[] = [];

  for (const fragment of page.fragments) {
    if (fragment.kind === 'paragraph' && options.blockLookup) {
      const blockData = options.blockLookup.get(String(fragment.blockId));
      if (blockData?.block.kind === 'paragraph') {
        const paragraphBlock = blockData.block as ParagraphBlock;
        // Fragment Y is relative to page top, we need it relative to content area
        const contentRelativeY = fragment.y - page.margins.top;
        const extracted = extractFloatingImagesFromParagraph(
          paragraphBlock,
          contentRelativeY,
          contentWidth,
          pageGeometry
        );
        allFloatingImages.push(...extracted);

        // Note: topAndBottom images are handled by measureParagraph as block images
        // (they get their own line). No exclusion zones needed for them.
      }
    }
  }

  // Collect floating image exclusion rectangles
  for (const img of allFloatingImages) {
    if (!floatingImageWrapsText(img)) continue;

    floatingRects.push({
      side: img.side,
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
      distTop: img.distTop,
      distBottom: img.distBottom,
      distLeft: img.distLeft,
      distRight: img.distRight,
      wrapText: img.wrapText,
      wrapType: img.wrapType,
    });
  }

  // Collect floating table exclusion rectangles
  if (options.blockLookup) {
    for (const fragment of page.fragments) {
      if (fragment.kind !== 'table') continue;
      const blockData = options.blockLookup.get(String(fragment.blockId));
      if (blockData?.block.kind !== 'table') continue;
      const tableBlock = blockData.block as TableBlock;
      const floating = tableBlock.floating;
      if (!floating) continue;

      const contentX = fragment.x - page.margins.left;
      const contentY = fragment.y - page.margins.top;

      const distTop = floating.topFromText ?? 0;
      const distBottom = floating.bottomFromText ?? 0;
      const distLeft = floating.leftFromText ?? 12;
      const distRight = floating.rightFromText ?? 12;

      const side = contentX < contentWidth / 2 ? 'left' : 'right';

      floatingRects.push({
        side,
        x: contentX,
        y: contentY,
        width: fragment.width,
        height: fragment.height,
        distTop,
        distBottom,
        distLeft,
        distRight,
      });
    }
  }

  // Collect floating text box exclusion rectangles and resolve their final page positions.
  if (options.blockLookup) {
    for (const fragment of page.fragments) {
      if (fragment.kind !== 'textBox') continue;
      const blockData = options.blockLookup.get(String(fragment.blockId));
      if (blockData?.block.kind !== 'textBox') continue;
      const textBoxBlock = blockData.block as TextBoxBlock;
      if (!isFloatingTextBoxBlock(textBoxBlock)) continue;

      const anchorContentY = fragment.y - page.margins.top;
      const resolved = resolveAnchoredObjectPosition(
        {
          width: fragment.width,
          height: fragment.height,
          position: textBoxBlock.position,
          cssFloat: textBoxBlock.cssFloat,
        },
        anchorContentY,
        contentWidth,
        pageGeometry
      );

      fragment.x = page.margins.left + resolved.x;
      fragment.y = page.margins.top + resolved.y;

      // topAndBottom reserves a full-width band (text flows above/below);
      // side-wrap types reserve a side exclusion. Both push a rect — the band
      // is distinguished by `wrapType` in rectsToFloatingZones.
      const reservesBand = floatingTextBoxReservesBand(textBoxBlock);
      if (!reservesBand && !floatingTextBoxWrapsText(textBoxBlock)) continue;

      floatingRects.push({
        side: resolved.side,
        x: resolved.x,
        y: resolved.y,
        width: fragment.width,
        height: fragment.height,
        distTop: textBoxBlock.distTop ?? 0,
        distBottom: textBoxBlock.distBottom ?? 0,
        distLeft: textBoxBlock.distLeft ?? 12,
        distRight: textBoxBlock.distRight ?? 12,
        wrapText: textBoxBlock.wrapText,
        wrapType: textBoxBlock.wrapType,
      });
    }
  }

  // PHASE 2: Convert floating rects to per-image measurement zones
  const floatingZones: FloatingImageZone[] =
    floatingRects.length > 0 ? rectsToFloatingZones(floatingRects, contentWidth) : [];

  // PHASE 3: Render behind-text floating images before text fragments.
  const behindFloatingImages = allFloatingImages.filter(floatingImageIsBehindDoc);
  const frontFloatingImages = allFloatingImages.filter((img) => !floatingImageIsBehindDoc(img));
  if (behindFloatingImages.length > 0) {
    const floatingLayer = renderFloatingImagesLayer(behindFloatingImages, doc, {
      layerClass: 'layout-floating-images-layer',
      itemClass: 'layout-page-floating-image',
      sizing: 'inset0',
      layerMode: 'behind',
    });
    contentEl.appendChild(floatingLayer);
  }

  // PHASE 4: Render each fragment with floating image awareness
  // Helper to peek at a fragment's paragraph borders (for border grouping)
  const getParaBorders = (frag: Fragment): ParagraphBorders | undefined => {
    if (frag.kind !== 'paragraph' || !options.blockLookup || !frag.blockId) return undefined;
    const blockData = options.blockLookup.get(String(frag.blockId));
    if (blockData?.block.kind === 'paragraph')
      return (blockData.block as ParagraphBlock).attrs?.borders;
    return undefined;
  };

  let prevParagraphBorders: ParagraphBorders | undefined;
  const renderedInlineImageKeysByBlock = new Map<string, Set<string>>();

  // Block-level Structured Document Tag (content control) membership for a
  // fragment, derived from its block's `sdtGroups` (set in toFlowBlocks).
  const sdtGroupsOf = (frag: Fragment): SdtGroup[] => {
    if (!options.blockLookup || !frag.blockId) return [];
    return options.blockLookup.get(String(frag.blockId))?.block.sdtGroups ?? [];
  };

  /**
   * Stamp a painted fragment with its enclosing content-control identity, so
   * selection / addressing can find the region by tag/alias. The innermost
   * group drives the dataset attrs; the visible boundary box is drawn
   * separately (see `renderSdtBoundaryBoxes`) so a multi-block control reads
   * as one rounded rectangle rather than per-fragment rules.
   */
  const stampSdtFragment = (el: HTMLElement, groups: SdtGroup[]): void => {
    if (groups.length === 0) return;
    const innermost = groups[groups.length - 1];
    el.classList.add('layout-block-sdt');
    el.dataset.sdtGroupId = innermost.id;
    el.dataset.sdtType = innermost.sdtType;
    el.dataset.sdtDepth = String(groups.length);
    if (innermost.tag != null) el.dataset.sdtTag = innermost.tag;
    if (innermost.alias != null) el.dataset.sdtAlias = innermost.alias;
    if (innermost.lock != null) el.dataset.sdtLock = innermost.lock;
  };

  for (let i = 0; i < page.fragments.length; i++) {
    const fragment = page.fragments[i];
    let fragmentEl: HTMLElement;
    const fragmentContext = { ...context, section: 'body' as const, contentWidth };

    // Calculate fragment's Y position relative to content area (for per-line margin calculation)
    const fragmentContentY = fragment.y - page.margins.top;

    // If we have block lookup, try to render full content based on fragment type
    if (options.blockLookup && fragment.blockId) {
      const blockData = options.blockLookup.get(String(fragment.blockId));

      if (
        fragment.kind === 'paragraph' &&
        blockData?.block.kind === 'paragraph' &&
        blockData?.measure.kind === 'paragraph'
      ) {
        const paragraphBlock = blockData.block as ParagraphBlock;
        const nextBorders =
          i + 1 < page.fragments.length ? getParaBorders(page.fragments[i + 1]) : undefined;
        const blockKey = String(fragment.blockId);
        let renderedInlineImageKeys = renderedInlineImageKeysByBlock.get(blockKey);
        if (!renderedInlineImageKeys) {
          renderedInlineImageKeys = new Set<string>();
          renderedInlineImageKeysByBlock.set(blockKey, renderedInlineImageKeys);
        }

        // Re-measure paragraph with floating zones for text wrapping
        let paragraphMeasure = blockData.measure as ParagraphMeasure;
        if (floatingZones.length > 0) {
          paragraphMeasure = measureParagraph(paragraphBlock, contentWidth, {
            floatingZones,
            paragraphYOffset: fragmentContentY,
          });
        }

        fragmentEl = renderParagraphFragment(
          fragment as ParagraphFragment,
          paragraphBlock,
          paragraphMeasure,
          fragmentContext,
          {
            document: doc,
            fragmentContentY: fragmentContentY,
            prevBorders: prevParagraphBorders,
            nextBorders,
            renderedInlineImageKeys,
          }
        );
        prevParagraphBorders = paragraphBlock.attrs?.borders;
      } else if (
        fragment.kind === 'table' &&
        blockData?.block.kind === 'table' &&
        blockData?.measure.kind === 'table'
      ) {
        fragmentEl = renderTableFragment(
          fragment as TableFragment,
          blockData.block as TableBlock,
          blockData.measure as TableMeasure,
          fragmentContext,
          { document: doc }
        );
        prevParagraphBorders = undefined;
      } else if (
        fragment.kind === 'image' &&
        blockData?.block.kind === 'image' &&
        blockData?.measure.kind === 'image'
      ) {
        fragmentEl = renderImageFragment(
          fragment as ImageFragment,
          blockData.block as ImageBlock,
          blockData.measure as ImageMeasure,
          fragmentContext,
          { document: doc }
        );
        prevParagraphBorders = undefined;
      } else if (
        fragment.kind === 'textBox' &&
        blockData?.block.kind === 'textBox' &&
        blockData?.measure.kind === 'textBox'
      ) {
        fragmentEl = renderTextBoxFragment(
          fragment as TextBoxFragment,
          blockData.block as TextBoxBlock,
          blockData.measure as TextBoxMeasure,
          fragmentContext,
          { document: doc }
        );
        prevParagraphBorders = undefined;
      } else {
        // Fallback to placeholder
        fragmentEl = renderFragment(fragment, fragmentContext, { document: doc });
        prevParagraphBorders = undefined;
      }
    } else {
      // Use placeholder when no blockLookup
      fragmentEl = renderFragment(fragment, fragmentContext, { document: doc });
      prevParagraphBorders = undefined;
    }

    applyFragmentStyles(fragmentEl, fragment, { left: page.margins.left, top: page.margins.top });

    // Tag fragments enclosed by a block-level content control so selection /
    // addressing can find the region; the boundary box is drawn afterward.
    stampSdtFragment(fragmentEl, sdtGroupsOf(fragment));

    contentEl.appendChild(fragmentEl);
  }

  // Draw one boundary box per block-level content control on this page,
  // spanning the vertical extent of its fragments at content width — so a
  // multi-block (or nested) control reads as a single rounded rectangle with
  // a corner label, matching Word. Nested controls each get their own box.
  renderSdtBoundaryBoxes(page, contentEl, contentWidth, sdtGroupsOf, doc);

  // Render in-front floating images after text fragments so wrapNone and
  // wrapping images paint above body text without participating in flow.
  if (frontFloatingImages.length > 0) {
    const floatingLayer = renderFloatingImagesLayer(frontFloatingImages, doc, {
      layerClass: 'layout-floating-images-layer',
      itemClass: 'layout-page-floating-image',
      sizing: 'inset0',
      layerMode: 'front',
    });
    contentEl.appendChild(floatingLayer);
  }

  // Render column separator lines between columns (when w:sep is set)
  if (page.columns && page.columns.separator && page.columns.count > 1) {
    const colCount = page.columns.count;
    const colGap = page.columns.gap;
    const colWidth = (contentWidth - (colCount - 1) * colGap) / colCount;
    const contentHeight = page.size.h - page.margins.top - page.margins.bottom;

    for (let col = 0; col < colCount - 1; col++) {
      const lineX = (col + 1) * colWidth + col * colGap + colGap / 2;
      const line = doc.createElement('div');
      line.style.position = 'absolute';
      line.style.left = `${lineX}px`;
      line.style.top = '0';
      line.style.height = `${contentHeight}px`;
      line.style.width = '0.5px';
      line.style.backgroundColor = '#000';
      line.style.pointerEvents = 'none';
      contentEl.appendChild(line);
    }
  }

  // Render footnote area at the bottom of the content area (above footer)
  if (options.footnoteArea && options.footnoteArea.length > 0) {
    const footnoteColumns = page.footnoteColumns ?? 1;
    const fnAreaEl = renderFootnoteArea(
      options.footnoteArea,
      contentWidth,
      context,
      doc,
      footnoteColumns
    );
    fnAreaEl.style.position = 'absolute';
    // Position at page bottom minus bottom margin (bottom of content area).
    // The reserved height includes the separator + the tallest footnote column
    // (multi-column footnotes sit side by side, so the area is as tall as the
    // tallest column, not the sum of every footnote).
    const reservedHeight = Math.max(
      page.footnoteReservedHeight ?? 0,
      calculateFootnoteAreaRenderHeight(options.footnoteArea, footnoteColumns)
    );
    const contentAreaBottom = page.size.h - page.margins.bottom - page.margins.top;
    fnAreaEl.style.top = `${Math.max(-page.margins.top, contentAreaBottom - reservedHeight)}px`;
    fnAreaEl.style.left = '0';
    fnAreaEl.style.right = '0';
    contentEl.appendChild(fnAreaEl);
  }

  pageEl.appendChild(contentEl);

  // Render header area (always rendered for hover hint / double-click target)
  {
    const defaultHeaderDistance = 48;
    const headerDistance = options.headerDistance ?? page.margins.header ?? defaultHeaderDistance;
    const headerContentWidth = page.size.w - page.margins.left - page.margins.right;
    const availableHeaderHeight = Math.max(page.margins.top - headerDistance, 48);
    const headerVisualTop = options.headerContent?.visualTop ?? 0;
    const headerVisualBottom =
      options.headerContent?.visualBottom ?? options.headerContent?.height ?? 0;
    // The interactive box height tracks the in-flow band (`flowHeight`), NOT the
    // float-inclusive `visualBottom`. A page/margin-anchored shape (e.g. a
    // full-page letterhead in a header) overflows the band visually but must not
    // inflate the header element's box — otherwise it covers the body and
    // swallows clicks meant for the document text (#856). Floating content still
    // renders (overflow stays visible below) and is made non-interactive in
    // normal mode via CSS so it never intercepts body clicks.
    const headerFlowHeight =
      options.headerContent?.flowHeight ?? options.headerContent?.height ?? 0;
    const interactiveHeaderHeight = Math.max(headerFlowHeight - Math.min(0, headerVisualTop), 24);
    // If header content fits in the original space, clip overflow; otherwise
    // margins.top was already expanded so let content show fully.
    const headerOverflows = headerVisualBottom > availableHeaderHeight;

    const headerEl = doc.createElement('div');
    headerEl.className = PAGE_CLASS_NAMES.header;
    headerEl.style.position = 'absolute';
    headerEl.style.top = `${headerDistance + headerVisualTop}px`;
    headerEl.style.left = `${page.margins.left}px`;
    headerEl.style.right = `${page.margins.right}px`;
    headerEl.style.width = `${headerContentWidth}px`;
    headerEl.style.height = `${interactiveHeaderHeight}px`;
    headerEl.style.minHeight = `${interactiveHeaderHeight}px`;

    let shouldClipHeader = !headerOverflows;
    if (options.headerContent && options.headerContent.blocks.length > 0) {
      const layout: HeaderFooterLayoutInfo = {
        flowTop: headerDistance,
        flowLeft: page.margins.left,
        contentWidth: headerContentWidth,
        pageWidth: page.size.w,
        pageHeight: page.size.h,
        margins: page.margins,
      };
      const headerContentEl = renderHeaderFooterContent(
        options.headerContent,
        { ...context, section: 'header', contentWidth: headerContentWidth },
        options,
        layout
      );
      headerContentEl.style.top = `${-headerVisualTop}px`;
      // Do not clip header containers that include media. Their measured content
      // height can exclude absolutely positioned runs, which causes visible cut-off.
      if (headerContentEl.querySelector('img')) {
        shouldClipHeader = false;
      }
      headerEl.appendChild(headerContentEl);
    }
    if (shouldClipHeader) {
      headerEl.style.maxHeight = `${availableHeaderHeight}px`;
      headerEl.style.overflow = 'hidden';
    }
    pageEl.appendChild(headerEl);
  }

  // Render footer area (always rendered for hover hint / double-click target)
  {
    const defaultFooterDistance = 48;
    const footerDistance = options.footerDistance ?? page.margins.footer ?? defaultFooterDistance;
    const footerContentWidth = page.size.w - page.margins.left - page.margins.right;
    const availableFooterHeight = Math.max(page.margins.bottom - footerDistance, 48);
    const footerVisualTop = options.footerContent?.visualTop ?? 0;
    const footerVisualBottom =
      options.footerContent?.visualBottom ?? options.footerContent?.height ?? 0;
    const actualFooterHeight = Math.max(footerVisualBottom - footerVisualTop, 24);
    const footerOverflows = actualFooterHeight > availableFooterHeight;
    // Same as the header: the interactive box tracks the in-flow band, not a
    // floating shape's extent, so a tall anchored footer object can't cover the
    // body and swallow clicks (#856). The box stays bottom-anchored at the
    // footer line; floating content overflows upward (visible) and is made
    // non-interactive in normal mode via CSS.
    const footerFlowHeight =
      options.footerContent?.flowHeight ?? options.footerContent?.height ?? 0;
    const interactiveFooterHeight = Math.max(footerFlowHeight - Math.min(0, footerVisualTop), 24);

    const footerEl = doc.createElement('div');
    footerEl.className = PAGE_CLASS_NAMES.footer;
    footerEl.style.position = 'absolute';
    footerEl.style.top = `${page.size.h - footerDistance - interactiveFooterHeight}px`;
    footerEl.style.left = `${page.margins.left}px`;
    footerEl.style.right = `${page.margins.right}px`;
    footerEl.style.width = `${footerContentWidth}px`;
    footerEl.style.height = `${interactiveFooterHeight}px`;
    footerEl.style.minHeight = `${interactiveFooterHeight}px`;

    let shouldClipFooter = !footerOverflows;
    if (options.footerContent && options.footerContent.blocks.length > 0) {
      const layout: HeaderFooterLayoutInfo = {
        flowTop: page.size.h - footerDistance - (options.footerContent?.height ?? 0),
        flowLeft: page.margins.left,
        contentWidth: footerContentWidth,
        pageWidth: page.size.w,
        pageHeight: page.size.h,
        margins: page.margins,
      };
      const footerContentEl = renderHeaderFooterContent(
        options.footerContent,
        { ...context, section: 'footer', contentWidth: footerContentWidth },
        options,
        layout
      );
      // The box shrank from `actualFooterHeight` to `interactiveFooterHeight`
      // with its bottom pinned, so its top moved down by the difference. Offset
      // the content up by the same amount to keep it painted in place (a normal
      // footer with no float has a zero delta, so this is a no-op there).
      footerContentEl.style.top = `${-footerVisualTop - (actualFooterHeight - interactiveFooterHeight)}px`;
      if (footerContentEl.querySelector('img')) {
        shouldClipFooter = false;
      }
      footerEl.appendChild(footerContentEl);
    }
    if (shouldClipFooter) {
      footerEl.style.maxHeight = `${availableFooterHeight}px`;
      footerEl.style.overflow = 'hidden';
    }
    pageEl.appendChild(footerEl);
  }

  if (pageBorderEl && options.pageBorders?.zOrder !== 'back') {
    pageEl.appendChild(pageBorderEl);
  }

  return pageEl;
}
