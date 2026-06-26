/**
 * Paragraph measurement module
 *
 * Measures paragraph blocks and computes line breaking.
 * Converts runs into measured lines with typography metrics.
 */

import type {
  ParagraphBlock,
  ParagraphMeasure,
  MeasuredLine,
  MeasuredLineSegment,
  Run,
  TextRun,
  TabRun,
  ImageRun,
  LineBreakRun,
  FieldRun,
  ParagraphSpacing,
} from '../../layout-engine/types';
import {
  findClearLineY,
  getFloatingAvailableWidth,
  getFloatingMargins,
  MIN_WRAP_SEGMENT_WIDTH,
  type FloatingImageZone,
  type FloatingLineSegmentZone,
} from './floatingZones';

import { wrapsAroundText } from '../../docx/wrapTypes';

import {
  measureTextWidth,
  measureRun,
  getFontMetrics,
  ptToPx,
  type FontStyle,
  type FontMetrics,
} from './measureContainer';

import { DEFAULT_SINGLE_LINE_RATIO } from '../../utils/fontResolver';
import {
  calculateTabWidth,
  pixelsToTwips,
  type TabContext,
} from '../../prosemirror/utils/tabCalculator';
import { getListMarkerInlineWidth } from './listMarkerWidth';

// Default values - match OOXML spec defaults
const DEFAULT_FONT_SIZE = 11; // 11pt (Word 2007+ default)
const DEFAULT_FONT_FAMILY = 'Calibri';

/** Word's "single line spacing" floor applied to `auto`/`atLeast` line rules. */
const WORD_SINGLE_LINE_FLOOR = 1.15;
const DEFAULT_LINE_HEIGHT_MULTIPLIER = 1.0; // OOXML spec default: single spacing (line=240)

// Floating-point tolerance for line breaking (0.5px)
// Prevents premature line breaks due to measurement rounding
const WIDTH_TOLERANCE = 0.5;

/**
 * Find the longest prefix of `text` that fits within `maxWidth` pixels.
 * Returns the number of characters that fit (at least 1 if `forceMin` is true).
 */
