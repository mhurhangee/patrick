/**
 * Paragraph Fragment Renderer
 *
 * Renders paragraph fragments with lines and text runs to DOM.
 * Handles text formatting, alignment, and positioning.
 *
 * This file owns `renderParagraphFragment` (the orchestrator), the
 * border-grouping helpers, and the list-marker renderer. Per-run rendering
 * (text/tab/image/break/field) lives in ./renderParagraph/runs.ts and the
 * line-level walker is in ./renderParagraph/line.ts. The shared class-name
 * constants and run-type guards are in ./renderParagraph/shared.ts.
 */

import type {
  ParagraphBlock,
  ParagraphMeasure,
  ParagraphFragment,
  ParagraphBorders,
  BorderStyle,
  MeasuredLine,
} from '../layout-engine/types';
import type { RenderContext } from './renderPage';
import { resolveFontFamily } from '../utils/fontResolver';
import { PARAGRAPH_CLASS_NAMES, isTextRun } from './renderParagraph/shared';
import { applyPmPositions } from './renderParagraph/runs';
import { renderLine } from './renderParagraph/line';
import {
  getListMarkerInlineWidth,
  resolveListMarkerFont,
} from '../layout-bridge/measuring/listMarkerWidth';

export { PARAGRAPH_CLASS_NAMES } from './renderParagraph/shared';
export { sliceRunsForLine, renderLine } from './renderParagraph/line';

/**
 * Options for rendering a paragraph
 */
export interface RenderParagraphOptions {
  /** Document to create elements in */
  document?: Document;
  /** Fragment's Y position relative to content area (for per-line margin calculation) */
  fragmentContentY?: number;
  /** Borders from the previous adjacent paragraph (for border grouping) */
  prevBorders?: ParagraphBorders;
  /** Borders from the next adjacent paragraph (for border grouping) */
  nextBorders?: ParagraphBorders;
  /** Inline image runs already rendered for this paragraph block */
  renderedInlineImageKeys?: Set<string>;
}

/**
 * Check if two individual border definitions are equal (same style, width, color).
 */
function bordersEqual(a?: BorderStyle, b?: BorderStyle): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.style === b.style && a.width === b.width && a.color === b.color;
}

/**
 * Check if two ParagraphBorders form a group (ECMA-376 §17.3.1.24).
 * Adjacent paragraphs with identical border definitions belong to the same group.
 */
function bordersFormGroup(a?: ParagraphBorders, b?: ParagraphBorders): boolean {
  if (!a && !b) return false; // no borders = no group
  if (!a || !b) return false;
  return (
    bordersEqual(a.top, b.top) &&
    bordersEqual(a.bottom, b.bottom) &&
    bordersEqual(a.left, b.left) &&
    bordersEqual(a.right, b.right) &&
    bordersEqual(a.between, b.between)
  );
}

