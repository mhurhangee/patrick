/**
 * CSS paste helpers for table cells.
 *
 * Convert inline CSS pasted from Google Docs / Word Online / generic HTML
 * into OOXML-shaped cell attrs (borders, padding, vertical-align, fill).
 * Used by `parseDOM.getAttrs` on the cell + header specs in ./specs.ts.
 */

import type { TableCellAttrs } from '../../../schema/nodes';
import type { ColorValue, BorderSpec } from '../../../../types/colors';

/** Map CSS border-style to OOXML border style. */
function cssBorderStyleToOoxml(cssStyle: string): BorderSpec['style'] {
  switch (cssStyle.toLowerCase()) {
    case 'solid':
      return 'single';
    case 'double':
      return 'double';
    case 'dotted':
      return 'dotted';
    case 'dashed':
      return 'dashed';
    case 'groove':
      return 'threeDEngrave';
    case 'ridge':
      return 'threeDEmboss';
    case 'inset':
      return 'inset';
    case 'outset':
      return 'outset';
    default:
      return 'single';
  }
}

/** Convert CSS border width to OOXML eighths-of-a-point. 1pt = 8 eighths. */
function cssBorderWidthToEighths(cssWidth: string): number {
  if (!cssWidth) return 8;
  const trimmed = cssWidth.trim().toLowerCase();
  if (trimmed === 'thin') return 4;
  if (trimmed === 'medium') return 8;
  if (trimmed === 'thick') return 16;
  const num = parseFloat(trimmed);
  if (isNaN(num)) return 8;
  if (trimmed.endsWith('pt')) return Math.round(num * 8);
  if (trimmed.endsWith('px')) return Math.round(num * 6);
  return Math.round(num * 6); // bare number = px
}

/** Parse CSS color (hex, rgb()) to ColorValue { rgb: 'RRGGBB' }. */
function parseCssColorToColorValue(cssColor: string): ColorValue | null {
  if (!cssColor || cssColor === 'transparent' || cssColor === 'inherit') return null;
  const hexMatch = cssColor.match(/#([0-9a-fA-F]{6})/);
  if (hexMatch) return { rgb: hexMatch[1].toUpperCase() };
  const shortHex = cssColor.match(/#([0-9a-fA-F]{3})$/);
  if (shortHex) {
    const [r, g, b] = shortHex[1];
    return { rgb: (r + r + g + g + b + b).toUpperCase() };
  }
  const rgbMatch = cssColor.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    const hex = [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
      .map((v) => parseInt(v).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    return { rgb: hex };
  }
  return null;
}

/** Extract cell borders from inline CSS (Google Docs: "border-left:solid #000000 1pt"). */
function extractCellBordersFromCSS(style: CSSStyleDeclaration): TableCellAttrs['borders'] | null {
  const parseSide = (
    cssStyle: string,
    cssColor: string,
    cssWidth: string
  ): BorderSpec | undefined => {
    if (!cssStyle || cssStyle === 'none' || cssStyle === 'hidden') return undefined;
    return {
      style: cssBorderStyleToOoxml(cssStyle),
      color: parseCssColorToColorValue(cssColor) || undefined,
      size: cssBorderWidthToEighths(cssWidth),
    };
  };
  const top = parseSide(style.borderTopStyle, style.borderTopColor, style.borderTopWidth);
  const bottom = parseSide(
    style.borderBottomStyle,
    style.borderBottomColor,
    style.borderBottomWidth
  );
  const left = parseSide(style.borderLeftStyle, style.borderLeftColor, style.borderLeftWidth);
  const right = parseSide(style.borderRightStyle, style.borderRightColor, style.borderRightWidth);
  if (!top && !bottom && !left && !right) return null;
  return { top, bottom, left, right };
}

/** Extract cell padding from inline CSS and convert to twips. */
function extractCellMarginsFromCSS(style: CSSStyleDeclaration): TableCellAttrs['margins'] | null {
  const toTwips = (cssValue: string): number | undefined => {
    if (!cssValue || cssValue === '0px') return undefined;
    const num = parseFloat(cssValue);
    if (isNaN(num) || num === 0) return undefined;
    if (cssValue.endsWith('pt')) return Math.round(num * 20);
    return Math.round(num * 15); // px
  };
  const top = toTwips(style.paddingTop);
  const right = toTwips(style.paddingRight);
  const bottom = toTwips(style.paddingBottom);
  const left = toTwips(style.paddingLeft);
  if (top === undefined && right === undefined && bottom === undefined && left === undefined)
    return null;
  return { top, right, bottom, left };
}

/** Map CSS vertical-align to editor's verticalAlign attr. */
function mapCssVerticalAlign(cssValue: string): 'top' | 'center' | 'bottom' | undefined {
  if (!cssValue) return undefined;
  switch (cssValue.toLowerCase()) {
    case 'top':
      return 'top';
    case 'middle':
      return 'center';
    case 'bottom':
      return 'bottom';
    default:
      return undefined;
  }
}

/** Parse CSS color to hex string (without '#' prefix) for backgroundColor attr. */
function parseCssColorToHex(cssColor: string): string | undefined {
  return parseCssColorToColorValue(cssColor)?.rgb;
}

/** Shared parseDOM getAttrs for td/th — extracts borders, padding, alignment from CSS. */
export function parseCellAttrsFromDOM(element: HTMLTableCellElement): TableCellAttrs {
  const style = element.style;
  const borders = extractCellBordersFromCSS(style);
  const margins = extractCellMarginsFromCSS(style);
  return {
    colspan: element.colSpan || 1,
    rowspan: element.rowSpan || 1,
    verticalAlign:
      (element.dataset.valign as TableCellAttrs['verticalAlign']) ||
      mapCssVerticalAlign(style.verticalAlign) ||
      undefined,
    backgroundColor:
      element.dataset.bgcolor || parseCssColorToHex(style.backgroundColor) || undefined,
    borders: borders || undefined,
    margins: margins || undefined,
  };
}
