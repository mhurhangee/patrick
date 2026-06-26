/**
 * Watermark rendering.
 *
 * Paints a watermark as a full-page layer that sits behind the body content
 * (matching MS Word, where the watermark is page-positioned and shows through
 * the transparent text area). Owns `renderWatermarkLayer`, called by
 * `renderPage` once per page.
 *
 * The VML `v:textpath` is approximated with a CSS-rotated text element rather
 * than true text-on-a-path — visually equivalent for Word's standard straight
 * diagonal/horizontal watermarks and far simpler.
 */

import type { Watermark, TextWatermark, PictureWatermark } from '../types/document';
import type { Page } from '../layout-engine/types';
import { resolveFontFamily } from '../utils/fontResolver';

/** Class name on the watermark layer (stable for queries/tests). */
export const WATERMARK_LAYER_CLASS = 'layout-watermark-layer';

/**
 * Estimate a font size (px) so the text spans most of the available width.
 * Word auto-sizes the WordArt box to roughly fill the margin width; we
 * approximate using an average glyph advance of ~0.62em.
 */
function autoFontSizePx(text: string, availableWidthPx: number): number {
  const chars = Math.max(text.trim().length, 1);
  const size = availableWidthPx / (chars * 0.62);
  // Clamp to a sane range so a 1-char watermark doesn't fill the whole page.
  return Math.max(24, Math.min(size, 180));
}

function renderTextWatermark(wm: TextWatermark, page: Page, doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.style.position = 'absolute';
  el.style.top = '50%';
  el.style.left = '50%';
  el.style.whiteSpace = 'nowrap';
  el.style.fontWeight = 'bold';
  el.style.color = wm.color;
  el.style.fontFamily = resolveFontFamily(wm.font).cssFallback;
  el.style.userSelect = 'none';

  const contentWidth = page.size.w - page.margins.left - page.margins.right;
  // Diagonal text spans the diagonal of the content box; give it more room.
  const targetWidth = wm.layout === 'diagonal' ? contentWidth * 1.3 : contentWidth;
  const fontSizePx =
    wm.fontSize !== undefined ? (wm.fontSize * 96) / 72 : autoFontSizePx(wm.text, targetWidth);
  el.style.fontSize = `${fontSizePx}px`;
  el.style.lineHeight = '1';

  // Word's semitransparent watermark renders at ~50% opacity; opaque text still
  // sits a touch back from full strength so body text stays readable.
  el.style.opacity = wm.semitransparent ? '0.5' : '0.85';

  const rotate = wm.layout === 'diagonal' ? -45 : 0;
  el.style.transform = `translate(-50%, -50%) rotate(${rotate}deg)`;
  el.style.transformOrigin = 'center center';

  el.textContent = wm.text;
  return el;
}

function renderPictureWatermark(
  wm: PictureWatermark,
  page: Page,
  doc: Document
): HTMLElement | null {
  if (!wm.dataUrl) return null;

  const img = doc.createElement('img');
  img.src = wm.dataUrl;
  img.alt = '';
  img.style.position = 'absolute';
  img.style.top = '50%';
  img.style.left = '50%';
  img.style.transform = 'translate(-50%, -50%)';

  const contentWidth = page.size.w - page.margins.left - page.margins.right;
  const naturalWidthPx =
    wm.widthEmu !== undefined ? wm.widthEmu / (914400 / 96) : contentWidth * 0.75;
  img.style.width = `${naturalWidthPx * (wm.scale || 1)}px`;
  img.style.height = 'auto';

  // Word "Washout" lightens the image and lowers contrast so text stays legible.
  if (wm.washout) {
    img.style.opacity = '0.5';
    img.style.filter = 'brightness(1.4) contrast(0.4)';
  }
  return img;
}

/**
 * Build a full-page, behind-content watermark layer for a page.
 *
 * @returns The layer element, or null when nothing renders (e.g. an unresolved
 *   picture watermark).
 */
export function renderWatermarkLayer(
  watermark: Watermark,
  page: Page,
  doc: Document = document
): HTMLElement | null {
  const inner =
    watermark.kind === 'text'
      ? renderTextWatermark(watermark, page, doc)
      : renderPictureWatermark(watermark, page, doc);
  if (!inner) return null;

  const layer = doc.createElement('div');
  layer.className = WATERMARK_LAYER_CLASS;
  layer.setAttribute('aria-hidden', 'true');
  layer.style.position = 'absolute';
  layer.style.inset = '0';
  layer.style.overflow = 'hidden';
  layer.style.pointerEvents = 'none';
  // Above the white page background, below the body content (appended first).
  layer.style.zIndex = '0';
  layer.appendChild(inner);
  return layer;
}
