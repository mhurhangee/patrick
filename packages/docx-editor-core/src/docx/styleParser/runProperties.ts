/**
 * Run & shared color/shading property parsers.
 *
 * `parseRunProperties` covers the full w:rPr surface (bold/italic/underline,
 * theme-resolved fonts via `resolveThemeFontRef`, character spacing/position/
 * scale/kerning, RTL, effects, emphasis, style ref). `parseColorValue` and
 * `parseShadingProperties` are also imported by paragraph- and table-property
 * parsers under this folder.
 */

import type {
  Theme,
  TextFormatting,
  ColorValue,
  ShadingProperties,
  UnderlineStyle,
} from '../../types/document';
import {
  findChild,
  getAttribute,
  parseBooleanElement,
  parseNumericAttribute,
  type XmlElement,
} from '../xmlParser';
import { resolveThemeFontRef } from '../themeParser';

/**
 * Parse color value from attributes
 */
export function parseColorValue(
  rgb: string | null,
  themeColor: string | null,
  themeTint: string | null,
  themeShade: string | null
): ColorValue {
  const color: ColorValue = {};

  if (rgb && rgb !== 'auto') {
    color.rgb = rgb;
  } else if (rgb === 'auto') {
    color.auto = true;
  }

  if (themeColor) {
    color.themeColor = themeColor as ColorValue['themeColor'];
  }

  if (themeTint) {
    color.themeTint = themeTint;
  }

  if (themeShade) {
    color.themeShade = themeShade;
  }

  return color;
}

/**
 * Parse shading properties (w:shd)
 */
export function parseShadingProperties(shd: XmlElement | null): ShadingProperties | undefined {
  if (!shd) return undefined;

  const props: ShadingProperties = {};

  const color = getAttribute(shd, 'w', 'color');
  if (color && color !== 'auto') {
    props.color = { rgb: color };
  }

  const fill = getAttribute(shd, 'w', 'fill');
  if (fill && fill !== 'auto') {
    props.fill = { rgb: fill };
  }

  const themeFill = getAttribute(shd, 'w', 'themeFill');
  if (themeFill) {
    props.fill = props.fill || {};
    props.fill.themeColor = themeFill as ColorValue['themeColor'];
  }

  const themeFillTint = getAttribute(shd, 'w', 'themeFillTint');
  if (themeFillTint && props.fill) {
    props.fill.themeTint = themeFillTint;
  }

  const themeFillShade = getAttribute(shd, 'w', 'themeFillShade');
  if (themeFillShade && props.fill) {
    props.fill.themeShade = themeFillShade;
  }

  const pattern = getAttribute(shd, 'w', 'val');
  if (pattern) {
    props.pattern = pattern as ShadingProperties['pattern'];
  }

  return Object.keys(props).length > 0 ? props : undefined;
}

/**
 * Parse text formatting properties (w:rPr)
 */
