/**
 * Table Parser - Parse tables with full OOXML structure
 *
 * OOXML tables consist of:
 * - w:tbl - Table element
 * - w:tblPr - Table properties (width, borders, style)
 * - w:tblGrid - Column width definitions
 * - w:tr - Table rows
 * - w:trPr - Row properties (height, header)
 * - w:tc - Table cells
 * - w:tcPr - Cell properties (width, borders, merge)
 *
 * Cell merging:
 * - Horizontal: w:gridSpan (how many grid columns this cell spans)
 * - Vertical: w:vMerge (restart = start of merge, continue = continuation)
 *
 * OOXML Reference:
 * - w:tbl contains w:tblPr, w:tblGrid, and w:tr elements
 * - w:tr contains w:trPr and w:tc elements
 * - w:tc contains w:tcPr and content (paragraphs, tables)
 *
 * Composite parsers (parseTable, parseTableRow, parseTableCell, plus the
 * three property parsers and their tracked-change variants) live here.
 * Leaf property parsers (measurements, borders, margins, shading, look,
 * floating) are in ./tableParser/properties.ts. Query helpers (counts, merge
 * checks, text extraction) are in ./tableParser/queries.ts.
 */

import type {
  Table,
  TableRow,
  TableCell,
  TableFormatting,
  TableRowFormatting,
  TableCellFormatting,
  TablePropertyChange,
  TableRowPropertyChange,
  TableCellPropertyChange,
  TableStructuralChangeInfo,
  ConditionalFormatStyle,
  Paragraph,
  Theme,
  RelationshipMap,
  MediaFile,
} from '../types/document';
import type { StyleMap } from './styleParser';
import type { NumberingMap } from './numberingParser';
import { parseParagraph } from './paragraphParser';
import {
  findChild,
  findChildren,
  getAttribute,
  parseNumericAttribute,
  parseBooleanElement,
  type XmlElement,
} from './xmlParser';

import {
  parseWidth,
  parseTableBorders,
  parseCellMargins,
  parseShading,
  parseTableLook,
  parseFloatingTableProperties,
  parseTrackedChangeInfo,
  parsePropertyChangeInfo,
} from './tableParser/properties';

// Public re-exports (preserve historical import surface).
export {
  parseTableMeasurement,
  parseBorderSpec,
  parseTableBorders,
  parseCellMargins,
  parseShading,
  parseTableLook,
  parseFloatingTableProperties,
} from './tableParser/properties';
export {
  getTableColumnCount,
  getTableRowCount,
  isCellMergeContinuation,
  isCellMergeStart,
  isCellHorizontallyMerged,
  getTableText,
  hasHeaderRow,
  getHeaderRows,
  isFloatingTable,
} from './tableParser/queries';

// ============================================================================
// TABLE PROPERTIES PARSING (w:tblPr)
// ============================================================================

/**
 * Parse table properties (w:tblPr)
 *
 * @param tblPrElement - The w:tblPr element
 * @returns Parsed table formatting
 */