function findMaxFittingLength(
  text: string,
  style: FontStyle,
  maxWidth: number,
  forceMin: boolean = false
): number {
  let lo = 1;
  let hi = text.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (measureTextWidth(text.slice(0, mid), style) <= maxWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return forceMin && best === 0 ? 1 : best;
}

export type { FloatingImageZone } from './floatingZones';

/**
 * Options for paragraph measurement
 */
export interface MeasureParagraphOptions {
  /** Floating image exclusion zones that affect line widths */
  floatingZones?: FloatingImageZone[];
  /** Y offset of this paragraph relative to the exclusion zones (default: 0) */
  paragraphYOffset?: number;
}

/**
 * Typography metrics for a line
 */
interface LineTypography {
  ascent: number;
  descent: number;
  lineHeight: number;
}

/**
 * State tracking for line accumulation
 */
interface LineState {
  fromRun: number;
  fromChar: number;
  toRun: number;
  toChar: number;
  width: number;
  maxFontSize: number;
  maxFontMetrics: FontMetrics | null;
  /** Maximum inline image height in pixels (already in px, not points) */
  maxImageHeightPx: number;
  availableWidth: number;
  /** Left offset from floating images (pixels from content left edge) */
  leftOffset: number;
  /** Right offset from floating images (pixels from content right edge) */
  rightOffset: number;
  /** Optional split segment zones from centered floating exclusions */
  segmentZones?: FloatingLineSegmentZone[];
}

/**
 * Extract FontStyle from a text run for measurement
 */
function runToFontStyle(run: TextRun | TabRun): FontStyle {
  return {
    fontFamily: run.fontFamily ?? DEFAULT_FONT_FAMILY,
    fontSize: run.fontSize ?? DEFAULT_FONT_SIZE,
    bold: run.bold,
    italic: run.italic,
    letterSpacing: run.letterSpacing,
  };
}

/**
 * Calculate typography metrics from font size and spacing settings
 *
 * @param fontSize - Font size in points
 * @param spacing - Paragraph spacing settings
 * @param metrics - Pre-calculated font metrics (in pixels)
 */
function calculateTypographyMetrics(
  fontSize: number,
  spacing?: ParagraphSpacing,
  metrics?: FontMetrics | null
): LineTypography {
  // Use provided metrics or calculate from font size
  // When calculating from fontSize (points), convert to pixels first
  const fontSizePx = ptToPx(fontSize);
  const ascent = metrics?.ascent ?? fontSizePx * 0.8;
  const descent = metrics?.descent ?? fontSizePx * 0.2;

  // Apply line spacing rules
  //
  // OOXML lineRule="auto" multipliers (w:line in 240ths):
  //   line=240 → 1.0x (single), line=276 → 1.15x (Word default), line=480 → 2.0x
  //
  // The multiplier base is the font's "single line" height per OOXML spec (§17.3.1.33):
  //   singleLine = (usWinAscent + usWinDescent) / unitsPerEm × fontSizePx
  // This ratio is font-specific (1.07–1.27 for common fonts). We use a hardcoded
  // lookup table of OS/2 metrics since Canvas fontBoundingBox is unreliable
  // cross-platform (Mac uses hhea, not usWin) and Google Font substitutes
  // report different metrics than the original fonts.
  const ratio = metrics?.singleLineRatio ?? DEFAULT_SINGLE_LINE_RATIO;
  const singleLineBase = fontSizePx * ratio;

  let lineHeight: number;

  if (spacing?.lineRule === 'exact' && spacing.line !== undefined) {
    // Exact: use specified height exactly
    lineHeight = spacing.line;
  } else if (spacing?.lineRule === 'atLeast' && spacing.line !== undefined) {
    // At least: use specified height or natural height, whichever is larger
    const defaultHeight = singleLineBase * DEFAULT_LINE_HEIGHT_MULTIPLIER;
    lineHeight = Math.max(spacing.line, defaultHeight);
  } else if (spacing?.line !== undefined && spacing?.lineUnit === 'multiplier') {
    // Multiplier applied to font's single-line height
    lineHeight = singleLineBase * spacing.line;
  } else if (spacing?.line !== undefined && spacing?.lineUnit === 'px') {
    // Pixel value
    lineHeight = spacing.line;
  } else {
    // No explicit spacing — OOXML spec default is line=240 (1.0x = single spacing).
    // Documents wanting 1.15x set w:line=276 explicitly in styles, which flows
    // through the multiplier branch above. This fallback is for paragraphs with
    // no style and no direct formatting.
    lineHeight = singleLineBase * DEFAULT_LINE_HEIGHT_MULTIPLIER;
  }

  return { ascent, descent, lineHeight };
}

/**
 * Calculate metrics for an empty paragraph
 */
function calculateEmptyParagraphMetrics(
  fontSize: number,
  spacing?: ParagraphSpacing,
  fontFamily?: string
): LineTypography {
  const metrics = getFontMetrics({ fontSize, fontFamily: fontFamily ?? DEFAULT_FONT_FAMILY });
  const result = calculateTypographyMetrics(fontSize, spacing, metrics);

  // Empty paragraphs render at single-line height even when the doc writes a
  // smaller line value; without this floor, narrow-metric fonts (OS/2 ratio
  // < 1.15) collapse below Word's render.
  const lineRule = spacing?.lineRule ?? 'auto';
  if (lineRule === 'auto' || lineRule === 'atLeast') {
    const fontSizePx = ptToPx(fontSize);
    const floored = Math.max(result.lineHeight, fontSizePx * WORD_SINGLE_LINE_FLOOR);
    if (floored !== result.lineHeight) {
      return { ...result, lineHeight: floored };
    }
  }
  return result;
}

/**
 * Check if a run is a text run
 */
function isTextRun(run: Run): run is TextRun {
  return run.kind === 'text';
}

/**
 * Check if a run is a tab run
 */
function isTabRun(run: Run): run is TabRun {
  return run.kind === 'tab';
}

/**
 * Check if a run is an image run
 */
function isImageRun(run: Run): run is ImageRun {
  return run.kind === 'image';
}

/**
 * Check if a run is a line break run
 */
function isLineBreakRun(run: Run): run is LineBreakRun {
  return run.kind === 'lineBreak';
}

/**
 * Check if a run is a field run
 */
function isFieldRun(run: Run): run is FieldRun {
  return run.kind === 'field';
}

/**
 * Check if text run is empty (only whitespace or no text)
 */
function isEmptyTextRun(run: TextRun): boolean {
  return !run.text || run.text.replace(/\u00a0/g, ' ').trim().length === 0;
}

/**
 * Sum the inline pixel widths of runs after a tab, up to (but not including)
 * the next tab or line break. Measured per-run so widths reserved match what
 * the painter draws even when trailing runs use different fonts/sizes.
 */
function measureInlineWidthAfterTab(runs: Run[], tabIndex: number): number {
  let width = 0;
  for (let i = tabIndex + 1; i < runs.length; i++) {
    const next = runs[i];
    if (isTabRun(next) || isLineBreakRun(next)) break;
    if (isTextRun(next)) {
      width += measureTextWidth(next.text || '', runToFontStyle(next));
    } else if (isFieldRun(next)) {
      const style: FontStyle = {
        fontFamily: next.fontFamily ?? DEFAULT_FONT_FAMILY,
        fontSize: next.fontSize ?? DEFAULT_FONT_SIZE,
        bold: next.bold,
        italic: next.italic,
      };
      width += measureTextWidth(next.fallback || '1', style);
    } else if (isImageRun(next)) {
      width += next.width || 0;
    }
  }
  return width;
}

/**
 * Find word break points in text
 * Returns array of indices where words end (after space/punctuation)
 */
function findWordBreaks(text: string): number[] {
  const breaks: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    // Break after space or certain punctuation
    if (char === ' ' || char === '-' || char === '\t') {
      breaks.push(i + 1);
    }
  }

  return breaks;
}

