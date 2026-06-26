/**
 * List marker inline-width resolution.
 *
 * The painter renders the list marker as an inline-block at the start of the
 * first body line. To match Word's rendering (ECMA-376 §17.9.25 — default
 * `w:suff="tab"` after the marker), we size that inline-block so the body
 * text aligns at the next tab stop. Long markers like `"1.1.1."` take their
 * natural width and the body follows them.
 *
 * Both the painter (`renderParagraph.ts`) and the measurer (`measureParagraph`)
 * call into this so they agree on the marker's footprint — otherwise long
 * markers overflow the right edge of the first line. The painter applies the
 * returned width as `min-width`; the measurer subtracts the same value from
 * the first line's available width.
 */

import type { ParagraphBlock, TextRun } from '../../layout-engine/types';
import { measureTextWidth, ptToPx, type FontStyle } from './measureContainer';
import { twipsToPixels } from '../toFlowBlocks/shared';
import { DEFAULT_TAB_STOP_TWIPS } from '../../docx/settingsParser';

const DEFAULT_FONT_FAMILY = 'Calibri';
const DEFAULT_FONT_SIZE = 11;

/**
 * Marker font resolution per ECMA-376 §17.9.6:
 *  1. explicit numbering-level rPr (`attrs.listMarkerFont*`),
 *  2. first body text run's font, then
 *  3. paragraph defaults, then document defaults.
 */
export function resolveListMarkerFont(block: ParagraphBlock): {
  fontFamily: string;
  fontSize: number;
} {
  const attrs = block.attrs;
  const firstTextRun = block.runs?.find((r): r is TextRun => r.kind === 'text');
  const fontFamily =
    attrs?.listMarkerFontFamily ??
    firstTextRun?.fontFamily ??
    attrs?.defaultFontFamily ??
    DEFAULT_FONT_FAMILY;
  const fontSize =
    attrs?.listMarkerFontSize ??
    firstTextRun?.fontSize ??
    attrs?.defaultFontSize ??
    DEFAULT_FONT_SIZE;
  return { fontFamily, fontSize };
}

/**
 * Compute the marker's inline-block width in pixels, or 0 if the paragraph
 * has no rendered marker.
 *
 * Honors:
 *  - `w:suff` (§17.9.25): `nothing` → natural width, `space` → natural +
 *    one space glyph, `tab` (default) → grow to the next tab stop.
 *  - `w:tabs` on the paragraph: non-`clear`/non-`bar` stops past the marker
 *    (`bar` per §17.3.1.37 is a vertical line that doesn't advance the
 *    cursor).
 *  - `w:defaultTabStop` (§17.6.13): default-grid stops at multiples of the
 *    interval, anchored at 0 (start of body content area, NOT `w:ind`).
 *
 * Word interleaves the two — both custom tabs and default-grid stops are
 * candidates, and the *closest* one past the marker wins (§17.6.13: the
 * default grid is not erased by custom tabs, just augmented).
 *
 * `attrs.tabs` here is the layout-engine `TabStop` shape (`val` + `pos`),
 * not the docx-types `TabStop` (`alignment` + `position`).
 */
export function getListMarkerInlineWidth(block: ParagraphBlock): number {
  const attrs = block.attrs;
  if (!attrs?.listMarker || attrs.listMarkerHidden) return 0;

  const indent = attrs.indent;
  const hanging = indent?.hanging ?? 0;
  if (hanging > 0) return hanging;

  const { fontFamily, fontSize } = resolveListMarkerFont(block);
  const style: FontStyle = { fontFamily, fontSize };
  const naturalWidth = measureTextWidth(attrs.listMarker, style);

  // §17.9.25 — `w:suff` controls what follows the marker before body text.
  const suffix = attrs.listMarkerSuffix ?? 'tab';
  if (suffix === 'nothing') return naturalWidth;
  if (suffix === 'space') return naturalWidth + measureTextWidth(' ', style);

  // Default suffix is `tab`. Body text aligns at the next stop past
  // `markerStart + naturalWidth`. `>=` (not `>`) is intentional: a tab
  // landing exactly at the marker's right edge IS valid — Word renders the
  // body at that column with zero residual gap. §17.9.27.
  const indentLeft = indent?.left ?? 0;
  const firstLine = indent?.firstLine ?? 0;
  const markerStartPx = indentLeft + firstLine;
  const minBodyStart = markerStartPx + naturalWidth;

  const firstCustomPast = (attrs.tabs ?? [])
    .filter((t) => t.val !== 'clear' && t.val !== 'bar')
    .map((t) => twipsToPixels(t.pos))
    .filter((px) => px >= minBodyStart)
    .sort((a, b) => a - b)[0];

  const defaultTabStopPx = twipsToPixels(attrs.defaultTabStopTwips ?? DEFAULT_TAB_STOP_TWIPS);
  const firstGridPast =
    defaultTabStopPx > 0
      ? (Math.floor(minBodyStart / defaultTabStopPx) + 1) * defaultTabStopPx
      : undefined;

  // Closest wins — Word doesn't let a far custom tab override a closer
  // default-grid stop (default grid resumes between custom tabs).
  let bodyStart: number | undefined;
  if (firstCustomPast !== undefined && firstGridPast !== undefined) {
    bodyStart = Math.min(firstCustomPast, firstGridPast);
  } else {
    bodyStart = firstCustomPast ?? firstGridPast;
  }

  if (bodyStart === undefined) {
    // No tab grid at all (defaultTabStopTwips explicitly 0): fall back to
    // a half-em visual gap so the marker doesn't butt up against the text.
    return naturalWidth + ptToPx(fontSize) * 0.5;
  }
  return bodyStart - markerStartPx;
}