export function parseTableProperties(tblPrElement: XmlElement | null): TableFormatting | undefined {
  if (!tblPrElement) return undefined;

  const formatting: TableFormatting = {};

  // Table width (w:tblW)
  const width = parseWidth(findChild(tblPrElement, 'w', 'tblW'));
  if (width) formatting.width = width;

  // Table justification (w:jc)
  const jcElement = findChild(tblPrElement, 'w', 'jc');
  if (jcElement) {
    const jcVal = getAttribute(jcElement, 'w', 'val');
    if (jcVal === 'left' || jcVal === 'center' || jcVal === 'right' || jcVal === 'start') {
      formatting.justification = jcVal === 'start' ? 'left' : jcVal;
    }
  }

  // Cell spacing (w:tblCellSpacing)
  const cellSpacing = parseWidth(findChild(tblPrElement, 'w', 'tblCellSpacing'));
  if (cellSpacing) formatting.cellSpacing = cellSpacing;

  // Table indent (w:tblInd)
  const indent = parseWidth(findChild(tblPrElement, 'w', 'tblInd'));
  if (indent) formatting.indent = indent;

  // Table borders (w:tblBorders)
  const borders = parseTableBorders(findChild(tblPrElement, 'w', 'tblBorders'));
  if (borders) formatting.borders = borders;

  // Default cell margins (w:tblCellMar)
  const cellMargins = parseCellMargins(findChild(tblPrElement, 'w', 'tblCellMar'));
  if (cellMargins) formatting.cellMargins = cellMargins;

  // Table layout (w:tblLayout)
  const layoutElement = findChild(tblPrElement, 'w', 'tblLayout');
  if (layoutElement) {
    const layoutVal = getAttribute(layoutElement, 'w', 'type');
    if (layoutVal === 'fixed' || layoutVal === 'autofit') {
      formatting.layout = layoutVal;
    }
  }

  // Table style (w:tblStyle)
  const styleElement = findChild(tblPrElement, 'w', 'tblStyle');
  if (styleElement) {
    const styleId = getAttribute(styleElement, 'w', 'val');
    if (styleId) formatting.styleId = styleId;
  }

  // Table look (w:tblLook)
  const look = parseTableLook(findChild(tblPrElement, 'w', 'tblLook'));
  if (look) formatting.look = look;

  // Shading (w:shd)
  const shading = parseShading(findChild(tblPrElement, 'w', 'shd'));
  if (shading) formatting.shading = shading;

  // Table overlap (w:tblOverlap)
  const overlapElement = findChild(tblPrElement, 'w', 'tblOverlap');
  if (overlapElement) {
    const overlapVal = getAttribute(overlapElement, 'w', 'val');
    if (overlapVal === 'never' || overlapVal === 'overlap') {
      formatting.overlap = overlapVal;
    }
  }

  // Floating table (w:tblpPr)
  const floating = parseFloatingTableProperties(findChild(tblPrElement, 'w', 'tblpPr'));
  if (floating) formatting.floating = floating;

  // Bidirectional (w:bidiVisual)
  const bidi = parseBooleanElement(findChild(tblPrElement, 'w', 'bidiVisual'));
  if (bidi) formatting.bidi = true;

  if (Object.keys(formatting).length === 0) return undefined;

  return formatting;
}

function parseTablePropertyChanges(
  tblPrElement: XmlElement | null,
  currentFormatting: TableFormatting | undefined
): TablePropertyChange[] | undefined {
  if (!tblPrElement) return undefined;

  const changes = findChildren(tblPrElement, 'w', 'tblPrChange')
    .map((changeElement): TablePropertyChange => {
      const previousTblPr = findChild(changeElement, 'w', 'tblPr');
      return {
        type: 'tablePropertyChange',
        info: parsePropertyChangeInfo(changeElement),
        previousFormatting: parseTableProperties(previousTblPr),
        currentFormatting,
      };
    })
    .filter((change) => change.previousFormatting || change.currentFormatting);

  return changes.length > 0 ? changes : undefined;
}

function parseTableRowPropertyChanges(
  trPrElement: XmlElement | null,
  currentFormatting: TableRowFormatting | undefined
): TableRowPropertyChange[] | undefined {
  if (!trPrElement) return undefined;

  const changes = findChildren(trPrElement, 'w', 'trPrChange')
    .map((changeElement): TableRowPropertyChange => {
      const previousTrPr = findChild(changeElement, 'w', 'trPr');
      return {
        type: 'tableRowPropertyChange',
        info: parsePropertyChangeInfo(changeElement),
        previousFormatting: parseTableRowProperties(previousTrPr),
        currentFormatting,
      };
    })
    .filter((change) => change.previousFormatting || change.currentFormatting);

  return changes.length > 0 ? changes : undefined;
}

function parseTableCellPropertyChanges(
  tcPrElement: XmlElement | null,
  currentFormatting: TableCellFormatting | undefined
): TableCellPropertyChange[] | undefined {
  if (!tcPrElement) return undefined;

  const changes = findChildren(tcPrElement, 'w', 'tcPrChange')
    .map((changeElement): TableCellPropertyChange => {
      const previousTcPr = findChild(changeElement, 'w', 'tcPr');
      return {
        type: 'tableCellPropertyChange',
        info: parsePropertyChangeInfo(changeElement),
        previousFormatting: parseTableCellProperties(previousTcPr),
        currentFormatting,
      };
    })
    .filter((change) => change.previousFormatting || change.currentFormatting);

  return changes.length > 0 ? changes : undefined;
}

function parseTableRowStructuralChange(
  trPrElement: XmlElement | null
): TableStructuralChangeInfo | undefined {
  if (!trPrElement) return undefined;

  const insertion = findChild(trPrElement, 'w', 'ins');
  if (insertion) {
    return {
      type: 'tableRowInsertion',
      info: parseTrackedChangeInfo(insertion),
    };
  }

  const deletion = findChild(trPrElement, 'w', 'del');
  if (deletion) {
    return {
      type: 'tableRowDeletion',
      info: parseTrackedChangeInfo(deletion),
    };
  }

  return undefined;
}

