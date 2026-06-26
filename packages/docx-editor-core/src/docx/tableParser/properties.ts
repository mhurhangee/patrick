/**
 * Table Atom-level Property Parsers
 *
 * Parsers for the small, leaf-style table property elements:
 * - measurements (w:tblW, w:tcW, w:trHeight twip values + width type)
 * - borders (w:tblBorders, w:tcBorders, individual side specs)
 * - cell margins (w:tblCellMar, w:tcMar)
 * - shading (w:shd background + theme tint/shade)
 * - table look flags (w:tblLook firstRow/lastRow/etc.)
 * - floating table positioning (w:tblpPr anchors + offsets)
 *
 * These are leaf parsers — they don't recurse into rows/cells. The composite
 * row/cell/table parsers (in `../tableParser.ts`) compose these.
 */

import type {
  TableMeasurement,
  TableWidthType,
  TableLook,
  CellMargins,
  FloatingTableProperties,
  ShadingProperties,
  ColorValue,
  TableStructuralChangeInfo,
  TablePropertyChange,
  TableRowPropertyChange,
  TableCellPropertyChange,
} from '../../types/document';
import { findChild, getAttribute, parseNumericAttribute, type XmlElement } from '../xmlParser';

// ============================================================================
// TABLE MEASUREMENT PARSING
// ============================================================================

/**
 * Parse a table measurement (width, height, etc.)
 *
 * @param element - Element with w:w and w:type attributes
 * @returns Parsed measurement or undefined
 */
export function parseTableMeasurement(element: XmlElement | null): TableMeasurement | undefined {
  if (!element) return undefined;

  const value = parseNumericAttribute(element, 'w', 'w') ?? 0;
  const typeStr = getAttribute(element, 'w', 'type') ?? 'dxa';

  let type: TableWidthType = 'dxa';
  if (typeStr === 'auto' || typeStr === 'dxa' || typeStr === 'nil' || typeStr === 'pct') {
    type = typeStr;
  }

  return { value, type };
}

/**
 * Parse width from an element (shorthand for common case)
 */
export function parseWidth(element: XmlElement | null): TableMeasurement | undefined {
  return parseTableMeasurement(element);
}

export function parseTrackedChangeInfo(node: XmlElement): TableStructuralChangeInfo['info'] {
  const rawId = getAttribute(node, 'w', 'id');
  const parsedId = rawId ? parseInt(rawId, 10) : 0;
  const author = (getAttribute(node, 'w', 'author') ?? '').trim();
  const date = (getAttribute(node, 'w', 'date') ?? '').trim();

  return {
    id: Number.isInteger(parsedId) && parsedId >= 0 ? parsedId : 0,
    author: author.length > 0 ? author : 'Unknown',
    date: date.length > 0 ? date : undefined,
  };
}

export function parsePropertyChangeInfo(
  node: XmlElement
): TablePropertyChange['info'] | TableRowPropertyChange['info'] | TableCellPropertyChange['info'] {
  // CT_TblPrChange / CT_TrPrChange / CT_TcPrChange all extend CT_TrackChange
  // (wml.xsd:803) which has no `w:rsid` attribute. Earlier code parsed it
  // into the in-memory model, but it was never schema-valid on the wire and
  // is now dropped at both serializer paths (paragraphSerializer.ts,
  // tableSerializer.ts, runSerializer.ts). Stop parsing for consistency.
  return parseTrackedChangeInfo(node);
}

// ============================================================================
// BORDER PARSING
// ============================================================================

// Border parsing is shared across the table/paragraph/section/style parsers.
// Re-exported here so existing import sites stay stable.
export { parseBorderSpec, parseTableBorders } from '../borderParser';

// ============================================================================
// CELL MARGINS PARSING
// ============================================================================

/**
 * Parse cell margins (w:tblCellMar or w:tcMar)
 *
 * @param marginsElement - The margins container element
 * @returns Parsed margins or undefined
 */
export function parseCellMargins(marginsElement: XmlElement | null): CellMargins | undefined {
  if (!marginsElement) return undefined;

  const margins: CellMargins = {};

  const top = parseWidth(findChild(marginsElement, 'w', 'top'));
  if (top) margins.top = top;

  const bottom = parseWidth(findChild(marginsElement, 'w', 'bottom'));
  if (bottom) margins.bottom = bottom;

  const left = parseWidth(
    findChild(marginsElement, 'w', 'left') ?? findChild(marginsElement, 'w', 'start')
  );
  if (left) margins.left = left;

  const right = parseWidth(
    findChild(marginsElement, 'w', 'right') ?? findChild(marginsElement, 'w', 'end')
  );
  if (right) margins.right = right;

  if (Object.keys(margins).length === 0) return undefined;

  return margins;
}

// ============================================================================
// SHADING PARSING
// ============================================================================

/**
 * Parse shading properties (w:shd)
 *
 * @param shdElement - The w:shd element
 * @returns Parsed shading or undefined
 */
