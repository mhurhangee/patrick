/**
 * Style Parser - Parse styles.xml with full inheritance resolution
 *
 * Parses all style types (paragraph, character, table, list) with
 * complete basedOn inheritance chain resolution.
 *
 * OOXML Reference:
 * - Style file is at: word/styles.xml
 * - Uses WordprocessingML namespace (w:)
 *
 * Style Cascade (lowest to highest priority):
 * 1. Document defaults (w:docDefaults)
 * 2. Parent style properties (w:basedOn chain)
 * 3. Current style properties
 * 4. Direct formatting in document
 *
 * This file owns the style element itself, docDefaults, inheritance
 * resolution, and the top-level entry points (parseStyles,
 * parseStyleDefinitions, getResolved*). Property-level parsers live under
 * ./styleParser/{runProperties,paragraphProperties,tableProperties}.ts.
 */

import type {
  Theme,
  Style,
  StyleType,
  StyleDefinitions,
  DocDefaults,
  ParagraphFormatting,
} from '../types/document';
import {
  parseXmlDocument,
  findChild,
  findChildren,
  getAttribute,
  parseBooleanElement,
  parseNumericAttribute,
  type XmlElement,
} from './xmlParser';
import { mergeTextFormatting } from '../utils/textFormattingMerge';

import { parseRunProperties } from './styleParser/runProperties';
import { parseParagraphProperties } from './styleParser/paragraphProperties';
import {
  parseTableProperties,
  parseTableRowProperties,
  parseTableCellProperties,
} from './styleParser/tableProperties';

/**
 * Style map keyed by styleId
 */
export type StyleMap = Map<string, Style>;

/**
 * Parse a single style element (w:style)
 */
function parseStyle(styleEl: XmlElement, theme: Theme | null): Style {
  const style: Style = {
    styleId: getAttribute(styleEl, 'w', 'styleId') ?? '',
    type: (getAttribute(styleEl, 'w', 'type') as StyleType) ?? 'paragraph',
  };

  // Default flag
  const defaultAttr = getAttribute(styleEl, 'w', 'default');
  if (defaultAttr) style.default = defaultAttr === '1' || defaultAttr === 'true';

  // Name
  const nameEl = findChild(styleEl, 'w', 'name');
  if (nameEl) {
    style.name = getAttribute(nameEl, 'w', 'val') ?? undefined;
  }

  // Based on (inheritance)
  const basedOn = findChild(styleEl, 'w', 'basedOn');
  if (basedOn) {
    style.basedOn = getAttribute(basedOn, 'w', 'val') ?? undefined;
  }

  // Next style
  const next = findChild(styleEl, 'w', 'next');
  if (next) {
    style.next = getAttribute(next, 'w', 'val') ?? undefined;
  }

  // Linked style
  const link = findChild(styleEl, 'w', 'link');
  if (link) {
    style.link = getAttribute(link, 'w', 'val') ?? undefined;
  }

  // UI Priority
  const uiPriority = findChild(styleEl, 'w', 'uiPriority');
  if (uiPriority) {
    const val = parseNumericAttribute(uiPriority, 'w', 'val');
    if (val !== undefined) style.uiPriority = val;
  }

  // Hidden/Semi-hidden
  const hidden = findChild(styleEl, 'w', 'hidden');
  if (hidden) style.hidden = parseBooleanElement(hidden);

  const semiHidden = findChild(styleEl, 'w', 'semiHidden');
  if (semiHidden) style.semiHidden = parseBooleanElement(semiHidden);

  // Unhide when used
  const unhideWhenUsed = findChild(styleEl, 'w', 'unhideWhenUsed');
  if (unhideWhenUsed) style.unhideWhenUsed = parseBooleanElement(unhideWhenUsed);

  // Quick format
  const qFormat = findChild(styleEl, 'w', 'qFormat');
  if (qFormat) style.qFormat = parseBooleanElement(qFormat);

  // Personal/custom style
  const personal = findChild(styleEl, 'w', 'personal');
  if (personal) style.personal = parseBooleanElement(personal);

  // Paragraph properties
  const pPr = findChild(styleEl, 'w', 'pPr');
  if (pPr) {
    style.pPr = parseParagraphProperties(pPr, theme);
  }

  // Run properties
  const rPr = findChild(styleEl, 'w', 'rPr');
  if (rPr) {
    style.rPr = parseRunProperties(rPr, theme);
  }

  // Table properties (for table styles)
  const tblPr = findChild(styleEl, 'w', 'tblPr');
  if (tblPr) {
    style.tblPr = parseTableProperties(tblPr, theme);
  }

  // Table row properties
  const trPr = findChild(styleEl, 'w', 'trPr');
  if (trPr) {
    style.trPr = parseTableRowProperties(trPr);
  }

  // Table cell properties
  const tcPr = findChild(styleEl, 'w', 'tcPr');
  if (tcPr) {
    style.tcPr = parseTableCellProperties(tcPr, theme);
  }

  // Table style conditional formatting (tblStylePr)
  const tblStylePrs = findChildren(styleEl, 'w', 'tblStylePr');
  if (tblStylePrs.length > 0) {
    style.tblStylePr = [];

    for (const tblStylePr of tblStylePrs) {
      const typeAttr = getAttribute(tblStylePr, 'w', 'type');
      if (typeAttr) {
        const conditionalStyle: NonNullable<Style['tblStylePr']>[number] = {
          type: typeAttr as NonNullable<Style['tblStylePr']>[number]['type'],
        };

        const condPPr = findChild(tblStylePr, 'w', 'pPr');
        if (condPPr) conditionalStyle.pPr = parseParagraphProperties(condPPr, theme);

        const condRPr = findChild(tblStylePr, 'w', 'rPr');
        if (condRPr) conditionalStyle.rPr = parseRunProperties(condRPr, theme);

        const condTblPr = findChild(tblStylePr, 'w', 'tblPr');
        if (condTblPr) conditionalStyle.tblPr = parseTableProperties(condTblPr, theme);

        const condTrPr = findChild(tblStylePr, 'w', 'trPr');
        if (condTrPr) conditionalStyle.trPr = parseTableRowProperties(condTrPr);

        const condTcPr = findChild(tblStylePr, 'w', 'tcPr');
        if (condTcPr) conditionalStyle.tcPr = parseTableCellProperties(condTcPr, theme);

        style.tblStylePr.push(conditionalStyle);
      }
    }
  }

  return style;
}