function parseTableCellStructuralChange(
  tcPrElement: XmlElement | null
): TableStructuralChangeInfo | undefined {
  if (!tcPrElement) return undefined;

  const insertion = findChild(tcPrElement, 'w', 'cellIns');
  if (insertion) {
    return {
      type: 'tableCellInsertion',
      info: parseTrackedChangeInfo(insertion),
    };
  }

  const deletion = findChild(tcPrElement, 'w', 'cellDel');
  if (deletion) {
    return {
      type: 'tableCellDeletion',
      info: parseTrackedChangeInfo(deletion),
    };
  }

  const merge = findChild(tcPrElement, 'w', 'cellMerge');
  if (merge) {
    const vMergeRaw = getAttribute(merge, 'w', 'vMerge');
    const vMergeOrigRaw = getAttribute(merge, 'w', 'vMergeOrig');
    const isValid = (v: string | null): v is 'rest' | 'cont' => v === 'rest' || v === 'cont';
    return {
      type: 'tableCellMerge',
      info: parseTrackedChangeInfo(merge),
      ...(isValid(vMergeRaw) ? { vMerge: vMergeRaw } : {}),
      ...(isValid(vMergeOrigRaw) ? { vMergeOrig: vMergeOrigRaw } : {}),
    };
  }

  return undefined;
}

// ============================================================================
// TABLE ROW PROPERTIES PARSING (w:trPr)
// ============================================================================

/**
 * Parse table row properties (w:trPr)
 *
 * @param trPrElement - The w:trPr element
 * @returns Parsed row formatting
 */
export function parseTableRowProperties(
  trPrElement: XmlElement | null
): TableRowFormatting | undefined {
  if (!trPrElement) return undefined;

  const formatting: TableRowFormatting = {};

  // Row height (w:trHeight)
  // Note: w:trHeight uses w:val (not w:w) for the height value in twips.
  const heightElement = findChild(trPrElement, 'w', 'trHeight');
  if (heightElement) {
    const heightVal = parseNumericAttribute(heightElement, 'w', 'val');
    if (heightVal !== undefined && heightVal > 0) {
      formatting.height = { value: heightVal, type: 'dxa' as const };
    }

    const hRule = getAttribute(heightElement, 'w', 'hRule');
    if (hRule === 'auto' || hRule === 'atLeast' || hRule === 'exact') {
      formatting.heightRule = hRule;
    }
  }

  // Header row (w:tblHeader)
  const header = parseBooleanElement(findChild(trPrElement, 'w', 'tblHeader'));
  if (header) formatting.header = true;

  // Can't split (w:cantSplit)
  const cantSplit = parseBooleanElement(findChild(trPrElement, 'w', 'cantSplit'));
  if (cantSplit) formatting.cantSplit = true;

  // Row justification (w:jc)
  const jcElement = findChild(trPrElement, 'w', 'jc');
  if (jcElement) {
    const jcVal = getAttribute(jcElement, 'w', 'val');
    if (jcVal === 'left' || jcVal === 'center' || jcVal === 'right') {
      formatting.justification = jcVal;
    }
  }

  // Hidden row (w:hidden)
  const hidden = parseBooleanElement(findChild(trPrElement, 'w', 'hidden'));
  if (hidden) formatting.hidden = true;

  // Conditional format style (w:cnfStyle)
  const conditionalFormat = parseConditionalFormatStyle(findChild(trPrElement, 'w', 'cnfStyle'));
  if (conditionalFormat) formatting.conditionalFormat = conditionalFormat;

  if (Object.keys(formatting).length === 0) return undefined;

  return formatting;
}

// ============================================================================
// TABLE CELL PROPERTIES PARSING (w:tcPr)
// ============================================================================

/**
 * Parse conditional format style (for table style conditional formatting)
 *
 * @param cnfElement - The w:cnfStyle element
 * @returns Parsed conditional format or undefined
 */
