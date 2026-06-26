/**
 * Style-side table property parsers.
 *
 * Parse the w:tblPr / w:trPr / w:tcPr that appear *inside* `<w:style>`
 * definitions in styles.xml. Mirrors the document-side parsers in
 * `../tableParser.ts` — the two paths feed different cascades and the
 * duplication is intentional.
 */

import type {
  Theme,
  TableFormatting,
  TableRowFormatting,
  TableCellFormatting,
  CellMargins,
  TableLook,
  TableMeasurement,
} from '../../types/document';
import {
  findChild,
  getAttribute,
  parseBooleanElement,
  parseNumericAttribute,
  type XmlElement,
} from '../xmlParser';
import { parseShadingProperties } from './runProperties';
import { parseTableBorders } from '../borderParser';

/**
 * Parse table measurement (width/height with type)
 */
function parseTableMeasurement(element: XmlElement | null): TableMeasurement | undefined {
  if (!element) return undefined;

  const w = parseNumericAttribute(element, 'w', 'w');
  const type = getAttribute(element, 'w', 'type');

  if (w !== undefined && type) {
    return {
      value: w,
      type: type as TableMeasurement['type'],
    };
  }

  return undefined;
}

/**
 * Parse cell margins
 */
function parseCellMargins(tblCellMar: XmlElement | null): CellMargins | undefined {
  if (!tblCellMar) return undefined;

  const margins: CellMargins = {};

  const top = parseTableMeasurement(findChild(tblCellMar, 'w', 'top'));
  if (top) margins.top = top;

  const bottom = parseTableMeasurement(findChild(tblCellMar, 'w', 'bottom'));
  if (bottom) margins.bottom = bottom;

  const left = parseTableMeasurement(findChild(tblCellMar, 'w', 'left'));
  if (left) margins.left = left;

  const right = parseTableMeasurement(findChild(tblCellMar, 'w', 'right'));
  if (right) margins.right = right;

  return Object.keys(margins).length > 0 ? margins : undefined;
}

/**
 * Parse table look flags
 */
function parseTableLook(tblLook: XmlElement | null): TableLook | undefined {
  if (!tblLook) return undefined;

  const look: TableLook = {};

  // Can be specified as individual attributes or a single val attribute
  const val = getAttribute(tblLook, 'w', 'val');
  if (val) {
    // val is a hex bitmap: bit 0=firstRow, 1=lastRow, 2=firstCol, 3=lastCol, 4=noHBand, 5=noVBand
    const num = parseInt(val, 16);
    if (!isNaN(num)) {
      look.firstRow = (num & 0x0020) !== 0;
      look.lastRow = (num & 0x0040) !== 0;
      look.firstColumn = (num & 0x0080) !== 0;
      look.lastColumn = (num & 0x0100) !== 0;
      look.noHBand = (num & 0x0200) !== 0;
      look.noVBand = (num & 0x0400) !== 0;
    }
  }

  // Individual attributes override
  const firstColumn = getAttribute(tblLook, 'w', 'firstColumn');
  if (firstColumn) look.firstColumn = firstColumn === '1';

  const firstRow = getAttribute(tblLook, 'w', 'firstRow');
  if (firstRow) look.firstRow = firstRow === '1';

  const lastColumn = getAttribute(tblLook, 'w', 'lastColumn');
  if (lastColumn) look.lastColumn = lastColumn === '1';

  const lastRow = getAttribute(tblLook, 'w', 'lastRow');
  if (lastRow) look.lastRow = lastRow === '1';

  const noHBand = getAttribute(tblLook, 'w', 'noHBand');
  if (noHBand) look.noHBand = noHBand === '1';

  const noVBand = getAttribute(tblLook, 'w', 'noVBand');
  if (noVBand) look.noVBand = noVBand === '1';

  return Object.keys(look).length > 0 ? look : undefined;
}

/**
 * Parse table formatting properties (w:tblPr)
 */
export function parseTableProperties(
  tblPr: XmlElement | null,
  _theme: Theme | null
): TableFormatting | undefined {
  if (!tblPr) return undefined;

  const formatting: TableFormatting = {};

  // Table width
  const tblW = findChild(tblPr, 'w', 'tblW');
  if (tblW) {
    formatting.width = parseTableMeasurement(tblW);
  }

  // Table alignment/justification
  const jc = findChild(tblPr, 'w', 'jc');
  if (jc) {
    const val = getAttribute(jc, 'w', 'val');
    if (val === 'left' || val === 'center' || val === 'right') {
      formatting.justification = val;
    }
  }

  // Cell spacing
  const tblCellSpacing = findChild(tblPr, 'w', 'tblCellSpacing');
  if (tblCellSpacing) {
    formatting.cellSpacing = parseTableMeasurement(tblCellSpacing);
  }

  // Table indent
  const tblInd = findChild(tblPr, 'w', 'tblInd');
  if (tblInd) {
    formatting.indent = parseTableMeasurement(tblInd);
  }

  // Table borders
  const tblBorders = findChild(tblPr, 'w', 'tblBorders');
  if (tblBorders) {
    formatting.borders = parseTableBorders(tblBorders);
  }

  // Cell margins
  const tblCellMar = findChild(tblPr, 'w', 'tblCellMar');
  if (tblCellMar) {
    formatting.cellMargins = parseCellMargins(tblCellMar);
  }

  // Table layout
  const tblLayout = findChild(tblPr, 'w', 'tblLayout');
  if (tblLayout) {
    const val = getAttribute(tblLayout, 'w', 'type');
    if (val === 'fixed' || val === 'autofit') {
      formatting.layout = val;
    }
  }

  // Table style
  const tblStyle = findChild(tblPr, 'w', 'tblStyle');
  if (tblStyle) {
    const val = getAttribute(tblStyle, 'w', 'val');
    if (val) formatting.styleId = val;
  }

  // Table look
  const tblLook = findChild(tblPr, 'w', 'tblLook');
  if (tblLook) {
    formatting.look = parseTableLook(tblLook);
  }

  // Shading
  const shd = findChild(tblPr, 'w', 'shd');
  if (shd) {
    formatting.shading = parseShadingProperties(shd);
  }

  // Bidi
  const bidiVisual = findChild(tblPr, 'w', 'bidiVisual');
  if (bidiVisual) formatting.bidi = parseBooleanElement(bidiVisual);

  return Object.keys(formatting).length > 0 ? formatting : undefined;
}

