/**
 * Line-level rendering.
 *
 * Owns `renderLine` and its helpers: slicing the paragraph's runs to the
 * line's character range, justify decisions, per-line floating margins,
 * tab-width calculation through the tabCalculator (explicit stops + default
 * intervals), inline image dedup, and field-value substitution width math.
 */

import type {
  ParagraphBlock,
  MeasuredLine,
  Run,
  ImageRun,
  LineBreakRun,
  TabStop,
} from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';
import { isFloatingImageRun } from '../floatingImageFlow';
import {
  calculateTabWidth,
  type TabContext,
  type TabStop as TabCalcStop,
} from '../../prosemirror/utils/tabCalculator';
import { resolveFontFamily } from '../../utils/fontResolver';
import {
  PARAGRAPH_CLASS_NAMES,
  isTextRun,
  isTabRun,
  isImageRun,
  isLineBreakRun,
  isFieldRun,
} from './shared';
import {
  renderTextRun,
  renderTabRun,
  renderImageRun,
  renderLineBreakRun,
  renderFieldRun,
  renderRun,
  applyPmPositions,
} from './runs';

/**
 * Slice runs for a specific line
 *
 * @param block - The paragraph block
 * @param line - The line measurement
 * @returns Array of runs for this line
 */
export function sliceRunsForLine(block: ParagraphBlock, line: MeasuredLine): Run[] {
  const result: Run[] = [];
  const runs = block.runs;

  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex++) {
    const run = runs[runIndex];
    if (!run) continue;

    if (isTextRun(run)) {
      // Get the character range for this run
      const startChar = runIndex === line.fromRun ? line.fromChar : 0;
      const endChar = runIndex === line.toRun ? line.toChar : run.text.length;

      // Slice the text if needed
      if (startChar > 0 || endChar < run.text.length) {
        const slicedText = run.text.slice(startChar, endChar);
        result.push({
          ...run,
          text: slicedText,
          pmStart: run.pmStart !== undefined ? run.pmStart + startChar : undefined,
          pmEnd: run.pmStart !== undefined ? run.pmStart + endChar : undefined,
        });
      } else {
        result.push(run);
      }
    } else {
      // Non-text runs are included as-is
      result.push(run);
    }
  }

  return result;
}

/**
 * Options for rendering a line with justify support
 */
interface RenderLineOptions {
  /** Available width for the line (content area width minus indentation) */
  availableWidth: number;
  /** Whether this is the last line of the paragraph */
  isLastLine: boolean;
  /** Whether this is the first line of the paragraph */
  isFirstLine: boolean;
  /** Whether the paragraph ends with a line break */
  paragraphEndsWithLineBreak: boolean;
  /** Tab stops from paragraph attributes */
  tabStops?: TabStop[];
  /** Render context for field substitution */
  context?: RenderContext;
  /** Left indent in pixels */
  leftIndentPx?: number;
  /** First line indent in pixels (positive) or hanging indent (negative) */
  firstLineIndentPx?: number;
  /** Line-specific floating image margins (calculated per-line based on Y overlap) */
  floatingMargins?: { leftMargin: number; rightMargin: number };
  /** Track inline image runs already rendered in this paragraph fragment to prevent duplicates */
  renderedInlineImageKeys?: Set<string>;
  /**
   * Rightmost x where inline content may render, in content-area coords. Used
   * by the right-tab anchor; passed in directly (rather than recomposed from
   * `leftIndentPx + availableWidth`) because `availableWidth` excludes the
   * hung-out region for some inputs and would drift.
   */
  lineRightEdgePx?: number;
}

/**
 * Map a paragraph/image alignment to the `justify-content` value used when a
 * line is laid out as a flex row. `left`, `justify`, and unset all pack left.
 */
function alignToJustifyContent(align: string | undefined): string {
  return align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
}

/**
 * Horizontal alignment for an image alone on a line. An anchored image
 * (`wp:positionH`, i.e. `position.horizontal` present) is positioned by its OWN
 * alignment, independent of the paragraph's `jc` — defaulting to left like Word,
 * NOT the paragraph alignment (which would wrongly center a left-anchored header
 * logo whose paragraph happens to be centered). An inline image with no anchor
 * follows the paragraph alignment. (issue #777)
 */