export function parseConditionalFormatStyle(
  cnfElement: XmlElement | null
): ConditionalFormatStyle | undefined {
  if (!cnfElement) return undefined;

  const style: ConditionalFormatStyle = {};

  // Parse individual flags
  const firstRow = getAttribute(cnfElement, 'w', 'firstRow');
  if (firstRow === '1' || firstRow === 'true') style.firstRow = true;

  const lastRow = getAttribute(cnfElement, 'w', 'lastRow');
  if (lastRow === '1' || lastRow === 'true') style.lastRow = true;

  const firstColumn = getAttribute(cnfElement, 'w', 'firstColumn');
  if (firstColumn === '1' || firstColumn === 'true') style.firstColumn = true;

  const lastColumn = getAttribute(cnfElement, 'w', 'lastColumn');
  if (lastColumn === '1' || lastColumn === 'true') style.lastColumn = true;

  const oddHBand = getAttribute(cnfElement, 'w', 'oddHBand');
  if (oddHBand === '1' || oddHBand === 'true') style.oddHBand = true;

  const evenHBand = getAttribute(cnfElement, 'w', 'evenHBand');
  if (evenHBand === '1' || evenHBand === 'true') style.evenHBand = true;

  const oddVBand = getAttribute(cnfElement, 'w', 'oddVBand');
  if (oddVBand === '1' || oddVBand === 'true') style.oddVBand = true;

  const evenVBand = getAttribute(cnfElement, 'w', 'evenVBand');
  if (evenVBand === '1' || evenVBand === 'true') style.evenVBand = true;

  // Corner cells
  const nwCell = getAttribute(cnfElement, 'w', 'firstRowFirstColumn');
  if (nwCell === '1' || nwCell === 'true') style.nwCell = true;

  const neCell = getAttribute(cnfElement, 'w', 'firstRowLastColumn');
  if (neCell === '1' || neCell === 'true') style.neCell = true;

  const swCell = getAttribute(cnfElement, 'w', 'lastRowFirstColumn');
  if (swCell === '1' || swCell === 'true') style.swCell = true;

  const seCell = getAttribute(cnfElement, 'w', 'lastRowLastColumn');
  if (seCell === '1' || seCell === 'true') style.seCell = true;

  // Also check for the val attribute (binary flags string)
  const val = getAttribute(cnfElement, 'w', 'val');
  if (val && val.length === 12) {
    // Binary string format: XXXXXXXXXXXXXX
    // Position meanings from left to right
    if (val[0] === '1') style.firstRow = true;
    if (val[1] === '1') style.lastRow = true;
    if (val[2] === '1') style.firstColumn = true;
    if (val[3] === '1') style.lastColumn = true;
    if (val[4] === '1') style.oddVBand = true;
    if (val[5] === '1') style.evenVBand = true;
    if (val[6] === '1') style.oddHBand = true;
    if (val[7] === '1') style.evenHBand = true;
    if (val[8] === '1') style.nwCell = true;
    if (val[9] === '1') style.neCell = true;
    if (val[10] === '1') style.swCell = true;
    if (val[11] === '1') style.seCell = true;
  }

  if (Object.keys(style).length === 0) return undefined;

  return style;
}

/**
 * Parse table cell properties (w:tcPr)
 *
 * @param tcPrElement - The w:tcPr element
 * @returns Parsed cell formatting
 */