/**
 * Parse table row formatting properties (w:trPr)
 */
export function parseTableRowProperties(trPr: XmlElement | null): TableRowFormatting | undefined {
  if (!trPr) return undefined;

  const formatting: TableRowFormatting = {};

  // Row height
  const trHeight = findChild(trPr, 'w', 'trHeight');
  if (trHeight) {
    formatting.height = parseTableMeasurement(trHeight);
    const hRule = getAttribute(trHeight, 'w', 'hRule');
    if (hRule) {
      formatting.heightRule = hRule as TableRowFormatting['heightRule'];
    }
  }

  // Header row
  const tblHeader = findChild(trPr, 'w', 'tblHeader');
  if (tblHeader) formatting.header = parseBooleanElement(tblHeader);

  // Can't split
  const cantSplit = findChild(trPr, 'w', 'cantSplit');
  if (cantSplit) formatting.cantSplit = parseBooleanElement(cantSplit);

  // Row justification
  const jc = findChild(trPr, 'w', 'jc');
  if (jc) {
    const val = getAttribute(jc, 'w', 'val');
    if (val === 'left' || val === 'center' || val === 'right') {
      formatting.justification = val;
    }
  }

  // Hidden
  const hidden = findChild(trPr, 'w', 'hidden');
  if (hidden) formatting.hidden = parseBooleanElement(hidden);

  return Object.keys(formatting).length > 0 ? formatting : undefined;
}

/**
 * Parse table cell formatting properties (w:tcPr)
 */
export function parseTableCellProperties(
  tcPr: XmlElement | null,
  _theme: Theme | null
): TableCellFormatting | undefined {
  if (!tcPr) return undefined;

  const formatting: TableCellFormatting = {};

  // Cell width
  const tcW = findChild(tcPr, 'w', 'tcW');
  if (tcW) {
    formatting.width = parseTableMeasurement(tcW);
  }

  // Cell borders
  const tcBorders = findChild(tcPr, 'w', 'tcBorders');
  if (tcBorders) {
    formatting.borders = parseTableBorders(tcBorders);
  }

  // Cell margins
  const tcMar = findChild(tcPr, 'w', 'tcMar');
  if (tcMar) {
    formatting.margins = parseCellMargins(tcMar);
  }

  // Shading
  const shd = findChild(tcPr, 'w', 'shd');
  if (shd) {
    formatting.shading = parseShadingProperties(shd);
  }

  // Vertical alignment
  const vAlign = findChild(tcPr, 'w', 'vAlign');
  if (vAlign) {
    const val = getAttribute(vAlign, 'w', 'val');
    if (val === 'top' || val === 'center' || val === 'bottom') {
      formatting.verticalAlign = val;
    }
  }

  // Text direction
  const textDirection = findChild(tcPr, 'w', 'textDirection');
  if (textDirection) {
    const val = getAttribute(textDirection, 'w', 'val');
    if (val) formatting.textDirection = val as TableCellFormatting['textDirection'];
  }

  // Grid span (horizontal merge)
  const gridSpan = findChild(tcPr, 'w', 'gridSpan');
  if (gridSpan) {
    const val = parseNumericAttribute(gridSpan, 'w', 'val');
    if (val !== undefined) formatting.gridSpan = val;
  }

  // Vertical merge
  const vMerge = findChild(tcPr, 'w', 'vMerge');
  if (vMerge) {
    const val = getAttribute(vMerge, 'w', 'val');
    formatting.vMerge = val === 'restart' ? 'restart' : 'continue';
  }

  // Fit text
  const tcFitText = findChild(tcPr, 'w', 'tcFitText');
  if (tcFitText) formatting.fitText = parseBooleanElement(tcFitText);

  // No wrap
  const noWrap = findChild(tcPr, 'w', 'noWrap');
  if (noWrap) formatting.noWrap = parseBooleanElement(noWrap);

  // Hide mark
  const hideMark = findChild(tcPr, 'w', 'hideMark');
  if (hideMark) formatting.hideMark = parseBooleanElement(hideMark);

  return Object.keys(formatting).length > 0 ? formatting : undefined;
}