export function resolveImageLineAlign(
  imageRun: ImageRun,
  paragraphAlignment: 'left' | 'center' | 'right' | 'justify' | undefined
): string | undefined {
  const horizontal = imageRun.position?.horizontal;
  return horizontal ? (horizontal.align ?? 'left') : paragraphAlignment;
}

/**
 * Build a stable key for an inline image run.
 * PM positions are preferred because they uniquely identify the source node.
 */
function getInlineImageRunKey(run: ImageRun): string {
  return [
    run.pmStart ?? 'no-start',
    run.pmEnd ?? 'no-end',
    run.src,
    run.width,
    run.height,
    run.displayMode ?? 'inline',
    run.wrapType ?? 'none',
  ].join('|');
}

/**
 * Convert layout engine TabStop to tab calculator TabStop format
 */
function convertTabStopToCalc(stop: TabStop): TabCalcStop {
  return {
    val: stop.val,
    pos: stop.pos,
    leader: stop.leader as TabCalcStop['leader'],
  };
}

/**
 * Get the text content immediately following a tab run in the runs array
 * Used for center/end/decimal tab alignment calculations
 */
function getTextAfterTab(runs: Run[], tabRunIndex: number, context?: RenderContext): string {
  let text = '';
  for (let i = tabRunIndex + 1; i < runs.length; i++) {
    const run = runs[i];
    if (isTextRun(run)) {
      text += run.text;
    } else if (isFieldRun(run)) {
      // Resolve field values for TOC page numbers
      if (run.fieldType === 'PAGE' && context) {
        text += String(context.pageNumber);
      } else if (run.fieldType === 'NUMPAGES' && context) {
        text += String(context.totalPages);
      } else {
        text += run.fallback ?? '';
      }
    } else if (isTabRun(run) || isLineBreakRun(run)) {
      // Stop at next tab or line break
      break;
    }
  }
  return text;
}

/**
 * Sub-pixel tolerance when comparing canvas-measured widths against the DOM's
 * actual right edge. Without this, accumulated rounding from `measureText`
 * vs. browser layout can leave a right-anchored tab one pixel short, and the
 * flex anchor fails to trigger when it should.
 */
const RIGHT_EDGE_EPSILON_PX = 0.5;

/**
 * Sum the pixel widths of runs that follow a tab, up to the next tab or line
 * break. Measures per-run so the tab clamp reserves exact space when trailing
 * runs use a different font/size from the default (e.g. TOC page numbers).
 */
function measureFollowingContentWidth(
  runs: Run[],
  tabRunIndex: number,
  measureText: (
    text: string,
    fontSize?: number,
    fontFamily?: string,
    bold?: boolean,
    italic?: boolean
  ) => number,
  context?: RenderContext
): number {
  let width = 0;
  for (let i = tabRunIndex + 1; i < runs.length; i++) {
    const run = runs[i];
    if (isTabRun(run) || isLineBreakRun(run)) break;
    if (isTextRun(run)) {
      width += measureText(run.text || '', run.fontSize, run.fontFamily, run.bold, run.italic);
    } else if (isFieldRun(run)) {
      let fieldText: string;
      if (run.fieldType === 'PAGE' && context) {
        fieldText = String(context.pageNumber);
      } else if (run.fieldType === 'NUMPAGES' && context) {
        fieldText = String(context.totalPages);
      } else {
        fieldText = run.fallback ?? '';
      }
      width += measureText(fieldText, run.fontSize, run.fontFamily, run.bold, run.italic);
    } else if (isImageRun(run) && !isFloatingImageRun(run)) {
      // Floating images render at the page level — they contribute 0 inline
      // width, so don't count them in the right-edge clamp budget.
      width += run.width || 0;
    }
  }
  return width;
}

/**
 * Create a text measurement function using a temporary canvas
 * Uses the same font fallback chain as measureContainer.ts
 */