export function parseTableCellProperties(
  tcPrElement: XmlElement | null
): TableCellFormatting | undefined {
  if (!tcPrElement) return undefined;

  const formatting: TableCellFormatting = {};

  // Cell width (w:tcW)
  const width = parseWidth(findChild(tcPrElement, 'w', 'tcW'));
  if (width) formatting.width = width;

  // Cell borders (w:tcBorders)
  const borders = parseTableBorders(findChild(tcPrElement, 'w', 'tcBorders'));
  if (borders) formatting.borders = borders;

  // Cell margins (w:tcMar)
  const margins = parseCellMargins(findChild(tcPrElement, 'w', 'tcMar'));
  if (margins) formatting.margins = margins;

  // Shading (w:shd)
  const shading = parseShading(findChild(tcPrElement, 'w', 'shd'));
  if (shading) formatting.shading = shading;

  // Vertical alignment (w:vAlign)
  const vAlignElement = findChild(tcPrElement, 'w', 'vAlign');
  if (vAlignElement) {
    const vAlign = getAttribute(vAlignElement, 'w', 'val');
    if (vAlign === 'top' || vAlign === 'center' || vAlign === 'bottom') {
      formatting.verticalAlign = vAlign;
    }
  }

  // Text direction (w:textDirection)
  const textDirElement = findChild(tcPrElement, 'w', 'textDirection');
  if (textDirElement) {
    const textDir = getAttribute(textDirElement, 'w', 'val');
    if (textDir) {
      formatting.textDirection = textDir as TableCellFormatting['textDirection'];
    }
  }

  // Grid span (horizontal merge) (w:gridSpan)
  const gridSpanElement = findChild(tcPrElement, 'w', 'gridSpan');
  if (gridSpanElement) {
    const gridSpan = parseNumericAttribute(gridSpanElement, 'w', 'val');
    if (gridSpan !== undefined && gridSpan > 1) {
      formatting.gridSpan = gridSpan;
    }
  }

  // Vertical merge (w:vMerge)
  const vMergeElement = findChild(tcPrElement, 'w', 'vMerge');
  if (vMergeElement) {
    const vMergeVal = getAttribute(vMergeElement, 'w', 'val');
    if (vMergeVal === 'restart') {
      formatting.vMerge = 'restart';
    } else {
      // No val attribute or val="continue" means continuation
      formatting.vMerge = 'continue';
    }
  }

  // Fit text (w:tcFitText)
  const fitText = parseBooleanElement(findChild(tcPrElement, 'w', 'tcFitText'));
  if (fitText) formatting.fitText = true;

  // No wrap (w:noWrap)
  const noWrap = parseBooleanElement(findChild(tcPrElement, 'w', 'noWrap'));
  if (noWrap) formatting.noWrap = true;

  // Hide mark (w:hideMark)
  const hideMark = parseBooleanElement(findChild(tcPrElement, 'w', 'hideMark'));
  if (hideMark) formatting.hideMark = true;

  // Conditional format style (w:cnfStyle)
  const conditionalFormat = parseConditionalFormatStyle(findChild(tcPrElement, 'w', 'cnfStyle'));
  if (conditionalFormat) formatting.conditionalFormat = conditionalFormat;

  if (Object.keys(formatting).length === 0) return undefined;

  return formatting;
}

// ============================================================================
// CELL CONTENT PARSING
// ============================================================================

/**
 * Parse table cell content (paragraphs, nested tables)
 *
 * @param tcElement - The w:tc element
 * @param styles - Style definitions
 * @param theme - Theme for color/font resolution
 * @param numbering - Numbering definitions for lists
 * @param rels - Relationships for hyperlinks
 * @param media - Media files for images
 * @returns Array of content blocks
 */
function parseCellContent(
  tcElement: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  numbering: NumberingMap | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null,
  options?: { inHeaderFooter?: boolean }
): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = [];

  // Get all child elements
  const elements = tcElement.elements || [];

  for (const child of elements) {
    if (!child.name) continue;

    const localName = child.name.split(':').pop();

    if (localName === 'p') {
      // Parse paragraph
      const para = parseParagraph(child, styles, theme, numbering, rels, media, options);
      content.push(para);
    } else if (localName === 'tbl') {
      // Parse nested table (recursive)
      const table = parseTable(child, styles, theme, numbering, rels, media, options);
      content.push(table);
    }
    // Other content types in cells are rare but could be added
  }

  // Ensure at least one empty paragraph (Word requires this)
  if (content.length === 0) {
    content.push({
      type: 'paragraph',
      content: [],
    });
  }

  return content;
}

// ============================================================================
// TABLE CELL PARSING
// ============================================================================

/**
 * Parse a table cell (w:tc)
 *
 * @param tcElement - The w:tc element
 * @param styles - Style definitions
 * @param theme - Theme for color/font resolution
 * @param numbering - Numbering definitions for lists
 * @param rels - Relationships for hyperlinks
 * @param media - Media files for images
 * @returns Parsed table cell
 */
export function parseTableCell(
  tcElement: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  numbering: NumberingMap | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null,
  options?: { inHeaderFooter?: boolean }
): TableCell {
  const cell: TableCell = {
    type: 'tableCell',
    content: [],
  };

  // Parse cell properties (w:tcPr)
  const tcPrElement = findChild(tcElement, 'w', 'tcPr');
  const formatting = parseTableCellProperties(tcPrElement);
  if (formatting) {
    cell.formatting = formatting;
  }
  cell.propertyChanges = parseTableCellPropertyChanges(tcPrElement, formatting);
  cell.structuralChange = parseTableCellStructuralChange(tcPrElement);

  // Parse content
  cell.content = parseCellContent(tcElement, styles, theme, numbering, rels, media, options);

  return cell;
}

// ============================================================================
// TABLE ROW PARSING
// ============================================================================