export function parseRunProperties(
  rPr: XmlElement | null,
  theme: Theme | null
): TextFormatting | undefined {
  if (!rPr) return undefined;

  const formatting: TextFormatting = {};

  // Bold
  const b = findChild(rPr, 'w', 'b');
  if (b) formatting.bold = parseBooleanElement(b);

  const bCs = findChild(rPr, 'w', 'bCs');
  if (bCs) formatting.boldCs = parseBooleanElement(bCs);

  // Italic
  const i = findChild(rPr, 'w', 'i');
  if (i) formatting.italic = parseBooleanElement(i);

  const iCs = findChild(rPr, 'w', 'iCs');
  if (iCs) formatting.italicCs = parseBooleanElement(iCs);

  // Underline
  const u = findChild(rPr, 'w', 'u');
  if (u) {
    const style = getAttribute(u, 'w', 'val') as UnderlineStyle | null;
    if (style) {
      formatting.underline = { style };
      const colorVal = getAttribute(u, 'w', 'color');
      const themeColor = getAttribute(u, 'w', 'themeColor');
      if (colorVal || themeColor) {
        formatting.underline.color = parseColorValue(
          colorVal,
          themeColor,
          getAttribute(u, 'w', 'themeTint'),
          getAttribute(u, 'w', 'themeShade')
        );
      }
    }
  }

  // Strikethrough
  const strike = findChild(rPr, 'w', 'strike');
  if (strike) formatting.strike = parseBooleanElement(strike);

  const dstrike = findChild(rPr, 'w', 'dstrike');
  if (dstrike) formatting.doubleStrike = parseBooleanElement(dstrike);

  // Vertical alignment (superscript/subscript)
  const vertAlign = findChild(rPr, 'w', 'vertAlign');
  if (vertAlign) {
    const val = getAttribute(vertAlign, 'w', 'val');
    if (val === 'superscript' || val === 'subscript' || val === 'baseline') {
      formatting.vertAlign = val;
    }
  }

  // Capitalization
  const smallCaps = findChild(rPr, 'w', 'smallCaps');
  if (smallCaps) formatting.smallCaps = parseBooleanElement(smallCaps);

  const caps = findChild(rPr, 'w', 'caps');
  if (caps) formatting.allCaps = parseBooleanElement(caps);

  // Hidden
  const vanish = findChild(rPr, 'w', 'vanish');
  if (vanish) formatting.hidden = parseBooleanElement(vanish);

  // Color
  const color = findChild(rPr, 'w', 'color');
  if (color) {
    formatting.color = parseColorValue(
      getAttribute(color, 'w', 'val'),
      getAttribute(color, 'w', 'themeColor'),
      getAttribute(color, 'w', 'themeTint'),
      getAttribute(color, 'w', 'themeShade')
    );
  }

  // Highlight
  const highlight = findChild(rPr, 'w', 'highlight');
  if (highlight) {
    const val = getAttribute(highlight, 'w', 'val');
    if (val) {
      formatting.highlight = val as TextFormatting['highlight'];
    }
  }

  // Character shading
  const shd = findChild(rPr, 'w', 'shd');
  if (shd) {
    formatting.shading = parseShadingProperties(shd);
  }

  // Font size (in half-points)
  const sz = findChild(rPr, 'w', 'sz');
  if (sz) {
    const val = parseNumericAttribute(sz, 'w', 'val');
    if (val !== undefined) formatting.fontSize = val;
  }

  const szCs = findChild(rPr, 'w', 'szCs');
  if (szCs) {
    const val = parseNumericAttribute(szCs, 'w', 'val');
    if (val !== undefined) formatting.fontSizeCs = val;
  }

  // Font family
  const rFonts = findChild(rPr, 'w', 'rFonts');
  if (rFonts) {
    formatting.fontFamily = {
      ascii: getAttribute(rFonts, 'w', 'ascii') ?? undefined,
      hAnsi: getAttribute(rFonts, 'w', 'hAnsi') ?? undefined,
      eastAsia: getAttribute(rFonts, 'w', 'eastAsia') ?? undefined,
      cs: getAttribute(rFonts, 'w', 'cs') ?? undefined,
    };

    // Theme font references - resolve to actual font names
    const asciiTheme = getAttribute(rFonts, 'w', 'asciiTheme');
    if (asciiTheme) {
      formatting.fontFamily.asciiTheme = asciiTheme as TextFormatting['fontFamily'] extends {
        asciiTheme?: infer T;
      }
        ? T
        : never;
      // Also resolve the actual font name for convenience
      if (theme && !formatting.fontFamily.ascii) {
        formatting.fontFamily.ascii = resolveThemeFontRef(theme, asciiTheme);
      }
    }
    const hAnsiTheme = getAttribute(rFonts, 'w', 'hAnsiTheme');
    if (hAnsiTheme) {
      formatting.fontFamily.hAnsiTheme = hAnsiTheme;
      if (theme && !formatting.fontFamily.hAnsi) {
        formatting.fontFamily.hAnsi = resolveThemeFontRef(theme, hAnsiTheme);
      }
    }
    const eastAsiaTheme = getAttribute(rFonts, 'w', 'eastAsiaTheme');
    if (eastAsiaTheme) {
      formatting.fontFamily.eastAsiaTheme = eastAsiaTheme;
      if (theme && !formatting.fontFamily.eastAsia) {
        formatting.fontFamily.eastAsia = resolveThemeFontRef(theme, eastAsiaTheme);
      }
    }
    const csTheme = getAttribute(rFonts, 'w', 'cstheme');
    if (csTheme) {
      formatting.fontFamily.csTheme = csTheme;
      if (theme && !formatting.fontFamily.cs) {
        formatting.fontFamily.cs = resolveThemeFontRef(theme, csTheme);
      }
    }
  }

  // Character spacing (in twips)
  const spacing = findChild(rPr, 'w', 'spacing');
  if (spacing) {
    const val = parseNumericAttribute(spacing, 'w', 'val');
    if (val !== undefined) formatting.spacing = val;
  }

  // Position (raised/lowered in half-points)
  const position = findChild(rPr, 'w', 'position');
  if (position) {
    const val = parseNumericAttribute(position, 'w', 'val');
    if (val !== undefined) formatting.position = val;
  }

  // Scale (horizontal text scale percentage)
  const w = findChild(rPr, 'w', 'w');
  if (w) {
    const val = parseNumericAttribute(w, 'w', 'val');
    if (val !== undefined) formatting.scale = val;
  }

  // Kerning
  const kern = findChild(rPr, 'w', 'kern');
  if (kern) {
    const val = parseNumericAttribute(kern, 'w', 'val');
    if (val !== undefined) formatting.kerning = val;
  }

  // Text effects
  const effect = findChild(rPr, 'w', 'effect');
  if (effect) {
    const val = getAttribute(effect, 'w', 'val');
    if (val) formatting.effect = val as TextFormatting['effect'];
  }

  // Emphasis mark
  const em = findChild(rPr, 'w', 'em');
  if (em) {
    const val = getAttribute(em, 'w', 'val');
    if (val) formatting.emphasisMark = val as TextFormatting['emphasisMark'];
  }

  // Other effects
  const emboss = findChild(rPr, 'w', 'emboss');
  if (emboss) formatting.emboss = parseBooleanElement(emboss);

  const imprint = findChild(rPr, 'w', 'imprint');
  if (imprint) formatting.imprint = parseBooleanElement(imprint);

  const outline = findChild(rPr, 'w', 'outline');
  if (outline) formatting.outline = parseBooleanElement(outline);

  const shadow = findChild(rPr, 'w', 'shadow');
  if (shadow) formatting.shadow = parseBooleanElement(shadow);

  // RTL and complex script
  const rtl = findChild(rPr, 'w', 'rtl');
  if (rtl) formatting.rtl = parseBooleanElement(rtl);

  const cs = findChild(rPr, 'w', 'cs');
  if (cs) formatting.cs = parseBooleanElement(cs);

  // Character style reference
  const rStyle = findChild(rPr, 'w', 'rStyle');
  if (rStyle) {
    const val = getAttribute(rStyle, 'w', 'val');
    if (val) formatting.styleId = val;
  }

  return Object.keys(formatting).length > 0 ? formatting : undefined;
}