/**
 * Parse document defaults (w:docDefaults)
 */
function parseDocDefaults(
  docDefaults: XmlElement | null,
  theme: Theme | null
): DocDefaults | undefined {
  if (!docDefaults) return undefined;

  const result: DocDefaults = {};

  // Default run properties
  const rPrDefault = findChild(docDefaults, 'w', 'rPrDefault');
  if (rPrDefault) {
    const rPr = findChild(rPrDefault, 'w', 'rPr');
    if (rPr) {
      result.rPr = parseRunProperties(rPr, theme);
    }
  }

  // Default paragraph properties
  const pPrDefault = findChild(docDefaults, 'w', 'pPrDefault');
  if (pPrDefault) {
    const pPr = findChild(pPrDefault, 'w', 'pPr');
    if (pPr) {
      result.pPr = parseParagraphProperties(pPr, theme);
    }
  }

  return result.rPr || result.pPr ? result : undefined;
}

/**
 * Deep merge paragraph formatting (source overrides target)
 */
function mergeParagraphFormatting(
  target: ParagraphFormatting | undefined,
  source: ParagraphFormatting | undefined
): ParagraphFormatting | undefined {
  if (!source) return target;
  if (!target) return source ? { ...source } : undefined;

  const result = { ...target };

  for (const key of Object.keys(source) as (keyof ParagraphFormatting)[]) {
    const value = source[key];
    if (value !== undefined) {
      if (key === 'runProperties') {
        result.runProperties = mergeTextFormatting(result.runProperties, source.runProperties);
      } else if (key === 'borders' || key === 'numPr' || key === 'frame') {
        const baseValue = result[key] as Record<string, unknown> | undefined;
        const sourceValue = value as Record<string, unknown> | undefined;
        (result as Record<string, unknown>)[key] = { ...(baseValue || {}), ...(sourceValue || {}) };
      } else if (key === 'tabs' && Array.isArray(value)) {
        result.tabs = [...value];
      } else {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }

  return result;
}

/**
 * Resolve style inheritance chain
 */
function resolveStyleInheritance(
  style: Style,
  styleMap: StyleMap,
  theme: Theme | null,
  visited: Set<string> = new Set()
): Style {
  // Prevent circular inheritance
  if (visited.has(style.styleId)) {
    return style;
  }
  visited.add(style.styleId);

  // If no basedOn, return as-is
  if (!style.basedOn) {
    return style;
  }

  // Get parent style
  const parentStyle = styleMap.get(style.basedOn);
  if (!parentStyle) {
    return style;
  }

  // Recursively resolve parent
  const resolvedParent = resolveStyleInheritance(parentStyle, styleMap, theme, visited);

  // Merge parent into this style (this style overrides parent)
  const resolved: Style = {
    ...style,
    pPr: mergeParagraphFormatting(resolvedParent.pPr, style.pPr),
    rPr: mergeTextFormatting(resolvedParent.rPr, style.rPr),
  };

  // Merge table properties if this is a table style
  if (style.type === 'table') {
    if (resolvedParent.tblPr || style.tblPr) {
      resolved.tblPr = { ...(resolvedParent.tblPr || {}), ...(style.tblPr || {}) };
    }
    if (resolvedParent.trPr || style.trPr) {
      resolved.trPr = { ...(resolvedParent.trPr || {}), ...(style.trPr || {}) };
    }
    if (resolvedParent.tcPr || style.tcPr) {
      resolved.tcPr = { ...(resolvedParent.tcPr || {}), ...(style.tcPr || {}) };
    }
  }

  return resolved;
}

/**
 * Parse styles.xml content
 *
 * @param stylesXml - XML content of styles.xml
 * @param theme - Parsed theme for resolving theme references
 * @returns StyleMap with resolved inheritance
 */
export function parseStyles(stylesXml: string, theme: Theme | null): StyleMap {
  const styleMap: StyleMap = new Map();

  try {
    const doc = parseXmlDocument(stylesXml);
    if (!doc) {
      return styleMap;
    }

    // First pass: parse all styles without inheritance resolution
    const styleElements = findChildren(doc, 'w', 'style');
    for (const styleEl of styleElements) {
      const style = parseStyle(styleEl, theme);
      if (style.styleId) {
        styleMap.set(style.styleId, style);
      }
    }

    // Second pass: resolve inheritance
    for (const [styleId, style] of styleMap) {
      const resolved = resolveStyleInheritance(style, styleMap, theme);
      styleMap.set(styleId, resolved);
    }
  } catch (error) {
    console.warn('Failed to parse styles:', error);
  }

  return styleMap;
}

/**
 * Parse complete style definitions including docDefaults
 *
 * @param stylesXml - XML content of styles.xml
 * @param theme - Parsed theme for resolving theme references
 * @returns StyleDefinitions with docDefaults and resolved styles
 */
export function parseStyleDefinitions(stylesXml: string, theme: Theme | null): StyleDefinitions {
  const result: StyleDefinitions = {
    styles: [],
  };

  try {
    const doc = parseXmlDocument(stylesXml);
    if (!doc) {
      return result;
    }

    // Parse document defaults
    const docDefaultsEl = findChild(doc, 'w', 'docDefaults');
    result.docDefaults = parseDocDefaults(docDefaultsEl, theme);

    // Parse latent styles
    const latentStylesEl = findChild(doc, 'w', 'latentStyles');
    if (latentStylesEl) {
      result.latentStyles = {
        defLockedState: getAttribute(latentStylesEl, 'w', 'defLockedState') === '1',
        defUIPriority: parseNumericAttribute(latentStylesEl, 'w', 'defUIPriority'),
        defSemiHidden: getAttribute(latentStylesEl, 'w', 'defSemiHidden') === '1',
        defUnhideWhenUsed: getAttribute(latentStylesEl, 'w', 'defUnhideWhenUsed') === '1',
        defQFormat: getAttribute(latentStylesEl, 'w', 'defQFormat') === '1',
        count: parseNumericAttribute(latentStylesEl, 'w', 'count'),
      };
    }

    // Parse styles with full inheritance resolution
    const styleMap = parseStyles(stylesXml, theme);
    result.styles = Array.from(styleMap.values());
  } catch (error) {
    console.warn('Failed to parse style definitions:', error);
  }

  return result;
}

/**
 * Get the resolved properties for a style
 *
 * @param styleId - Style ID to look up
 * @param styleMap - Style map from parseStyles
 * @returns Resolved style or undefined
 */
export function getResolvedStyle(styleId: string, styleMap: StyleMap): Style | undefined {
  return styleMap.get(styleId);
}

/**
 * Get the default paragraph style
 */
export function getDefaultParagraphStyle(styleMap: StyleMap): Style | undefined {
  for (const style of styleMap.values()) {
    if (style.type === 'paragraph' && style.default) {
      return style;
    }
  }
  // Fallback to "Normal" style
  return styleMap.get('Normal');
}

/**
 * Get the default character style
 */
export function getDefaultCharacterStyle(styleMap: StyleMap): Style | undefined {
  for (const style of styleMap.values()) {
    if (style.type === 'character' && style.default) {
      return style;
    }
  }
  return undefined;
}

/**
 * Get the default table style.
 *
 * Per ECMA-376 §17.7.4.18 (`<w:default>`), exactly one style of each type may
 * be marked default; tables that do not specify a `w:tblStyle` inherit from
 * that style. The styleId varies by document language ("Normal Table",
 * "TableNormal", "Tabelanormal", etc.) — find it by the parsed `default` flag,
 * not by name.
 */
export function getDefaultTableStyle(styleMap: StyleMap): Style | undefined {
  for (const style of styleMap.values()) {
    if (style.type === 'table' && style.default) {
      return style;
    }
  }
  return undefined;
}

/**
 * Get all styles of a specific type
 */
export function getStylesByType(styleMap: StyleMap, type: StyleType): Style[] {
  const result: Style[] = [];
  for (const style of styleMap.values()) {
    if (style.type === type) {
      result.push(style);
    }
  }
  return result;
}