/**
 * When a float's wrap margins consume the entire content width (or more),
 * there is no horizontal strip beside it for body text. Word renders the
 * following lines at full content width instead of squeezing them into a
 * 1-pixel column. Unchecked margins from near-full-width tables/images can
 * exceed contentWidth and collapse every line to ~1 glyph (the "single
 * character per line after a wide floating table" bug).
 *
 * Returned margins are zeroed when:
 * - either side alone is >= contentWidth (no strip on that side at all), or
 * - their sum is >= contentWidth (no strip exists between the two sides).
 */
export function clampFloatingWrapMargins(
  leftMargin: number,
  rightMargin: number,
  contentWidth: number
): { leftMargin: number; rightMargin: number } {
  const cw = Math.max(1, contentWidth);
  const lm = Math.max(0, leftMargin);
  const rm = Math.max(0, rightMargin);
  if (lm >= cw || rm >= cw || lm + rm >= cw) {
    return { leftMargin: 0, rightMargin: 0 };
  }
  return { leftMargin: lm, rightMargin: rm };
}

/**
 * Measure a paragraph block and compute line breaks
 *
 * @param block - The paragraph block to measure
 * @param maxWidth - Maximum available width for the paragraph
 * @param options - Optional measurement options (floating zones, Y offset)
 * @returns ParagraphMeasure with lines and total height
 */