// First strong-directional character classes (subset of the Unicode Bidi
// character types L vs R/AL) used for base-direction detection.
const RTL_STRONG_CHAR = /[\u0590-\u085F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_STRONG_CHAR =
  /[\u0041-\u005A\u0061-\u007A\u00C0-\u02B8\u0370-\u0589\u10A0-\u10FF\u1E00-\u1FFF]/;

/**
 * Decide whether a paragraph without an explicit `w:bidi` flag should still be
 * laid out right-to-left. Only paragraphs that carry at least one `w:rtl` run
 * are candidates; among those the base direction follows the first strong
 * directional character (the `dir="auto"` rule), so Hebrew/Arabic-led lines
 * order RTL while an English-led line with an embedded RTL word stays LTR. (#719)
 */
function paragraphBaseIsRtl(block: ParagraphBlock): boolean {
  const textRuns = (block.runs ?? []).filter(isTextRun);
  if (!textRuns.some((r) => r.rtl)) return false;
  for (const run of textRuns) {
    for (const ch of run.text) {
      if (RTL_STRONG_CHAR.test(ch)) return true;
      if (LTR_STRONG_CHAR.test(ch)) return false;
    }
  }
  // RTL runs but no strong character (digits/punctuation only) — honor w:rtl.
  return true;
}

/**
 * Render a paragraph fragment
 *
 * @param fragment - The fragment to render
 * @param block - The paragraph block
 * @param measure - The paragraph measurement
 * @param context - Rendering context
 * @param options - Rendering options
 * @returns The fragment DOM element
 */
export function renderParagraphFragment(
  fragment: ParagraphFragment,
  block: ParagraphBlock,
  measure: ParagraphMeasure,
  context: RenderContext,
  options: RenderParagraphOptions = {}
): HTMLElement {
  const doc = options.document ?? document;

  const fragmentEl = doc.createElement('div');
  fragmentEl.className = PARAGRAPH_CLASS_NAMES.fragment;
  // Outer positioning honors the render context. Body's per-page layout
  // overrides this anyway via applyFragmentStyles (legacy default), but
  // HF callers explicitly pass `positioning: 'absolute'` and textbox
  // callers pass `positioning: 'flow'` — keeps the choice in the
  // RenderContext rather than scattered post-render style flips (#379).
  // 'flow' / unspecified default to relative because the element must
  // be a containing block for absolutely positioned floating images.
  fragmentEl.style.position = context.positioning === 'absolute' ? 'absolute' : 'relative';

  // Store block and fragment metadata
  fragmentEl.dataset.blockId = String(fragment.blockId);
  if (block.paraId) {
    fragmentEl.dataset.paraId = block.paraId;
  }
  fragmentEl.dataset.fromLine = String(fragment.fromLine);
  fragmentEl.dataset.toLine = String(fragment.toLine);

  applyPmPositions(fragmentEl, fragment.pmStart, fragment.pmEnd);

  if (fragment.continuesFromPrev) {
    fragmentEl.dataset.continuesFromPrev = 'true';
  }
  if (fragment.continuesOnNext) {
    fragmentEl.dataset.continuesOnNext = 'true';
  }

  // Paragraph-mark tracked-change cues. Only the LAST fragment of a paragraph
  // carries the pilcrow (the mark belongs to the terminating glyph). Other
  // fragments still get the margin change bar via the class so split
  // paragraphs are visually flagged on every page.
  const pPrIns = block.attrs?.pPrIns;
  const pPrDel = block.attrs?.pPrDel;
  if (pPrIns || pPrDel) {
    const rev = pPrIns ?? pPrDel!;
    fragmentEl.classList.add('layout-revision-pmark');
    fragmentEl.classList.add(pPrIns ? 'layout-revision-ins' : 'layout-revision-del');
    fragmentEl.dataset.revisionId = String(rev.revisionId);
    fragmentEl.dataset.revisionAuthor = rev.author;
    if (rev.date) fragmentEl.dataset.revisionDate = rev.date;
  }

  // Text wrapping around floating images is handled at measurement time via
  // per-line leftOffset/rightOffset in MeasuredLine. Floating images themselves
  // skip inline rendering - they're rendered at page level.
  // NOTE: Floating images are rendered at page level in renderPage.ts for
  // cross-paragraph positioning. Inside table cells, they render in-flow
  // since page-level extraction doesn't reach into cell paragraphs.

  // Get the lines for this fragment
  const lines = measure.lines.slice(fragment.fromLine, fragment.toLine);
  const alignment = block.attrs?.alignment;

  // Apply paragraph-level styles
  if (block.attrs?.styleId) {
    fragmentEl.dataset.styleId = block.attrs.styleId;
  }

  // Paginator owns vertical positioning; spacing.before/after are baked
  // into fragment.y, not applied as wrapper padding (would double-count).

  // Apply RTL direction. An explicit `w:bidi` paragraph is always RTL. When
  // there's no `w:bidi` but the paragraph carries right-to-left runs (`w:rtl`),
  // fall back to first-strong base-direction detection: Word/UBA order the runs
  // by the paragraph's base direction, but the painter lays them out as
  // independently `dir`-marked spans (each an isolate), so without a base `dir`
  // on the fragment the runs stay in logical LTR order and reversed Hebrew/
  // Arabic reads backwards. Native `dir="auto"` can't help here — the per-run
  // isolates look neutral to it — so we detect the base ourselves. (#719)
  const isRtl = Boolean(block.attrs?.bidi) || paragraphBaseIsRtl(block);
  if (isRtl) {
    fragmentEl.dir = 'rtl';
  }

  // Apply text alignment at paragraph level
  // For justify: use text-align: left and apply word-spacing per line
  // For RTL paragraphs, default alignment is right
  if (alignment) {
    if (alignment === 'center') {
      fragmentEl.style.textAlign = 'center';
    } else if (alignment === 'right') {
      fragmentEl.style.textAlign = 'right';
    } else if (alignment === 'left') {
      fragmentEl.style.textAlign = 'left';
    } else {
      // 'justify' uses text-align: left (or right for RTL)
      // Justify is implemented via word-spacing on individual lines
      fragmentEl.style.textAlign = isRtl ? 'right' : 'left';
    }
  } else if (isRtl) {
    // No explicit alignment on RTL paragraph — default to right
    fragmentEl.style.textAlign = 'right';
  }

  // Track indentation for line-level application
  // Indentation is applied per-line, not at fragment level
  const indent = block.attrs?.indent;
  let indentLeft = 0;
  let indentRight = 0;

  if (indent) {
    // Track indent values for line-level application
    // For RTL paragraphs, swap left/right indentation
    if (isRtl) {
      if (indent.left && indent.left > 0) indentRight = indent.left;
      if (indent.right && indent.right > 0) indentLeft = indent.right;
    } else {
      if (indent.left && indent.left > 0) indentLeft = indent.left;
      if (indent.right && indent.right > 0) indentRight = indent.right;
    }
  }

  // Note: Line spacing is applied per-line div (renderLine sets lineEl.style.height
  // and lineEl.style.lineHeight), not at fragment level. Fragment-level line-height
  // was removed to avoid conflicts with the explicit per-line pixel heights.

  // Apply borders
  const borders = block.attrs?.borders;
  if (borders) {
    const borderStyleToCss = (style?: string): string => {
      // Map OOXML border styles to CSS
      switch (style) {
        case 'single':
          return 'solid';
        case 'double':
          return 'double';
        case 'dotted':
          return 'dotted';
        case 'dashed':
          return 'dashed';
        case 'thick':
          return 'solid';
        case 'wave':
          return 'wavy';
        case 'dashSmallGap':
          return 'dashed';
        case 'nil':
        case 'none':
          return 'none';
        default:
          return 'solid';
      }
    };

    // Ensure box-sizing is set for proper border calculations
    fragmentEl.style.boxSizing = 'border-box';

    const borderToCss = (b: BorderStyle) => `${b.width}px ${borderStyleToCss(b.style)} ${b.color}`;

    // Word-style border grouping (ECMA-376 §17.3.1.24):
    // Adjacent paragraphs with identical pBdr form a group.
    // - top border → only on the first paragraph of the group
    // - bottom border → only on the last paragraph of the group
    // - between border → rendered as borderTop on interior paragraphs
    // - left/right → on every paragraph in the group
    const groupedWithPrev = bordersFormGroup(options.prevBorders, borders);
    const groupedWithNext = bordersFormGroup(borders, options.nextBorders);

    const renderedTopBorder = groupedWithPrev ? borders.between : borders.top;
    const renderedBottomBorder = !groupedWithNext ? borders.bottom : undefined;

    const borderBox = doc.createElement('div');
    borderBox.className = 'layout-paragraph-border';
    borderBox.style.position = 'absolute';
    borderBox.style.pointerEvents = 'none';
    borderBox.style.boxSizing = 'border-box';
    borderBox.style.left = `${indentLeft - (borders.left?.space ?? 0)}px`;
    borderBox.style.right = `${indentRight - (borders.right?.space ?? 0)}px`;
    borderBox.style.top = `${-(renderedTopBorder?.space ?? 0)}px`;
    borderBox.style.bottom = `${-(renderedBottomBorder?.space ?? 0)}px`;

    if (renderedTopBorder) {
      borderBox.style.borderTop = borderToCss(renderedTopBorder);
    }
    if (renderedBottomBorder) {
      borderBox.style.borderBottom = borderToCss(renderedBottomBorder);
    }
    if (borders.left) {
      borderBox.style.borderLeft = borderToCss(borders.left);
    }
    if (borders.right) {
      borderBox.style.borderRight = borderToCss(borders.right);
    }

    const hasBorder = renderedTopBorder || renderedBottomBorder || borders.left || borders.right;
    if (hasBorder) {
      fragmentEl.appendChild(borderBox);
    }

    // Bar border — vertical decorative bar on the left side (ECMA-376 §17.3.1.4)
    // Rendered independently of the regular left border
    if (borders.bar) {
      const barEl = doc.createElement('div');
      barEl.style.position = 'absolute';
      barEl.style.left = '-8px';
      barEl.style.top = '0';
      barEl.style.bottom = '0';
      barEl.style.borderLeft = borderToCss(borders.bar);
      fragmentEl.style.position = 'relative';
      fragmentEl.appendChild(barEl);
    }
  }

  // Apply shading (background color)
  if (block.attrs?.shading) {
    fragmentEl.style.backgroundColor = block.attrs.shading;
  }

  // Calculate available width for justify
  // Subtract indentation since those are applied as CSS margins on the fragment
  const availableWidth = fragment.width - indentLeft - indentRight;

  // Check if paragraph ends with line break (for justify last line handling)
  const lastRun = block.runs[block.runs.length - 1];
  const paragraphEndsWithLineBreak = lastRun?.kind === 'lineBreak';

  // Total number of lines in the paragraph (not just this fragment)
  const totalLines = measure.lines.length;

  // Calculate first line indent for tab positioning
  // Hanging indent is stored as positive value but means negative offset for first line
  let firstLineIndentPx = 0;
  if (indent?.hanging && indent.hanging > 0) {
    firstLineIndentPx = -indent.hanging; // Negative because first line starts further left
  } else if (indent?.firstLine && indent.firstLine > 0) {
    firstLineIndentPx = indent.firstLine; // Positive because first line is indented right
  }

  // Render each line with per-line floating margin calculation
  const renderedInlineImageKeys = options.renderedInlineImageKeys ?? new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Calculate the actual line index in the full paragraph
    const lineIndex = fragment.fromLine + i;
    const isLastLine = lineIndex === totalLines - 1;
    // First line of the paragraph (not just this fragment)
    const isFirstLine = lineIndex === 0 && !fragment.continuesFromPrev;

    // Get per-line floating margins from measurement phase
    const lineLeftOffset = line.leftOffset ?? 0;
    const lineRightOffset = line.rightOffset ?? 0;

    // The justify box width (and float constraint) is the full content width on
    // every line, including the first. The first line's hanging/firstLine shift
    // is realized purely by `text-indent` below: text-indent moves the line's
    // START, but justify still stretches to the content box's right edge. If we
    // also narrowed the box by `firstLine` (or widened it by `hanging`) the
    // double-count would leave the first line's right edge short of (or past)
    // the margin while body lines reached it. Measurement already accounts for
    // the indent when deciding how much text fits on the first line; that is a
    // separate concern from the stretch target used here.
    const lineAvailableWidth = availableWidth;

    if (canRenderSplitLineAroundFloatingObject(line, block)) {
      const splitLineEl = doc.createElement('div');
      splitLineEl.className = `${PARAGRAPH_CLASS_NAMES.line} layout-line-split`;
      splitLineEl.style.position = 'relative';
      splitLineEl.style.height = `${line.lineHeight}px`;
      splitLineEl.style.lineHeight = `${line.lineHeight}px`;

      for (const segment of line.segments) {
        const segmentLine: MeasuredLine = {
          fromRun: segment.fromRun,
          fromChar: segment.fromChar,
          toRun: segment.toRun,
          toChar: segment.toChar,
          width: segment.width,
          ascent: line.ascent,
          descent: line.descent,
          lineHeight: line.lineHeight,
        };
        const segmentEl = renderLine(block, segmentLine, alignment, doc, {
          availableWidth: segment.availableWidth,
          isLastLine,
          isFirstLine,
          paragraphEndsWithLineBreak,
          tabStops: block.attrs?.tabs,
          leftIndentPx: indentLeft,
          firstLineIndentPx: isFirstLine ? firstLineIndentPx : 0,
          context,
          floatingMargins: { leftMargin: 0, rightMargin: 0 },
          renderedInlineImageKeys,
        });
        segmentEl.className += ' layout-line-segment';
        segmentEl.style.position = 'absolute';
        segmentEl.style.left = `${segment.leftOffset}px`;
        segmentEl.style.top = '0';
        segmentEl.style.width = `${segment.availableWidth}px`;
        splitLineEl.appendChild(segmentEl);
      }

      fragmentEl.appendChild(splitLineEl);
      continue;
    }

    const lineEl = renderLine(block, line, alignment, doc, {
      availableWidth: lineAvailableWidth - lineLeftOffset - lineRightOffset,
      isLastLine,
      isFirstLine,
      paragraphEndsWithLineBreak,
      tabStops: block.attrs?.tabs,
      leftIndentPx: indentLeft,
      firstLineIndentPx: isFirstLine ? firstLineIndentPx : 0,
      context,
      floatingMargins: { leftMargin: lineLeftOffset, rightMargin: lineRightOffset },
      renderedInlineImageKeys,
      // Absolute right edge in content-area coords. The fragment starts at
      // content-area-x=0 with full content-area width; the rightmost x where
      // inline content can land is `fragment.width - indentRight - lineRightOffset`.
      lineRightEdgePx: fragment.width - indentRight - lineRightOffset,
    });

    // Apply left offset from floating images (lines start after the floating image)
    // Also constrain width so text doesn't overflow into the image area
    if (lineLeftOffset > 0 || lineRightOffset > 0) {
      if (lineLeftOffset > 0) {
        lineEl.style.marginLeft = `${lineLeftOffset}px`;
      }
      if (lineRightOffset > 0) {
        lineEl.style.marginRight = `${lineRightOffset}px`;
      }
      // Constrain line width to prevent text from extending into floating image area
      const constrainedWidth = lineAvailableWidth - lineLeftOffset - lineRightOffset;
      if (constrainedWidth > 0) {
        lineEl.style.width = `${constrainedWidth}px`;
      }
    }

    // Lead skip: a line that was pushed past obstructing floats reserves
    // vertical space above itself via marginTop. measureParagraph adds the
    // same amount to totalHeight so containers stay sized correctly.
    if (line.floatSkipBefore && line.floatSkipBefore > 0) {
      lineEl.style.marginTop = `${line.floatSkipBefore}px`;
    }

    // Apply line-level indentation
    // Indentation is applied per-line for correct text wrapping
    const hasHanging = indent?.hanging && indent.hanging > 0;
    const hasFirstLine = indent?.firstLine && indent.firstLine > 0;
    // If renderLine promoted this line to flex (right-tab anchor pattern),
    // text-indent must NOT be applied: it would shift the first inline
    // content INSIDE EACH flex item (e.g. the page number's anchor),
    // pulling it left by `hanging`. Right-tab anchored lines re-apply the
    // hanging offset as margin-left on the first item themselves.
    const isFlexLine = lineEl.dataset.flexLine === 'true';

    if (isFirstLine) {
      // First line handling
      if (indentLeft > 0 && hasHanging) {
        // Hanging indent: first line starts at (indentLeft - hanging)
        lineEl.style.paddingLeft = `${indentLeft}px`;
        if (!isFlexLine) {
          lineEl.style.textIndent = `-${indent!.hanging}px`;
        }
      } else if (indentLeft > 0 && hasFirstLine) {
        // First line indent: first line starts at (indentLeft + firstLine)
        lineEl.style.paddingLeft = `${indentLeft}px`;
        lineEl.style.textIndent = `${indent!.firstLine}px`;
      } else if (indentLeft > 0) {
        // Just left indent, no special first line treatment
        lineEl.style.paddingLeft = `${indentLeft}px`;
      } else if (hasFirstLine) {
        // No left indent, but has first line indent
        lineEl.style.textIndent = `${indent!.firstLine}px`;
      }
      // No hanging without left indent (handled by firstLineOffset in measurement)
    } else {
      // Body lines (not first line)
      if (indentLeft > 0) {
        lineEl.style.paddingLeft = `${indentLeft}px`;
      } else if (hasHanging) {
        // Hanging indent without left indent: body lines need padding = hanging
        lineEl.style.paddingLeft = `${indent!.hanging}px`;
      }
    }

    if (indentRight > 0) {
      lineEl.style.paddingRight = `${indentRight}px`;
    }

    // First-line list marker. The marker occupies a `hanging`-wide slot
    // (its min-width) starting `hanging` left of the body, i.e. at
    // `indentLeft - hanging`; the body then lands at `indentLeft`. The offset
    // rides on padding-left (NOT text-indent: Chrome folds text-indent into
    // the first inline-block's box, overriding the marker's min-width and
    // breaking tab-stop alignment).
    if (isFirstLine && block.attrs?.listMarker && !block.attrs?.listMarkerHidden) {
      const hanging = indent?.hanging ?? 0;
      const firstLine = indent?.firstLine ?? 0;
      const markerStart = hanging > 0 ? indentLeft - hanging : indentLeft + firstLine;
      lineEl.style.paddingLeft = `${Math.max(0, markerStart)}px`;
      lineEl.style.textIndent = '0';

      const { fontFamily, fontSize } = resolveListMarkerFont(block);
      const marker = renderListMarker(
        block.attrs.listMarker,
        getListMarkerInlineWidth(block),
        doc,
        fontFamily,
        fontSize,
        block.attrs.listMarkerRevision
      );
      // When the hang exceeds the left indent the marker belongs in the left
      // margin — exactly where Word puts it (a list whose direct `w:ind` has
      // `hanging` > `left`, #729). CSS padding can't be negative, so the
      // negative portion rides on the marker's own margin-left. Gated to
      // `indentLeft > 0`: with no left indent the body/continuation lines
      // already sit at `hanging` (see body-line branch above), so hanging the
      // marker into the margin there would misalign the first line.
      if (markerStart < 0 && indentLeft > 0) {
        marker.style.marginLeft = `${markerStart}px`;
      }
      lineEl.insertBefore(marker, lineEl.firstChild);
    }

    // Append line directly to fragment (per-line margins are applied in renderLine)
    fragmentEl.appendChild(lineEl);
  }

  // Paragraph-mark pilcrow. Only the LAST fragment of the paragraph carries
  // the glyph (the mark belongs to the terminating ¶). Append as an inline
  // span inside the last line element so it sits on the same baseline as the
  // text instead of pushing a new block-level row below the line.
  if ((pPrIns || pPrDel) && !fragment.continuesOnNext) {
    const lastLineEl = fragmentEl.lastElementChild as HTMLElement | null;
    if (lastLineEl) {
      const glyph = doc.createElement('span');
      glyph.className = 'layout-revision-pmark-glyph';
      if (pPrIns) glyph.classList.add('layout-revision-ins');
      else glyph.classList.add('layout-revision-del');
      glyph.textContent = '¶';
      glyph.setAttribute('aria-hidden', 'true');
      lastLineEl.appendChild(glyph);
    }
  }

  return fragmentEl;
}