/**
 * Parse a table row (w:tr)
 *
 * @param trElement - The w:tr element
 * @param styles - Style definitions
 * @param theme - Theme for color/font resolution
 * @param numbering - Numbering definitions for lists
 * @param rels - Relationships for hyperlinks
 * @param media - Media files for images
 * @returns Parsed table row
 */
export function parseTableRow(
  trElement: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  numbering: NumberingMap | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null,
  options?: { inHeaderFooter?: boolean }
): TableRow {
  const row: TableRow = {
    type: 'tableRow',
    cells: [],
  };

  // Parse row properties (w:trPr)
  const trPrElement = findChild(trElement, 'w', 'trPr');
  const formatting = parseTableRowProperties(trPrElement);
  if (formatting) {
    row.formatting = formatting;
  }
  row.propertyChanges = parseTableRowPropertyChanges(trPrElement, formatting);
  row.structuralChange = parseTableRowStructuralChange(trPrElement);

  // Parse cells
  const cells = findChildren(trElement, 'w', 'tc');
  for (const cellElement of cells) {
    const cell = parseTableCell(cellElement, styles, theme, numbering, rels, media, options);
    row.cells.push(cell);
  }

  return row;
}

// ============================================================================
// TABLE GRID PARSING
// ============================================================================

/**
 * Parse table grid (w:tblGrid) for column widths
 *
 * @param tblGridElement - The w:tblGrid element
 * @returns Array of column widths in twips
 */
export function parseTableGrid(tblGridElement: XmlElement | null): number[] | undefined {
  if (!tblGridElement) return undefined;

  const widths: number[] = [];

  const gridCols = findChildren(tblGridElement, 'w', 'gridCol');
  for (const col of gridCols) {
    const width = parseNumericAttribute(col, 'w', 'w') ?? 0;
    widths.push(width);
  }

  if (widths.length > 0 && widths.every((width) => width <= 0)) {
    return undefined;
  }

  return widths.length > 0 ? widths : undefined;
}

function getRowGridSpan(row: TableRow): number {
  return row.cells.reduce((sum, cell) => sum + (cell.formatting?.gridSpan ?? 1), 0);
}

function inferImplicitSingleCellRowSpans(table: Table): void {
  const maxColumns = Math.max(
    table.columnWidths?.length ?? 0,
    ...table.rows.map((row) => getRowGridSpan(row))
  );
  if (maxColumns <= 1) return;

  for (const row of table.rows) {
    if (row.cells.length !== 1) continue;

    const cell = row.cells[0];
    const currentSpan = cell.formatting?.gridSpan ?? 1;
    if (currentSpan >= maxColumns) continue;

    // Don't expand a vertically-merged cell — its width comes from the cell
    // above and the spec already determines the grid layout. Likewise skip
    // any cell that already declared a gridSpan, even if the parser stored
    // 1 as undefined: the rule below only fires when there is no other
    // information about the row's intended span.
    if (cell.formatting?.vMerge) continue;
    if (cell.formatting?.gridSpan != null) continue;

    cell.formatting = {
      ...(cell.formatting ?? {}),
      gridSpan: maxColumns,
    };
  }
}

// ============================================================================
// MAIN TABLE PARSING
// ============================================================================

/**
 * Parse a table element (w:tbl)
 *
 * @param tblElement - The w:tbl element
 * @param styles - Style definitions
 * @param theme - Theme for color/font resolution
 * @param numbering - Numbering definitions for lists
 * @param rels - Relationships for hyperlinks
 * @param media - Media files for images
 * @returns Parsed table
 */
export function parseTable(
  tblElement: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  numbering: NumberingMap | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null,
  options?: { inHeaderFooter?: boolean }
): Table {
  const table: Table = {
    type: 'table',
    rows: [],
  };

  // Parse table properties (w:tblPr)
  const tblPrElement = findChild(tblElement, 'w', 'tblPr');
  const formatting = parseTableProperties(tblPrElement);
  if (formatting) {
    table.formatting = formatting;
  }
  table.propertyChanges = parseTablePropertyChanges(tblPrElement, formatting);

  // Parse table grid (w:tblGrid)
  const columnWidths = parseTableGrid(findChild(tblElement, 'w', 'tblGrid'));
  if (columnWidths) {
    table.columnWidths = columnWidths;
  }

  // Parse rows
  const rows = findChildren(tblElement, 'w', 'tr');
  for (const rowElement of rows) {
    const row = parseTableRow(rowElement, styles, theme, numbering, rels, media, options);
    table.rows.push(row);
  }

  inferImplicitSingleCellRowSpans(table);

  return table;
}