function createTextMeasurer(
  doc: Document
): (
  text: string,
  fontSize?: number,
  fontFamily?: string,
  bold?: boolean,
  italic?: boolean
) => number {
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');

  return (text: string, fontSize = 11, fontFamily = 'Calibri', bold = false, italic = false) => {
    if (!ctx) return text.length * 7; // Fallback estimate
    // Font resolver for category-appropriate fallback stacks, matching
    // measureContainer.ts. Include weight + style: `applyRunStyles` sets
    // `font-weight: bold` / `font-style: italic` on the painted span, but
    // if the canvas font string omits them the browser measures the
    // *regular* face. For TOC entries (whose runs carry inline <w:b/>)
    // that under-counts the painted width by a few px per run and the
    // page-number drifts off the right margin.
    const cssFallback = resolveFontFamily(fontFamily).cssFallback;
    const fontSizePx = (fontSize * 96) / 72;
    const parts: string[] = [];
    if (italic) parts.push('italic');
    if (bold) parts.push('bold');
    parts.push(`${fontSizePx}px`, cssFallback);
    ctx.font = parts.join(' ');
    return ctx.measureText(text).width;
  };
}

/**
 * Render a single line
 *
 * @param block - The paragraph block
 * @param line - The line measurement
 * @param alignment - Text alignment
 * @param doc - Document to create elements in
 * @param options - Additional options for justify calculation
 * @returns The line DOM element
 */