function canRenderSplitLineAroundFloatingObject(
  line: MeasuredLine,
  block: ParagraphBlock
): line is MeasuredLine & { segments: NonNullable<MeasuredLine['segments']> } {
  return (line.segments?.length ?? 0) > 1 && !block.attrs?.listMarker;
}

/**
 * Render a list marker element as an inline-block at the start of the
 * first body line. `minWidth` (from `getListMarkerInlineWidth`) sizes the
 * marker so the body text aligns at the next tab stop per §17.9.25.
 */
function renderListMarker(
  marker: string,
  minWidth: number,
  doc: Document,
  fontFamily: string,
  fontSize: number,
  revision?: 'ins' | 'del'
): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'layout-list-marker';
  span.style.fontFamily = resolveFontFamily(fontFamily).cssFallback;
  span.style.fontSize = `${(fontSize * 96) / 72}px`;
  span.style.textAlign = 'left';
  span.style.boxSizing = 'border-box';
  span.style.display = 'inline-block';
  span.style.minWidth = `${minWidth}px`;
  span.textContent = marker;
  // A list whose numbering is a pending tracked change paints its marker in the
  // revision color (inline — painter output isn't reliably under .ep-root CSS).
  if (revision === 'ins') {
    span.style.color = '#2e7d32';
  } else if (revision === 'del') {
    span.style.color = '#c62828';
    span.style.textDecoration = 'line-through';
  }
  return span;
}
