/**
 * Paragraph property parser (w:pPr → ParagraphFormatting).
 *
 * Owns parseParagraphProperties and its five leaf helpers (color, shading,
 * border, tab stop, frame). Mirrors the document side of the style cascade —
 * `styleParser/paragraphProperties.ts` parses the same shape inside `<w:style>`
 * definitions.
 */

import type {
  ParagraphFormatting,
  Theme,
  ColorValue,
  ShadingProperties,
  TabStop,
  TabStopAlignment,
  TabLeader,
  LineSpacingRule,
  ParagraphAlignment,
} from '../../types/document';
import type { StyleMap } from '../styleParser';
import {
  findChild,
  findChildren,
  getAttribute,
  parseBooleanElement,
  parseNumericAttribute,
  type XmlElement,
} from '../xmlParser';
import { parseRunProperties } from '../runParser';
import { parseParagraphBorders } from '../borderParser';

/**
 * Parse shading properties (w:shd)
 */
function parseShadingProperties(shd: XmlElement | null): ShadingProperties | undefined {
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
 * Parse tab stops (w:tabs)
 */
function parseTabStops(tabs: XmlElement | null): TabStop[] | undefined {
  if (!tabs) return undefined;

  const tabElements = findChildren(tabs, 'w', 'tab');
  if (tabElements.length === 0) return undefined;

  const result: TabStop[] = [];

  for (const tab of tabElements) {
    const pos = parseNumericAttribute(tab, 'w', 'pos');
    const val = getAttribute(tab, 'w', 'val');

    if (pos !== undefined && val) {
      const tabStop: TabStop = {
        position: pos,
        alignment: val as TabStopAlignment,
      };

      const leader = getAttribute(tab, 'w', 'leader');
      if (leader) {
        tabStop.leader = leader as TabLeader;
      }

      result.push(tabStop);
    }
  }

  return result.length > 0 ? result : undefined;
}

/**
 * Parse frame properties (w:framePr)
 */
function parseFrameProperties(
  framePr: XmlElement | null
): ParagraphFormatting['frame'] | undefined {
  if (!framePr) return undefined;

  const frame: ParagraphFormatting['frame'] = {};

  const w = parseNumericAttribute(framePr, 'w', 'w');
  if (w !== undefined) frame.width = w;

  const h = parseNumericAttribute(framePr, 'w', 'h');
  if (h !== undefined) frame.height = h;

  const hAnchor = getAttribute(framePr, 'w', 'hAnchor');
  if (hAnchor === 'text' || hAnchor === 'margin' || hAnchor === 'page') {
    frame.hAnchor = hAnchor;
  }

  const vAnchor = getAttribute(framePr, 'w', 'vAnchor');
  if (vAnchor === 'text' || vAnchor === 'margin' || vAnchor === 'page') {
    frame.vAnchor = vAnchor;
  }

  const x = parseNumericAttribute(framePr, 'w', 'x');
  if (x !== undefined) frame.x = x;

  const y = parseNumericAttribute(framePr, 'w', 'y');
  if (y !== undefined) frame.y = y;

  const xAlign = getAttribute(framePr, 'w', 'xAlign');
  if (xAlign) {
    frame.xAlign = xAlign as NonNullable<ParagraphFormatting['frame']>['xAlign'];
  }

  const yAlign = getAttribute(framePr, 'w', 'yAlign');
  if (yAlign) {
    frame.yAlign = yAlign as NonNullable<ParagraphFormatting['frame']>['yAlign'];
  }

  const wrap = getAttribute(framePr, 'w', 'wrap');
  if (wrap) {
    frame.wrap = wrap as NonNullable<ParagraphFormatting['frame']>['wrap'];
  }

  return Object.keys(frame).length > 0 ? frame : undefined;
}

/**
 * Parse paragraph formatting properties (w:pPr)
 *
 * Handles ALL pPr properties:
 * - w:jc (alignment: left, center, right, both/justify)
 * - w:spacing (before, after, line, lineRule)
 * - w:ind (left, right, firstLine, hanging)
 * - w:pBdr (paragraph borders: top, bottom, left, right, between)
 * - w:shd (paragraph shading/background)
 * - w:tabs (tab stops with positions and types)
 * - w:keepNext, w:keepLines, w:widowControl, w:pageBreakBefore
 * - w:bidi (right-to-left)
 * - w:numPr (list info)
 * - w:pStyle (style reference)
 * - w:outlineLvl (outline level)
 * - w:framePr (frame properties)
 * - w:rPr (default run properties)
 */
export function parseParagraphProperties(
  pPr: XmlElement | null,
  theme: Theme | null,
  styles?: StyleMap
): ParagraphFormatting | undefined {
  if (!pPr) return undefined;

  const formatting: ParagraphFormatting = {};

  // === Alignment ===
  const jc = findChild(pPr, 'w', 'jc');
  if (jc) {
    const val = getAttribute(jc, 'w', 'val');
    if (val) {
      formatting.alignment = val as ParagraphAlignment;
    }
  }

  // === Bidi (right-to-left) ===
  const bidi = findChild(pPr, 'w', 'bidi');
  if (bidi) {
    formatting.bidi = parseBooleanElement(bidi);
  }

  // === Spacing ===
  const spacing = findChild(pPr, 'w', 'spacing');
  if (spacing) {
    const before = parseNumericAttribute(spacing, 'w', 'before');
    if (before !== undefined) formatting.spaceBefore = before;

    const after = parseNumericAttribute(spacing, 'w', 'after');
    if (after !== undefined) formatting.spaceAfter = after;

    const line = parseNumericAttribute(spacing, 'w', 'line');
    if (line !== undefined) formatting.lineSpacing = line;

    // See ParagraphFormatting.spacingExplicit.
    const explicit: { before?: boolean; after?: boolean } = {};
    if (before !== undefined) explicit.before = true;
    if (after !== undefined) explicit.after = true;
    if (explicit.before || explicit.after) {
      formatting.spacingExplicit = explicit;
    }

    const lineRule = getAttribute(spacing, 'w', 'lineRule');
    if (lineRule) {
      formatting.lineSpacingRule = lineRule as LineSpacingRule;
    }

    const beforeAuto = getAttribute(spacing, 'w', 'beforeAutospacing');
    if (beforeAuto) {
      formatting.beforeAutospacing = beforeAuto === '1' || beforeAuto === 'true';
    }

    const afterAuto = getAttribute(spacing, 'w', 'afterAutospacing');
    if (afterAuto) {
      formatting.afterAutospacing = afterAuto === '1' || afterAuto === 'true';
    }
  }

  // === Indentation ===
  const ind = findChild(pPr, 'w', 'ind');
  if (ind) {
    const left = parseNumericAttribute(ind, 'w', 'left');
    if (left !== undefined) formatting.indentLeft = left;

    const right = parseNumericAttribute(ind, 'w', 'right');
    if (right !== undefined) formatting.indentRight = right;

    const firstLine = parseNumericAttribute(ind, 'w', 'firstLine');
    if (firstLine !== undefined) formatting.indentFirstLine = firstLine;

    const hanging = parseNumericAttribute(ind, 'w', 'hanging');
    if (hanging !== undefined) {
      // Hanging indent is stored as negative first line indent
      formatting.indentFirstLine = -hanging;
      formatting.hangingIndent = true;
    }

    // Also check for w:start and w:end (alternative attributes)
    const start = parseNumericAttribute(ind, 'w', 'start');
    if (start !== undefined && formatting.indentLeft === undefined) {
      formatting.indentLeft = start;
    }

    const end = parseNumericAttribute(ind, 'w', 'end');
    if (end !== undefined && formatting.indentRight === undefined) {
      formatting.indentRight = end;
    }
  }

  // === Borders ===
  const paragraphBorders = parseParagraphBorders(findChild(pPr, 'w', 'pBdr'));
  if (paragraphBorders) formatting.borders = paragraphBorders;

  // === Shading ===
  const shd = findChild(pPr, 'w', 'shd');
  if (shd) {
    formatting.shading = parseShadingProperties(shd);
  }

  // === Tab Stops ===
  const tabs = findChild(pPr, 'w', 'tabs');
  if (tabs) {
    formatting.tabs = parseTabStops(tabs);
  }

  // === Page Break Control ===
  const keepNext = findChild(pPr, 'w', 'keepNext');
  if (keepNext) {
    formatting.keepNext = parseBooleanElement(keepNext);
  }

  const keepLines = findChild(pPr, 'w', 'keepLines');
  if (keepLines) {
    formatting.keepLines = parseBooleanElement(keepLines);
  }

  const widowControl = findChild(pPr, 'w', 'widowControl');
  if (widowControl) {
    formatting.widowControl = parseBooleanElement(widowControl);
  }

  const pageBreakBefore = findChild(pPr, 'w', 'pageBreakBefore');
  if (pageBreakBefore) {
    formatting.pageBreakBefore = parseBooleanElement(pageBreakBefore);
  }

  const contextualSpacing = findChild(pPr, 'w', 'contextualSpacing');
  if (contextualSpacing) {
    formatting.contextualSpacing = parseBooleanElement(contextualSpacing);
  }

  // === Numbering Properties (List Info) ===
  const numPr = findChild(pPr, 'w', 'numPr');
  if (numPr) {
    const numIdEl = findChild(numPr, 'w', 'numId');
    const ilvlEl = findChild(numPr, 'w', 'ilvl');

    if (numIdEl || ilvlEl) {
      formatting.numPr = {};

      if (numIdEl) {
        const val = parseNumericAttribute(numIdEl, 'w', 'val');
        if (val !== undefined) formatting.numPr.numId = val;
      }

      if (ilvlEl) {
        const val = parseNumericAttribute(ilvlEl, 'w', 'val');
        if (val !== undefined) formatting.numPr.ilvl = val;
      }
    }
  }

  // === Outline Level ===
  const outlineLvl = findChild(pPr, 'w', 'outlineLvl');
  if (outlineLvl) {
    const val = parseNumericAttribute(outlineLvl, 'w', 'val');
    if (val !== undefined) formatting.outlineLevel = val;
  }

  // === Style Reference ===
  const pStyle = findChild(pPr, 'w', 'pStyle');
  if (pStyle) {
    const val = getAttribute(pStyle, 'w', 'val');
    if (val) formatting.styleId = val;
  }

  // === Frame Properties ===
  const framePr = findChild(pPr, 'w', 'framePr');
  if (framePr) {
    formatting.frame = parseFrameProperties(framePr);
  }

  // === Suppress Line Numbers ===
  const suppressLineNumbers = findChild(pPr, 'w', 'suppressLineNumbers');
  if (suppressLineNumbers) {
    formatting.suppressLineNumbers = parseBooleanElement(suppressLineNumbers);
  }

  // === Suppress Auto Hyphens ===
  const suppressAutoHyphens = findChild(pPr, 'w', 'suppressAutoHyphens');
  if (suppressAutoHyphens) {
    formatting.suppressAutoHyphens = parseBooleanElement(suppressAutoHyphens);
  }

  // === Default Run Properties ===
  const rPr = findChild(pPr, 'w', 'rPr');
  if (rPr) {
    formatting.runProperties = parseRunProperties(rPr, theme, styles);
  }

  return Object.keys(formatting).length > 0 ? formatting : undefined;
}