export function renderLine(
  block: ParagraphBlock,
  line: MeasuredLine,
  alignment: 'left' | 'center' | 'right' | 'justify' | undefined,
  doc: Document,
  options?: RenderLineOptions
): HTMLElement {
  const lineEl = doc.createElement('div');
  lineEl.className = PARAGRAPH_CLASS_NAMES.line;

  // Apply line height
  lineEl.style.height = `${line.lineHeight}px`;
  lineEl.style.lineHeight = `${line.lineHeight}px`;

  // Get runs for this line
  const runsForLine = sliceRunsForLine(block, line);

  // Image-only line: vAlign-center the image inside the line's box. Without
  // this, vertical-align math (baseline / middle / top) all leave the image
  // either flush with one edge or overflowing — the line's ascent/descent
  // can't be reconciled with parent-font baseline rules well enough to
  // center automatically. Flex centering is unambiguous.
  //
  // The flex container also needs `justify-content` to honor the image's
  // horizontal alignment. Two paths feed it:
  //   1. `pPr/jc` on the containing paragraph — we get this via `alignment`.
  //   2. The image's own `wp:positionH` `wp:align` (e.g. demo.docx centers
  //      its topAndBottom green dot via `relativeFrom="page" align="center"`
  //      and leaves the paragraph alignment untouched).
  // Image-level alignment wins when present — it's the more specific signal
  // from OOXML, and it's the only signal Word writes for that kind of
  // anchored layout.
  if (runsForLine.length === 1 && isImageRun(runsForLine[0])) {
    const imageRun = runsForLine[0] as ImageRun;
    const effectiveAlign = resolveImageLineAlign(imageRun, alignment);
    lineEl.style.display = 'flex';
    lineEl.style.alignItems = 'center';
    lineEl.style.justifyContent = alignToJustifyContent(effectiveAlign);
    lineEl.dataset.flexLine = 'true';
  } else if (runsForLine.some(isImageRun)) {
    // Image flowing alongside text/tabs (logo + label header line). Word seats
    // an inline image as a tall glyph on the text baseline, so baseline-align
    // the row — the image bottom then lands on the text baseline. The line
    // height was measured to match (imageH + text descent).
    lineEl.style.display = 'flex';
    lineEl.style.alignItems = 'baseline';
    lineEl.style.justifyContent = alignToJustifyContent(alignment);
    // Flex blockifies the run spans, so they'd otherwise inherit the line's
    // image-inflated line-height as their own box height — fattening each
    // text run to the full band and breaking baseline alignment. Reset to the
    // font's natural line box; the line div keeps its explicit `height`.
    lineEl.style.lineHeight = 'normal';
    lineEl.dataset.flexLine = 'true';
  }

  // Handle empty lines
  if (runsForLine.length === 0) {
    const emptySpan = doc.createElement('span');
    emptySpan.className = `${PARAGRAPH_CLASS_NAMES.run} layout-empty-run`;
    emptySpan.innerHTML = '&nbsp;';
    lineEl.appendChild(emptySpan);
    return lineEl;
  }

  // Calculate justify spacing if needed
  const isJustify = alignment === 'justify';
  let shouldJustify = false;

  if (isJustify && options) {
    // Justify all lines except the last line (unless it ends with line break)
    shouldJustify = !options.isLastLine || options.paragraphEndsWithLineBreak;

    if (shouldJustify) {
      // Use CSS text-align: justify with text-align-last: justify
      // This forces the browser to justify even single-line blocks
      lineEl.style.textAlign = 'justify';
      lineEl.style.textAlignLast = 'justify';
      // Set explicit width so browser knows how wide to justify to
      lineEl.style.width = `${options.availableWidth}px`;
    }
  }

  // Use white-space: pre to prevent internal wrapping AND preserve consecutive spaces.
  // All line breaking is done during measurement. 'pre' ensures multiple spaces
  // are rendered visually (unlike 'nowrap' which collapses them).
  lineEl.style.whiteSpace = 'pre';

  // Check if any run in this line has a highlight. If so, we need overflow:hidden
  // to prevent the padding-extended background from bleeding into adjacent lines.
  const hasHighlight = runsForLine.some((r) => isTextRun(r) && r.highlight);
  lineEl.style.overflow = hasHighlight ? 'hidden' : 'visible';

  // Per-line floating margins (leftOffset/rightOffset) are now applied by
  // renderParagraphFragment via MeasuredLine offsets from re-measurement.

  // Build tab context if we have tab runs - also create for text measurement
  const hasTabRuns = runsForLine.some(isTabRun);
  let tabContext: TabContext | undefined;

  // Always create text measurer for accurate X position tracking
  const measureText = createTextMeasurer(doc);

  if (hasTabRuns) {
    // Convert tab stops from layout engine format to tab calculator format
    const explicitStops = options?.tabStops?.map(convertTabStopToCalc);

    // Convert left indent from pixels to twips for tab calculation
    // The leftIndent serves two purposes in the tab calculator:
    // 1. For hanging indent paragraphs, it adds an implicit tab stop at the left margin
    // 2. Default tab stops are generated at regular intervals from the left margin
    const leftIndentTwips = options?.leftIndentPx ? Math.round(options.leftIndentPx * 15) : 0;

    tabContext = {
      explicitStops,
      leftIndent: leftIndentTwips,
    };
  }

  // Track current X position for tab calculations
  // Tab stops are measured from the content area left edge (page text area)
  // We need to track where on that coordinate system our text is
  let currentX = 0;
  const leftIndentPx = options?.leftIndentPx ?? 0;

  if (options?.isFirstLine) {
    // First line position depends on first-line indent or hanging indent:
    // - With hanging indent (firstLineIndentPx < 0): starts at leftIndent + firstLineIndent
    // - With first-line indent (firstLineIndentPx > 0): starts at leftIndent + firstLineIndent
    // - No indent: starts at leftIndent
    const firstLineIndentPx = options?.firstLineIndentPx ?? 0;
    currentX = leftIndentPx + firstLineIndentPx;
  } else {
    // Non-first lines start at the left indent position
    currentX = leftIndentPx;
  }

  // Render each run
  for (let i = 0; i < runsForLine.length; i++) {
    const run = runsForLine[i];

    if (isTabRun(run) && tabContext) {
      // Measure the content after this tab so end/center/decimal stops can
      // anchor it to the stop. Per-run measurement (not a single-font pass)
      // keeps the tab width accurate when trailing runs differ in font/size.
      const followingWidth = measureFollowingContentWidth(
        runsForLine,
        i,
        measureText,
        options?.context
      );
      const followingText = getTextAfterTab(runsForLine, i, options?.context);
      const decimalIndex = followingText.indexOf('.');
      const decimalPrefixWidth =
        decimalIndex >= 0 ? measureText(followingText.slice(0, decimalIndex)) : 0;

      // Calculate tab width based on current position
      const tabResult = calculateTabWidth(currentX, tabContext, {
        followingWidth,
        decimalPrefixWidth,
      });

      // Right-tab anchor (TOC pattern): when an end-aligned tab's stop is at
      // the line's right edge, let flex layout pin the trailing content there
      // (tab gets flex: 1) — sidesteps canvas-vs-DOM measurement drift.
      const lineRightEdgeX = options?.lineRightEdgePx;
      const followingWidthForCheck = followingWidth;
      // Gated to the last tab on the line — a trailing tab after a flex-anchored
      // item would push the anchor left.
      let hasFollowingTab = false;
      for (let j = i + 1; j < runsForLine.length; j++) {
        if (isLineBreakRun(runsForLine[j])) break;
        if (isTabRun(runsForLine[j])) {
          hasFollowingTab = true;
          break;
        }
      }
      const useRightAnchor =
        lineRightEdgeX !== undefined &&
        tabResult.alignment === 'end' &&
        !hasFollowingTab &&
        currentX + tabResult.width + followingWidthForCheck >=
          lineRightEdgeX - RIGHT_EDGE_EPSILON_PX;

      if (useRightAnchor) {
        // text-indent applies per flex item (not to the group), so a hanging
        // indent would pull every text-containing item left, including the
        // page number. Strip it here and re-apply as margin-left on the first
        // child. white-space: nowrap stops trailing items wrapping mid-line.
        lineEl.style.display = 'flex';
        lineEl.style.alignItems = 'baseline';
        lineEl.style.whiteSpace = 'nowrap';
        lineEl.style.textIndent = '0';
        lineEl.dataset.flexLine = 'true';
        if (
          options?.isFirstLine &&
          options.firstLineIndentPx &&
          options.firstLineIndentPx < 0 &&
          lineEl.firstElementChild instanceof HTMLElement
        ) {
          // Re-apply the hanging indent (text-indent doesn't work for flex
          // items). Negative margin-left on the first flex item pulls it back
          // into the padding area, matching the original text-indent behaviour.
          lineEl.firstElementChild.style.marginLeft = `${options.firstLineIndentPx}px`;
        }

        // The tab — flex-grow to fill remaining line space after the trailing
        // content takes its natural width. The leader inside is already
        // absolutely positioned to fill the outer's box.
        const tabEl = renderTabRun(run, doc, 0, tabResult.leader);
        tabEl.style.flex = '1 1 0';
        tabEl.style.minWidth = '0';
        tabEl.style.width = 'auto';
        lineEl.appendChild(tabEl);

        // Render the remaining runs into the line at their natural width.
        // Flex layout puts them flush against the line's right edge.
        for (let j = i + 1; j < runsForLine.length; j++) {
          const next = runsForLine[j];
          if (isTabRun(next) || isLineBreakRun(next)) break;
          if (isTextRun(next)) {
            lineEl.appendChild(renderTextRun(next, doc, options?.context?.resolvedCommentIds));
          } else if (isFieldRun(next) && options?.context) {
            lineEl.appendChild(renderFieldRun(next, doc, options.context));
          } else if (isImageRun(next)) {
            // Floating images render at the page level (or in dedicated cell
            // layers) — skip here to avoid double-rendering, matching the
            // main loop's behaviour.
            if (isFloatingImageRun(next)) continue;
            const imageKey = getInlineImageRunKey(next);
            if (!options?.renderedInlineImageKeys?.has(imageKey)) {
              options?.renderedInlineImageKeys?.add(imageKey);
              lineEl.appendChild(renderImageRun(next, doc));
            }
          } else {
            lineEl.appendChild(renderRun(next, doc, options?.context));
          }
        }

        break;
      }

      // Fallback path: not a right-anchored tab. Apply the existing clamp
      // so a tab that overshoots the line edge doesn't bleed past it.
      let tabWidth = tabResult.width;
      if (lineRightEdgeX !== undefined) {
        if (currentX + tabWidth + followingWidthForCheck > lineRightEdgeX) {
          tabWidth = Math.max(1, lineRightEdgeX - currentX - followingWidthForCheck);
        }
      }

      const tabEl = renderTabRun(run, doc, tabWidth, tabResult.leader);
      lineEl.appendChild(tabEl);
      currentX += tabWidth;
    } else if (isTextRun(run)) {
      const runEl = renderTextRun(run, doc, options?.context?.resolvedCommentIds);

      // For highlighted runs, extend background to fill the full line height.
      // Inline elements' background only covers the content area (font ascent+descent),
      // which differs by font size. Vertical padding on inline elements extends the
      // background without affecting line box calculations.
      if (run.highlight) {
        const fontSizePx = run.fontSize ? (run.fontSize * 96) / 72 : 14.67;
        const contentHeight = fontSizePx * 1.2; // approximate content area
        const gap = Math.max(0, line.lineHeight - contentHeight);
        if (gap > 0) {
          const pad = gap / 2;
          runEl.style.paddingTop = `${pad}px`;
          runEl.style.paddingBottom = `${pad}px`;
        }
      }

      lineEl.appendChild(runEl);

      // Measure text width for accurate tab position tracking
      const fontSize = run.fontSize || 11;
      const fontFamily = run.fontFamily || 'Calibri';
      currentX += measureText(run.text, fontSize, fontFamily, run.bold, run.italic);
    } else if (isImageRun(run)) {
      // Skip floating images - they're rendered separately at page level.
      // Exception: inside table cells, floating images must render in-flow
      // Floating images are rendered in dedicated floating layers (page-level
      // or cell-level), not inline. Skip them here to avoid double rendering.
      if (isFloatingImageRun(run)) {
        continue;
      }
      const imageKey = getInlineImageRunKey(run);
      if (options?.renderedInlineImageKeys?.has(imageKey)) {
        continue;
      }
      options?.renderedInlineImageKeys?.add(imageKey);
      // Inline or block image - render in the text flow
      const runEl = renderImageRun(run, doc);
      lineEl.appendChild(runEl);
      // Block images don't contribute to horizontal position
      if (run.displayMode !== 'block' && run.wrapType !== 'topAndBottom') {
        currentX += run.width;
      }
    } else if (isLineBreakRun(run)) {
      const runEl = renderLineBreakRun(run, doc);
      lineEl.appendChild(runEl);
    } else if (isFieldRun(run) && options?.context) {
      // Render field run with context for PAGE/NUMPAGES substitution
      const runEl = renderFieldRun(run, doc, options.context);
      lineEl.appendChild(runEl);
      // Estimate field text width for tab calculations
      let fieldText = run.fallback ?? '';
      if (run.fieldType === 'PAGE') fieldText = String(options.context.pageNumber);
      else if (run.fieldType === 'NUMPAGES') fieldText = String(options.context.totalPages);
      const fontSize = run.fontSize || 11;
      const fontFamily = run.fontFamily || 'Calibri';
      currentX += measureText(fieldText, fontSize, fontFamily, run.bold, run.italic);
    } else {
      // Fallback for unknown run types
      const runEl = renderRun(run, doc, options?.context);
      lineEl.appendChild(runEl);
    }
  }

  // A line whose only run is a line break (a blank row produced by consecutive
  // `<w:br/>`) has no positioned text span — its PM position lives on the `<br>`,
  // which the click/caret/visual-line resolvers don't read (they look for
  // `span[data-pm-start]`). Without a positioned span, those resolvers fall back
  // to the paragraph's start, so clicks, the caret, and arrow navigation all
  // collapse onto the first line of the paragraph. Emit a zero-width positioned
  // marker carrying the break's position so the existing resolvers can locate it.
  if (!lineEl.querySelector('span[data-pm-start][data-pm-end]')) {
    const lineBreakRun = runsForLine.find(isLineBreakRun) as LineBreakRun | undefined;
    if (lineBreakRun?.pmStart !== undefined) {
      const marker = doc.createElement('span');
      marker.className = PARAGRAPH_CLASS_NAMES.run;
      applyPmPositions(marker, lineBreakRun.pmStart, lineBreakRun.pmStart);
      marker.textContent = '\u200B';
      lineEl.insertBefore(marker, lineEl.firstChild);
    }
  }

  return lineEl;
}