export function measureParagraph(
  block: ParagraphBlock,
  maxWidth: number,
  options?: MeasureParagraphOptions
): ParagraphMeasure {
  const runs = block.runs;
  const attrs = block.attrs;
  const spacing = attrs?.spacing;

  // Floating image support
  const floatingZones = options?.floatingZones;
  const paragraphYOffset = options?.paragraphYOffset ?? 0;

  // Handle indentation
  const indent = attrs?.indent;
  const indentLeft = indent?.left ?? 0;
  const indentRight = indent?.right ?? 0;
  const firstLineOffset = (indent?.firstLine ?? 0) - (indent?.hanging ?? 0);

  // Calculate base available widths (before floating image adjustment)
  const bodyContentWidth = Math.max(1, maxWidth - indentLeft - indentRight);
  // First line offset: positive = first-line indent (less space), negative = hanging (more space)
  // Subtracting gives correct width in both cases.
  // Inline list markers in the firstLine path eat into the body width too —
  // subtract the marker's footprint so long markers don't push the last run
  // past the right edge. The hanging path already widens via firstLineOffset
  // (= firstLine − hanging) so it must not be subtracted again.
  const markerInlineWidth = (indent?.hanging ?? 0) === 0 ? getListMarkerInlineWidth(block) : 0;
  const baseFirstLineWidth = Math.max(1, bodyContentWidth - firstLineOffset - markerInlineWidth);

  // Track cumulative height for floating zone calculations
  let cumulativeHeight = 0;
  // Lead-skip to attach to the next line that finalizes — set when we hop
  // past a float that leaves no usable horizontal width at the current Y.
  let pendingFloatSkip = 0;

  // Calculate first line width with floating zone adjustment
  const estimatedFirstLineHeight = ptToPx(DEFAULT_FONT_SIZE) * DEFAULT_LINE_HEIGHT_MULTIPLIER;

  /**
   * If floats leave no usable horizontal room at `cumulativeHeight`, advance
   * past them. Returns the px to skip; both `cumulativeHeight` and
   * `pendingFloatSkip` are bumped by that amount.
   */
  const skipObstructingFloats = (lineHeight: number, lineMaxWidth: number): void => {
    if (!floatingZones || floatingZones.length === 0) return;
    const absoluteY = paragraphYOffset + cumulativeHeight;
    const skip =
      findClearLineY(absoluteY, lineHeight, floatingZones, lineMaxWidth, MIN_WRAP_SEGMENT_WIDTH) -
      absoluteY;
    if (skip > 0) {
      cumulativeHeight += skip;
      pendingFloatSkip += skip;
    }
  };

  skipObstructingFloats(estimatedFirstLineHeight, baseFirstLineWidth);

  const firstLineFloatingMargins = getFloatingMargins(
    cumulativeHeight,
    estimatedFirstLineHeight,
    floatingZones,
    paragraphYOffset
  );
  const firstLineWidth = Math.max(
    1,
    getFloatingAvailableWidth(firstLineFloatingMargins, baseFirstLineWidth)
  );

  const lines: MeasuredLine[] = [];

  // Handle empty paragraph
  if (runs.length === 0) {
    // OOXML's "trailing empty paragraph after a table" pattern (canonical
    // for HF and body) renders as a zero-height anchor in Word. When the
    // caller flags `suppressEmptyParagraphHeight`, return a zero-height
    // measure so the block exists for click-to-position but doesn't
    // inflate container height (#381).
    if (attrs?.suppressEmptyParagraphHeight) {
      lines.push({
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 0,
        width: 0,
        ascent: 0,
        descent: 0,
        lineHeight: 0,
      });
      return {
        kind: 'paragraph',
        lines,
        totalHeight: 0,
      };
    }

    const emptyFontSize = attrs?.defaultFontSize ?? DEFAULT_FONT_SIZE;
    const emptyFontFamily = attrs?.defaultFontFamily ?? DEFAULT_FONT_FAMILY;
    const emptyMetrics = calculateEmptyParagraphMetrics(emptyFontSize, spacing, emptyFontFamily);
    lines.push({
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 0,
      ...emptyMetrics,
    });

    // Word renders spacing.before / spacing.after for empty paragraphs the
    // same as non-empty (§17.3.1.33). The non-empty branch below adds them
    // to totalHeight; do the same here so empty paragraphs don't collapse
    // their authored spacing (e.g. an HF horizontal-rule paragraph with
    // <w:spacing w:before="120">).
    let emptyTotal = emptyMetrics.lineHeight;
    if (spacing?.before) emptyTotal += spacing.before;
    if (spacing?.after) emptyTotal += spacing.after;

    return {
      kind: 'paragraph',
      lines,
      totalHeight: emptyTotal,
    };
  }

  // Check for empty text run only
  if (runs.length === 1 && isTextRun(runs[0]) && isEmptyTextRun(runs[0] as TextRun)) {
    const run = runs[0] as TextRun;
    const fontSize = run.fontSize ?? attrs?.defaultFontSize ?? DEFAULT_FONT_SIZE;
    const fontFamily = run.fontFamily ?? attrs?.defaultFontFamily ?? DEFAULT_FONT_FAMILY;
    const emptyMetrics = calculateEmptyParagraphMetrics(fontSize, spacing, fontFamily);

    lines.push({
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 0,
      ...emptyMetrics,
    });

    let emptyTotal = emptyMetrics.lineHeight;
    if (spacing?.before) emptyTotal += spacing.before;
    if (spacing?.after) emptyTotal += spacing.after;

    return {
      kind: 'paragraph',
      lines,
      totalHeight: emptyTotal,
    };
  }

  // Initialize line state
  let currentLine: LineState = {
    fromRun: 0,
    fromChar: 0,
    toRun: 0,
    toChar: 0,
    width: 0,
    maxFontSize: DEFAULT_FONT_SIZE,
    maxFontMetrics: null,
    maxImageHeightPx: 0,
    availableWidth: firstLineWidth,
    leftOffset: firstLineFloatingMargins.leftMargin,
    rightOffset: firstLineFloatingMargins.rightMargin,
    segmentZones: firstLineFloatingMargins.segments,
  };

  /**
   * Finalize and push the current line to the lines array
   */
  const finalizeLine = (): void => {
    const typography = calculateTypographyMetrics(
      currentLine.maxFontSize,
      spacing,
      currentLine.maxFontMetrics
    );

    // If an inline image is taller than the text-based line height, the line
    // grows to fit the image. Word treats an inline image as a tall glyph
    // sitting on the text baseline: the image extends above the baseline
    // (full ascent), and the line reserves the parent font's descent below.
    const finalTypography = { ...typography };
    if (currentLine.maxImageHeightPx > finalTypography.lineHeight) {
      const imageH = currentLine.maxImageHeightPx;
      const buffer = finalTypography.descent;
      // `fromRun === toRun` means a single-run line — here, the lone image
      // (the enclosing `if` guarantees a tall image is present). This must
      // stay in sync with the painter's image-only test in `renderLine`
      // (`runsForLine.length === 1 && isImageRun(...)`); the two pick paired
      // line-height / alignment strategies and disagreeing reintroduces the
      // floating-label bug.
      if (currentLine.fromRun === currentLine.toRun) {
        // Image alone on the line: grow to the image height plus the parent
        // font's descent on BOTH sides so the row has visible breathing room
        // above and below the image (Word's render gives a few px of cell
        // padding even with tcMar=0). Sibling text cells share the row
        // height, so their descenders also stay clear of overflow:hidden.
        finalTypography.lineHeight = imageH + buffer * 2;
        finalTypography.ascent = imageH + buffer;
      } else {
        // Image flowing with text/tabs (e.g. a logo + label header line):
        // Word seats the image on the text baseline — the full image height
        // sits above the baseline and only the text descent is reserved
        // below, no extra leading above the image. The painter baseline-aligns
        // the row so the image bottom lands on the text baseline.
        finalTypography.lineHeight = imageH + buffer;
        finalTypography.ascent = imageH;
      }
      // descent stays as text metrics
    }

    const line: MeasuredLine = {
      fromRun: currentLine.fromRun,
      fromChar: currentLine.fromChar,
      toRun: currentLine.toRun,
      toChar: currentLine.toChar,
      width: currentLine.width,
      ...finalTypography,
    };

    // Only add offsets if they're non-zero (for floating images)
    if (currentLine.leftOffset > 0) {
      line.leftOffset = currentLine.leftOffset;
    }
    if (currentLine.rightOffset > 0) {
      line.rightOffset = currentLine.rightOffset;
    }
    if (currentLine.segmentZones?.length) {
      line.segments = createLineSegments(line, currentLine.segmentZones);
    }
    if (pendingFloatSkip > 0) {
      line.floatSkipBefore = pendingFloatSkip;
      pendingFloatSkip = 0;
    }

    lines.push(line);

    // Update cumulative height for next line's floating zone calculation
    cumulativeHeight += typography.lineHeight;
  };

  const createLineSegments = (
    line: MeasuredLine,
    segmentZones: FloatingLineSegmentZone[]
  ): MeasuredLineSegment[] | undefined => {
    const firstZone = segmentZones[0];
    const secondZone = segmentZones[1];
    if (!firstZone) return undefined;
    if (!secondZone || line.width <= firstZone.availableWidth + WIDTH_TOLERANCE) {
      return [
        {
          fromRun: line.fromRun,
          fromChar: line.fromChar,
          toRun: line.toRun,
          toChar: line.toChar,
          width: line.width,
          leftOffset: firstZone.leftOffset,
          availableWidth: firstZone.availableWidth,
        },
      ];
    }

    if (line.fromRun !== line.toRun) return undefined;
    const run = runs[line.fromRun];
    if (!run || !isTextRun(run)) return undefined;

    const textRun = run as TextRun;
    const text = textRun.text.slice(line.fromChar, line.toChar);
    const style = runToFontStyle(textRun);
    const firstLength = findMaxFittingLength(text, style, firstZone.availableWidth);
    if (firstLength <= 0 || firstLength >= text.length) return undefined;

    const splitChar = line.fromChar + firstLength;
    const firstText = text.slice(0, firstLength);
    const secondText = text.slice(firstLength);

    return [
      {
        fromRun: line.fromRun,
        fromChar: line.fromChar,
        toRun: line.toRun,
        toChar: splitChar,
        width: measureTextWidth(firstText, style),
        leftOffset: firstZone.leftOffset,
        availableWidth: firstZone.availableWidth,
      },
      {
        fromRun: line.fromRun,
        fromChar: splitChar,
        toRun: line.toRun,
        toChar: line.toChar,
        width: measureTextWidth(secondText, style),
        leftOffset: secondZone.leftOffset,
        availableWidth: secondZone.availableWidth,
      },
    ];
  };

  /**
   * Start a new line after the current one
   */
  const startNewLine = (runIndex: number, charIndex: number): void => {
    finalizeLine();

    // Available width depends on the line's Y vs. floating zones.
    const estimatedLineHeight = ptToPx(DEFAULT_FONT_SIZE) * DEFAULT_LINE_HEIGHT_MULTIPLIER;
    skipObstructingFloats(estimatedLineHeight, bodyContentWidth);

    const floatingMargins = getFloatingMargins(
      cumulativeHeight,
      estimatedLineHeight,
      floatingZones,
      paragraphYOffset
    );

    // Body content width minus floating image margins
    const adjustedWidth = Math.max(1, getFloatingAvailableWidth(floatingMargins, bodyContentWidth));

    currentLine = {
      fromRun: runIndex,
      fromChar: charIndex,
      toRun: runIndex,
      toChar: charIndex,
      width: 0,
      maxFontSize: DEFAULT_FONT_SIZE,
      maxFontMetrics: null,
      maxImageHeightPx: 0,
      availableWidth: adjustedWidth,
      leftOffset: floatingMargins.leftMargin,
      rightOffset: floatingMargins.rightMargin,
      segmentZones: floatingMargins.segments,
    };
  };

  /**
   * Update max font tracking for the current line
   */
  const updateMaxFont = (style: FontStyle): void => {
    const fontSize = style.fontSize ?? DEFAULT_FONT_SIZE;
    // Update when this is the first run on the line (maxFontMetrics not yet set)
    // or when we find a larger font size. Without the !maxFontMetrics check,
    // lines with only <11pt text would use the 11pt default, inflating line height.
    if (!currentLine.maxFontMetrics || fontSize > currentLine.maxFontSize) {
      currentLine.maxFontSize = fontSize;
      currentLine.maxFontMetrics = getFontMetrics(style);
    }
  };

  // Process each run
  for (let runIndex = 0; runIndex < runs.length; runIndex++) {
    const run = runs[runIndex];

    if (isLineBreakRun(run)) {
      // Force line break
      currentLine.toRun = runIndex;
      currentLine.toChar = 0;
      startNewLine(runIndex + 1, 0);
      continue;
    }

    if (isTabRun(run)) {
      // Handle tab run — compute width from paragraph tab stops
      const style = runToFontStyle(run);
      updateMaxFont(style);

      const followingWidth = measureInlineWidthAfterTab(runs, runIndex);

      // Tab width comes from the shared tab-stop model (`calculateTabWidth` —
      // computeTabStops + alignment) that the painter also uses, so the
      // measurer and the painter agree on line widths. `calculateTabWidth`
      // works in content-area coordinates (tab stops are measured from the
      // content-area left edge), so the indent and any first-line offset are
      // added in; the line wrap math further down stays indent-relative.
      const lineX = currentLine.width + (currentLine.leftOffset ?? 0);
      const isFirstLine = lines.length === 0;
      const contentX = indentLeft + (isFirstLine ? firstLineOffset : 0) + lineX;
      const tabContext: TabContext = {
        explicitStops: attrs?.tabs,
        leftIndent: pixelsToTwips(indentLeft),
      };
      let tabWidth = calculateTabWidth(contentX, tabContext, { followingWidth }).width;

      // When the tab targets a position past the line edge — Word's TOC
      // styles routinely author right tab stops a hair past the page margin
      // — snap the tab to the margin and reserve room for the runs that
      // follow (the page number after a TOC leader). Without this, the wrap
      // check below trips and the next line gets the tab + page number
      // alone, with the dots filling the whole new line.
      if (lineX + tabWidth > currentLine.availableWidth + WIDTH_TOLERANCE) {
        const clamped = currentLine.availableWidth - lineX - followingWidth;
        if (clamped > 1) {
          tabWidth = clamped;
        }
      }

      if (currentLine.width + tabWidth > currentLine.availableWidth + WIDTH_TOLERANCE) {
        // Tab still doesn't fit (line is already full of preceding content).
        startNewLine(runIndex, 0);
        updateMaxFont(style);
      }

      currentLine.width += tabWidth;
      currentLine.toRun = runIndex;
      currentLine.toChar = 1;
      continue;
    }

    if (isImageRun(run)) {
      const wrapType = run.wrapType;
      const isFloating = run.displayMode === 'float' || wrapsAroundText(wrapType);

      // Skip truly floating images - they don't contribute to line height
      // (they are positioned absolutely and text wraps around them)
      if (run.position && isFloating) {
        currentLine.toRun = runIndex;
        currentLine.toChar = 1;
        continue;
      }

      // Handle topAndBottom (block) images - they get their own line
      if (wrapType === 'topAndBottom' || run.displayMode === 'block') {
        // If current line has content, finish it first
        if (currentLine.width > 0) {
          startNewLine(runIndex, 0);
        }

        // The image gets its own line with full image height
        const imageHeight = run.height;
        const distTop = run.distTop ?? 6;
        const distBottom = run.distBottom ?? 6;

        // Update line to contain just this image
        currentLine.toRun = runIndex;
        currentLine.toChar = 1;
        // Use image height plus margins as line height (already in pixels)
        currentLine.maxImageHeightPx = imageHeight + distTop + distBottom;

        // Start a new line after the image for subsequent content
        startNewLine(runIndex + 1, 0);
        continue;
      }

      // Handle inline image
      const imageWidth = run.width;
      const imageHeight = run.height;

      if (currentLine.width + imageWidth > currentLine.availableWidth + WIDTH_TOLERANCE) {
        // Image doesn't fit, start new line
        startNewLine(runIndex, 0);
      }

      // The painter fits an inline image to its column with `max-width: 100%`
      // (renderInlineImageRun), so one wider than the column renders scaled down.
      // Reserve the *rendered* height, not the declared one, or the line keeps
      // space the shrunk image never fills — a tall gap below it. No-op if it fits.
      const fitScale =
        imageWidth > 0 && imageWidth > currentLine.availableWidth
          ? currentLine.availableWidth / imageWidth
          : 1;
      const renderedImageHeight = imageHeight * fitScale;

      // The image's vertical footprint in the line includes its wrap
      // distances (wp:inline distT/distB). These default to 0 for inline
      // images (unlike the block path's synthetic 6px). The painter applies
      // them as top/bottom margins on the <img>, so the run's flex baseline
      // (the margin-box edge) stays consistent with this reserved height.
      // Record it only after the wrap check above — the footprint belongs to
      // the line the image actually lands on, not the line it wrapped away
      // from (else the previous line inflates and this one stays text-height,
      // and everything after paints over the overflowing image — #766).
      const imageFootprintPx = renderedImageHeight + (run.distTop ?? 0) + (run.distBottom ?? 0);
      if (imageFootprintPx > currentLine.maxImageHeightPx) {
        currentLine.maxImageHeightPx = imageFootprintPx;
      }

      currentLine.width += imageWidth;
      currentLine.toRun = runIndex;
      currentLine.toChar = 1;
      continue;
    }

    if (isFieldRun(run)) {
      // Measure field using fallback text (actual value substituted at render time)
      const fallback = run.fallback || '1';
      const style: FontStyle = {
        fontFamily: run.fontFamily ?? DEFAULT_FONT_FAMILY,
        fontSize: run.fontSize ?? DEFAULT_FONT_SIZE,
        bold: run.bold,
        italic: run.italic,
      };
      updateMaxFont(style);

      const fieldWidth = measureTextWidth(fallback, style);
      if (
        currentLine.width > 0 &&
        currentLine.width + fieldWidth > currentLine.availableWidth + WIDTH_TOLERANCE
      ) {
        startNewLine(runIndex, 0);
        updateMaxFont(style);
      }

      currentLine.width += fieldWidth;
      currentLine.toRun = runIndex;
      currentLine.toChar = 1;
      continue;
    }

    if (isTextRun(run)) {
      const textRun = run as TextRun;
      const text = textRun.text;
      const style = runToFontStyle(textRun);

      updateMaxFont(style);

      if (!text || text.length === 0) {
        // Empty text run, just update position
        currentLine.toRun = runIndex;
        currentLine.toChar = 0;
        continue;
      }

      // Find word break points for wrapping
      const wordBreaks = findWordBreaks(text);

      // Process text word by word
      let charIndex = 0;

      while (charIndex < text.length) {
        // Find next word boundary
        let nextBreak = text.length;
        for (const breakPoint of wordBreaks) {
          if (breakPoint > charIndex) {
            nextBreak = breakPoint;
            break;
          }
        }

        // Extract word (includes trailing space if present)
        const word = text.slice(charIndex, nextBreak);
        const wordWidth = measureTextWidth(word, style);

        // If the word itself is longer than a line, hard-break by characters.
        // Use substring measurement (not char-by-char accumulation) to preserve
        // kerning accuracy. Char-by-char accumulation overestimates width by
        // ~1-2px per line due to lost kerning, causing extra wraps in narrow cells.
        if (wordWidth > currentLine.availableWidth + WIDTH_TOLERANCE) {
          // Long word that needs hard-breaking. DON'T start a new line first —
          // fill the remaining space on the current line with as many characters
          // as possible. This prevents wasting a full line when a small run
          // (like "{" at 10pt) precedes a long word (like a variable at 5.5pt).
          let chunkStart = 0;

          while (chunkStart < word.length) {
            const spaceLeft = currentLine.availableWidth - currentLine.width + WIDTH_TOLERANCE;
            const remaining = word.slice(chunkStart);
            let bestEnd = findMaxFittingLength(remaining, style, spaceLeft);

            // Nothing fits → start a new line and retry (or force 1 char on empty line)
            if (bestEnd === 0) {
              if (currentLine.width > 0) {
                startNewLine(runIndex, charIndex + chunkStart);
                updateMaxFont(style);
                continue;
              }
              bestEnd = 1;
            }

            const chunkEnd = chunkStart + bestEnd;
            const chunk = word.slice(chunkStart, chunkEnd);
            const chunkWidth = measureTextWidth(chunk, style);

            currentLine.width += chunkWidth;
            currentLine.toRun = runIndex;
            currentLine.toChar = charIndex + chunkEnd;

            chunkStart = chunkEnd;
            if (chunkStart < word.length) {
              startNewLine(runIndex, charIndex + chunkStart);
              updateMaxFont(style);
            }
          }

          charIndex = nextBreak;
          continue;
        }

        // Check if word fits on current line
        if (
          currentLine.width > 0 &&
          currentLine.width + wordWidth > currentLine.availableWidth + WIDTH_TOLERANCE
        ) {
          // Word doesn't fit, start new line
          startNewLine(runIndex, charIndex);
          // Re-apply font metrics to the new line (startNewLine resets maxFontSize)
          updateMaxFont(style);
        }

        // Add word to current line
        currentLine.width += wordWidth;
        currentLine.toRun = runIndex;
        currentLine.toChar = nextBreak;

        charIndex = nextBreak;
      }
    }
  }

  // Finalize the last line
  finalizeLine();

  // Calculate total height — include floatSkipBefore from lines bumped past floats.
  const totalHeight = lines.reduce(
    (sum, line) => sum + line.lineHeight + (line.floatSkipBefore ?? 0),
    0
  );

  // Add spacing before/after
  let totalWithSpacing = totalHeight;
  if (spacing?.before) {
    totalWithSpacing += spacing.before;
  }
  if (spacing?.after) {
    totalWithSpacing += spacing.after;
  }

  return {
    kind: 'paragraph',
    lines,
    totalHeight: totalWithSpacing,
  };
}

/**
 * Measure multiple paragraph blocks
 *
 * @param blocks - Array of paragraph blocks to measure
 * @param maxWidth - Maximum available width
 * @returns Array of ParagraphMeasure results
 */
export function measureParagraphs(blocks: ParagraphBlock[], maxWidth: number): ParagraphMeasure[] {
  return blocks.map((block) => measureParagraph(block, maxWidth));
}

/**
 * Get per-character widths for a text run (for click positioning)
 *
 * @param run - The text run to measure
 * @returns Array of character widths
 */
export function getRunCharWidths(run: TextRun): number[] {
  const style = runToFontStyle(run);
  const result = measureRun(run.text, style);
  return result.charWidths;
}
