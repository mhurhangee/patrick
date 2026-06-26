/**
 * Header / footer rendering for renderPage.
 *
 * Owns `renderHeaderFooterContent` — the mini-flow that lays paragraphs and
 * tables inside a header/footer container (separate from the body flow) —
 * plus the floating-image and floating-table positioning helpers used by
 * that flow. Coordinates returned by `resolveHeaderFooterFloatingTablePosition`
 * are relative to the HF container's flow origin (`layout.flowTop`/`flowLeft`)
 * so callers can drop them into `style.top`/`style.left`.
 */

import type {
  FlowBlock,
  Measure,
  ParagraphBlock,
  ParagraphFragment,
  TableBlock,
  TableFragment,
  ImageFragment,
  TextBoxFragment,
} from '../../layout-engine/types';
import { assertExhaustiveFlowBlock } from '../../layout-engine/types';
import { renderParagraphFragment } from '../renderParagraph';
import { renderTableFragment } from '../renderTable';
import { renderImageFragment } from '../renderImage';
import { renderTextBoxFragment } from '../renderTextBox';
import { emuToPixels } from '../../utils/units';
import type { RenderContext, RenderPageOptions } from '../renderPage';

/**
 * Header/footer content for rendering
 */
export interface HeaderFooterContent {
  /** Flow blocks for the header/footer content. */
  blocks: FlowBlock[];
  /** Measurements for the blocks. */
  measures: Measure[];
  /** Total height of the content (in-flow stack incl. floating blocks). */
  height: number;
  /**
   * In-flow band height: the height of strictly in-flow content
   * (paragraphs, tables, inline images/text boxes), EXCLUDING anchored /
   * floating objects. This is what grows the header/footer band and pushes
   * the body margin, mirroring Word: a page/margin-anchored shape (e.g. a
   * full-page letterhead in a header) is positioned independently and does
   * NOT push body text down. Use this — not `height`/`visualBottom` — for
   * margin extension. Falls back to `height` when undefined.
   */
  flowHeight?: number;
  /** Top-most visual extent relative to the nominal flow origin. */
  visualTop?: number;
  /** Bottom-most visual extent relative to the nominal flow origin. */
  visualBottom?: number;
}