export function parseShading(shdElement: XmlElement | null): ShadingProperties | undefined {
  if (!shdElement) return undefined;

  const shading: ShadingProperties = {};

  // Fill color (background)
  const fillStr = getAttribute(shdElement, 'w', 'fill');
  if (fillStr && fillStr !== 'auto') {
    shading.fill = { rgb: fillStr };
  }

  // Theme fill
  const themeFill = getAttribute(shdElement, 'w', 'themeFill');
  if (themeFill) {
    shading.fill = { themeColor: themeFill as ColorValue['themeColor'] };

    const themeFillTint = getAttribute(shdElement, 'w', 'themeFillTint');
    if (themeFillTint && shading.fill) {
      shading.fill.themeTint = themeFillTint;
    }

    const themeFillShade = getAttribute(shdElement, 'w', 'themeFillShade');
    if (themeFillShade && shading.fill) {
      shading.fill.themeShade = themeFillShade;
    }
  }

  // Pattern color
  const colorStr = getAttribute(shdElement, 'w', 'color');
  if (colorStr && colorStr !== 'auto') {
    shading.color = { rgb: colorStr };
  }

  // Pattern value
  const pattern = getAttribute(shdElement, 'w', 'val');
  if (pattern) {
    shading.pattern = pattern as ShadingProperties['pattern'];
  }

  if (Object.keys(shading).length === 0) return undefined;

  return shading;
}

// ============================================================================
// TABLE LOOK PARSING
// ============================================================================

/**
 * Parse table look flags (w:tblLook)
 *
 * @param lookElement - The w:tblLook element
 * @returns Parsed table look or undefined
 */
export function parseTableLook(lookElement: XmlElement | null): TableLook | undefined {
  if (!lookElement) return undefined;

  const look: TableLook = {};

  // Parse individual flags
  const firstRow = getAttribute(lookElement, 'w', 'firstRow');
  if (firstRow === '1' || firstRow === 'true') look.firstRow = true;

  const lastRow = getAttribute(lookElement, 'w', 'lastRow');
  if (lastRow === '1' || lastRow === 'true') look.lastRow = true;

  const firstColumn = getAttribute(lookElement, 'w', 'firstColumn');
  if (firstColumn === '1' || firstColumn === 'true') look.firstColumn = true;

  const lastColumn = getAttribute(lookElement, 'w', 'lastColumn');
  if (lastColumn === '1' || lastColumn === 'true') look.lastColumn = true;

  const noHBand = getAttribute(lookElement, 'w', 'noHBand');
  if (noHBand === '1' || noHBand === 'true') look.noHBand = true;

  const noVBand = getAttribute(lookElement, 'w', 'noVBand');
  if (noVBand === '1' || noVBand === 'true') look.noVBand = true;

  // Also check for the val attribute (hexadecimal flags)
  const val = getAttribute(lookElement, 'w', 'val');
  if (val) {
    const flags = parseInt(val, 16);
    if (!isNaN(flags)) {
      if (flags & 0x0020) look.firstRow = true;
      if (flags & 0x0040) look.lastRow = true;
      if (flags & 0x0080) look.firstColumn = true;
      if (flags & 0x0100) look.lastColumn = true;
      if (flags & 0x0200) look.noHBand = true;
      if (flags & 0x0400) look.noVBand = true;
    }
  }

  if (Object.keys(look).length === 0) return undefined;

  return look;
}

// ============================================================================
// FLOATING TABLE PROPERTIES
// ============================================================================

/**
 * Parse floating table properties (w:tblpPr)
 *
 * @param tblpPrElement - The w:tblpPr element
 * @returns Parsed floating properties or undefined
 */
export function parseFloatingTableProperties(
  tblpPrElement: XmlElement | null
): FloatingTableProperties | undefined {
  if (!tblpPrElement) return undefined;

  const floating: FloatingTableProperties = {};

  // Horizontal anchor
  const horzAnchor = getAttribute(tblpPrElement, 'w', 'horzAnchor');
  if (horzAnchor === 'margin' || horzAnchor === 'page' || horzAnchor === 'text') {
    floating.horzAnchor = horzAnchor;
  }

  // Vertical anchor
  const vertAnchor = getAttribute(tblpPrElement, 'w', 'vertAnchor');
  if (vertAnchor === 'margin' || vertAnchor === 'page' || vertAnchor === 'text') {
    floating.vertAnchor = vertAnchor;
  }

  // Horizontal position
  const tblpX = parseNumericAttribute(tblpPrElement, 'w', 'tblpX');
  if (tblpX !== undefined) floating.tblpX = tblpX;

  const tblpXSpec = getAttribute(tblpPrElement, 'w', 'tblpXSpec');
  if (tblpXSpec) {
    floating.tblpXSpec = tblpXSpec as FloatingTableProperties['tblpXSpec'];
  }

  // Vertical position
  const tblpY = parseNumericAttribute(tblpPrElement, 'w', 'tblpY');
  if (tblpY !== undefined) floating.tblpY = tblpY;

  const tblpYSpec = getAttribute(tblpPrElement, 'w', 'tblpYSpec');
  if (tblpYSpec) {
    floating.tblpYSpec = tblpYSpec as FloatingTableProperties['tblpYSpec'];
  }

  // Distance from text
  const topFromText = parseNumericAttribute(tblpPrElement, 'w', 'topFromText');
  if (topFromText !== undefined) floating.topFromText = topFromText;

  const bottomFromText = parseNumericAttribute(tblpPrElement, 'w', 'bottomFromText');
  if (bottomFromText !== undefined) floating.bottomFromText = bottomFromText;

  const leftFromText = parseNumericAttribute(tblpPrElement, 'w', 'leftFromText');
  if (leftFromText !== undefined) floating.leftFromText = leftFromText;

  const rightFromText = parseNumericAttribute(tblpPrElement, 'w', 'rightFromText');
  if (rightFromText !== undefined) floating.rightFromText = rightFromText;

  if (Object.keys(floating).length === 0) return undefined;

  return floating;
}