export interface HeaderFooterLayoutInfo {
  flowTop: number;
  flowLeft: number;
  contentWidth: number;
  pageWidth: number;
  pageHeight: number;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

function getPositionAlignment(
  position: { align?: string; alignment?: string } | undefined
): string | undefined {
  return position?.align ?? position?.alignment;
}

function resolveHeaderFooterFloatTop(
  floatImg: {
    height: number;
    paragraphY: number;
    position: {
      vertical?: { relativeTo?: string; posOffset?: number; align?: string; alignment?: string };
    };
  },
  layout: HeaderFooterLayoutInfo
): number {
  const v = floatImg.position.vertical;
  if (!v) {
    return floatImg.paragraphY;
  }

  const align = getPositionAlignment(v);
  const offsetPx = v.posOffset !== undefined ? emuToPixels(v.posOffset) : undefined;

  if (v.relativeTo === 'page') {
    if (offsetPx !== undefined) {
      return offsetPx - layout.flowTop;
    }
    if (align === 'top') {
      return -layout.flowTop;
    }
    if (align === 'bottom') {
      return layout.pageHeight - floatImg.height - layout.flowTop;
    }
    if (align === 'center') {
      return (layout.pageHeight - floatImg.height) / 2 - layout.flowTop;
    }
  }

  if (v.relativeTo === 'margin') {
    const marginTop = layout.margins.top;
    const marginHeight = layout.pageHeight - layout.margins.top - layout.margins.bottom;
    if (offsetPx !== undefined) {
      return marginTop + offsetPx - layout.flowTop;
    }
    if (align === 'top') {
      return marginTop - layout.flowTop;
    }
    if (align === 'bottom') {
      return marginTop + marginHeight - floatImg.height - layout.flowTop;
    }
    if (align === 'center') {
      return marginTop + (marginHeight - floatImg.height) / 2 - layout.flowTop;
    }
  }

  if (offsetPx !== undefined) {
    return floatImg.paragraphY + offsetPx;
  }

  return floatImg.paragraphY;
}

/**
 * Resolve the CSS `left` (px) for an anchored object (image or text box) in a
 * header/footer, honoring `wp:positionH` (relativeTo page/margin, align
 * left/center/right, or posOffset). Shared by floating images and text boxes so
 * a page-centered text box in the header lands centered like Word, not pinned
 * to the left.
 */
export function resolveHeaderFooterFloatLeft(
  width: number,
  h: { relativeTo?: string; posOffset?: number; align?: string; alignment?: string } | undefined,
  layout: HeaderFooterLayoutInfo
): string {
  if (!h) return '0';
  const align = getPositionAlignment(h);

  if (h.relativeTo === 'page') {
    if (h.posOffset !== undefined) return `${emuToPixels(h.posOffset) - layout.flowLeft}px`;
    if (align === 'right') return `${layout.pageWidth - width - layout.flowLeft}px`;
    if (align === 'center') return `${(layout.pageWidth - width) / 2 - layout.flowLeft}px`;
    if (align === 'left') return `${-layout.flowLeft}px`;
  }

  // `relativeTo: margin` falls through here intentionally: the HF content width
  // IS the margin box, so the content-relative branch is already margin-correct.
  if (h.posOffset !== undefined) return `${emuToPixels(h.posOffset)}px`;
  if (align === 'right') return `${layout.contentWidth - width}px`;
  if (align === 'center') return `${(layout.contentWidth - width) / 2}px`;

  return '0';
}

function applyHeaderFooterFloatHorizontalPosition(
  img: HTMLImageElement,
  floatImg: {
    width: number;
    position: {
      horizontal?: { relativeTo?: string; posOffset?: number; align?: string; alignment?: string };
    };
  },
  layout: HeaderFooterLayoutInfo
): void {
  img.style.left = resolveHeaderFooterFloatLeft(
    floatImg.width,
    floatImg.position.horizontal,
    layout
  );
}

/**
 * Resolve the (left, top) position for a floating table inside a header/
 * footer container, per ECMA-376 §17.4.57. The table's `floating.tblpX/tblpY`
 * are already in pixels (parser converted from twips); `horzAnchor`/
 * `vertAnchor` decide whether the offset is relative to the page, the
 * margins, or the surrounding text/column. Coordinates returned are
 * relative to the HF container's flow origin (`layout.flowTop` /
 * `layout.flowLeft`) so the caller can drop them straight into
 * `style.top` / `style.left`.
 */
export function resolveHeaderFooterFloatingTablePosition(
  floating: NonNullable<TableBlock['floating']>,
  layout: HeaderFooterLayoutInfo
): { left: number; top: number } {
  // Vertical: tblpY relative to vertAnchor.
  let top = floating.tblpY ?? 0;
  if (floating.vertAnchor === 'page') {
    top -= layout.flowTop;
  } else if (floating.vertAnchor === 'margin') {
    top += layout.margins.top - layout.flowTop;
  }

  // Horizontal: tblpX relative to horzAnchor.
  let left = floating.tblpX ?? 0;
  if (floating.horzAnchor === 'page') {
    left -= layout.flowLeft;
  } else if (floating.horzAnchor === 'margin') {
    left += layout.margins.left - layout.flowLeft;
  }

  return { left, top };
}

/**
 * Render header or footer content
 */
export function renderHeaderFooterContent(
  content: HeaderFooterContent,
  context: RenderContext,
  options: RenderPageOptions,
  layout: HeaderFooterLayoutInfo
): HTMLElement {
  const doc = options.document ?? document;
  const containerEl = doc.createElement('div');
  containerEl.style.position = 'relative';

  // Use content width from context if available, otherwise default to reasonable width
  const contentWidth = context.contentWidth ?? 600;

  // Collect floating images to render separately, with their paragraph's Y position
  const floatingImages: Array<{
    src: string;
    width: number;
    height: number;
    alt?: string;
    paragraphY: number; // Y position of the containing paragraph
    position: {
      horizontal?: {
        relativeTo?: string;
        posOffset?: number;
        align?: string;
        alignment?: string;
      };
      vertical?: {
        relativeTo?: string;
        posOffset?: number;
        align?: string;
        alignment?: string;
      };
    };
  }> = [];

  let cursorY = 0;

  for (let i = 0; i < content.blocks.length; i++) {
    const block = content.blocks[i];
    const measure = content.measures[i];
    if (!block || !measure) continue;

    if (block.kind === 'paragraph') {
      if (measure.kind !== 'paragraph') continue;
      const paragraphBlock = block;
      const paragraphMeasure = measure;
      const paragraphSpacingBefore = paragraphBlock.attrs?.spacing?.before ?? 0;

      // Track the Y position where this paragraph starts
      const paragraphStartY = cursorY;

      // Extract floating images and filter them from runs
      const inlineRuns: typeof paragraphBlock.runs = [];
      for (const run of paragraphBlock.runs) {
        if (run.kind === 'image' && 'position' in run && run.position) {
          const imgRun = run as {
            kind: 'image';
            src: string;
            width: number;
            height: number;
            alt?: string;
            position: {
              horizontal?: {
                relativeTo?: string;
                posOffset?: number;
                align?: string;
                alignment?: string;
              };
              vertical?: {
                relativeTo?: string;
                posOffset?: number;
                align?: string;
                alignment?: string;
              };
            };
          };
          floatingImages.push({
            src: imgRun.src,
            width: imgRun.width,
            height: imgRun.height,
            alt: imgRun.alt,
            paragraphY: paragraphStartY, // Store where this paragraph starts
            position: imgRun.position,
          });
        } else {
          // Keep non-floating runs for inline rendering
          inlineRuns.push(run);
        }
      }

      // Create a modified paragraph block without floating images
      const inlineBlock: ParagraphBlock = {
        ...paragraphBlock,
        runs: inlineRuns,
      };

      // Create a synthetic fragment for the paragraph. `pmStart` / `pmEnd`
      // are essential for HF caret resolution — without them the painter
      // emits no `data-pm-*` markers on this paragraph wrapper, and empty
      // paragraphs (or cursors at line boundaries) lose any anchor at all.
      // `computeHfCaretRectFromView`'s fallback chain depends on these.
      const syntheticFragment: ParagraphFragment = {
        kind: 'paragraph',
        blockId: paragraphBlock.id,
        x: 0,
        y: cursorY + paragraphSpacingBefore,
        width: contentWidth,
        height: paragraphMeasure.totalHeight,
        fromLine: 0,
        toLine: paragraphMeasure.lines.length,
        pmStart: paragraphBlock.pmStart,
        pmEnd: paragraphBlock.pmEnd,
      };

      // Render paragraph fragment (with floating images filtered out). The
      // HF context positions blocks absolutely within its own container,
      // stacking vertically via `cursorY` — `paragraphMeasure.totalHeight`
      // already includes `spaceBefore` / `spaceAfter`. Pass `positioning:
      // 'absolute'` so the renderer applies that mode itself instead of the
      // caller having to flip its inline style after the fact (#379).
      const fragEl = renderParagraphFragment(
        syntheticFragment,
        inlineBlock,
        paragraphMeasure,
        { ...context, positioning: 'absolute' },
        { document: doc }
      );

      fragEl.style.top = `${cursorY + paragraphSpacingBefore}px`;
      fragEl.style.left = '0';
      fragEl.style.width = `${contentWidth}px`;

      containerEl.appendChild(fragEl);
      cursorY += paragraphMeasure.totalHeight;
    } else if (block.kind === 'table') {
      if (measure.kind !== 'table') continue;
      // HF tables don't paginate, so the synthetic fragment covers all rows.
      const syntheticFragment: TableFragment = {
        kind: 'table',
        blockId: block.id,
        x: 0,
        y: cursorY,
        width: measure.totalWidth,
        height: measure.totalHeight,
        fromRow: 0,
        toRow: measure.rows.length,
        pmStart: block.pmStart,
        pmEnd: block.pmEnd,
      };
      const fragEl = renderTableFragment(
        syntheticFragment,
        block,
        measure,
        { ...context, positioning: 'absolute' },
        { document: doc }
      );

      // Floating tables (`<w:tblpPr>`) opt out of the cursorY flow. They
      // anchor at (tblpX, tblpY) relative to the page/margin/column per
      // ECMA-376 §17.4.57 and don't advance cursorY (#382). Inline tables
      // keep their cursorY-based stacking.
      if (block.floating) {
        const { left, top } = resolveHeaderFooterFloatingTablePosition(block.floating, layout);
        fragEl.style.top = `${top}px`;
        fragEl.style.left = `${left}px`;
        containerEl.appendChild(fragEl);
        // Floating tables do NOT advance cursorY — surrounding HF blocks
        // flow as if the table weren't there. Word renders text behind
        // floating tables when no wrap behavior is requested; we match.
      } else {
        // Inline placement: top/left stack within the HF container at cursorY.
        fragEl.style.top = `${cursorY}px`;
        fragEl.style.left = '0';
        containerEl.appendChild(fragEl);
        cursorY += measure.totalHeight;
      }
    } else if (block.kind === 'image') {
      if (measure.kind !== 'image') continue;
      // Block-level images stack in the HF flow like paragraphs/tables.
      const syntheticFragment: ImageFragment = {
        kind: 'image',
        blockId: block.id,
        x: 0,
        y: cursorY,
        width: measure.width,
        height: measure.height,
        pmStart: block.pmStart,
        pmEnd: block.pmEnd,
      };
      const fragEl = renderImageFragment(
        syntheticFragment,
        block,
        measure,
        { ...context, positioning: 'absolute' },
        { document: doc }
      );
      fragEl.style.top = `${cursorY}px`;
      fragEl.style.left = '0';
      containerEl.appendChild(fragEl);
      cursorY += measure.height;
    } else if (block.kind === 'textBox') {
      if (measure.kind !== 'textBox') continue;
      // Text boxes stack in the HF flow. headerFooterLayout already reserves
      // their height; without this branch they were measured but never
      // painted, so they showed in the inline editor but not the page view.
      const syntheticFragment: TextBoxFragment = {
        kind: 'textBox',
        blockId: block.id,
        x: 0,
        y: cursorY,
        width: measure.width,
        height: measure.height,
        pmStart: block.pmStart,
        pmEnd: block.pmEnd,
      };
      const fragEl = renderTextBoxFragment(
        syntheticFragment,
        block,
        measure,
        { ...context, positioning: 'absolute' },
        { document: doc }
      );
      // Vertical position stays on the HF flow cursor (the anchor's positionV
      // is not yet honored for HF text boxes); only the horizontal anchor is
      // resolved here, which is what the reported page-centered banner needs.
      fragEl.style.top = `${cursorY}px`;
      // Honor the anchor's horizontal position (e.g. centered relative to the
      // page) instead of pinning the box to the left.
      fragEl.style.left = resolveHeaderFooterFloatLeft(
        measure.width,
        block.position?.horizontal,
        layout
      );
      containerEl.appendChild(fragEl);
      // Floating text boxes (square/tight/through/behind/inFront wrap) are
      // positioned and do NOT advance the flow — surrounding header content
      // flows as if the box weren't there, mirroring floating tables above and
      // matching Word: a centered banner sits beside the left/right header text
      // instead of pushing it down. This also keeps a tall page-anchored
      // letterhead from shoving the in-flow content past the header band
      // (#705). Advancing for a float made the in-flow content overflow the
      // band (which excludes floats from `flowHeight`) and overlap the body.
      // Inline and topAndBottom boxes still stack on the cursor (they reserve
      // in-flow vertical space).
      if (block.displayMode !== 'float') {
        cursorY += measure.height;
      }
    } else if (
      block.kind === 'sectionBreak' ||
      block.kind === 'pageBreak' ||
      block.kind === 'columnBreak'
    ) {
      // Section/page/column breaks carry no rendering in the header/footer
      // flow — headers and footers reflow per page, so a break has no meaning.
    } else {
      // Exhaustiveness guard: every FlowBlock variant must be handled above.
      // A new variant fails the typecheck here instead of silently vanishing
      // from the header/footer page view.
      assertExhaustiveFlowBlock(block, 'renderHeaderFooterContent');
    }
  }

  // Render floating images with absolute positioning
  for (const floatImg of floatingImages) {
    const img = doc.createElement('img');
    img.src = floatImg.src;
    img.width = floatImg.width;
    img.height = floatImg.height;
    if (floatImg.alt) img.alt = floatImg.alt;

    img.style.position = 'absolute';
    img.style.display = 'block';
    // Header/footer images can intentionally extend beyond the text area.
    // Override global img resets (for example max-width: 100%) so the DOCX
    // anchor extent is honored instead of shrinking to the header/footer box.
    img.style.width = `${floatImg.width}px`;
    img.style.height = `${floatImg.height}px`;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';

    applyHeaderFooterFloatHorizontalPosition(img, floatImg, layout);
    img.style.top = `${resolveHeaderFooterFloatTop(floatImg, layout)}px`;

    containerEl.appendChild(img);
  }

  return containerEl;
}
