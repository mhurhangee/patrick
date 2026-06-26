/**
 * Document Table → PM table node (Document → ProseMirror direction).
 *
 * Owns the table conversion family: row-span calculation from vMerge,
 * the conditional-format cascade (wholeTable → first/last row → first/last
 * col → bands → corners), per-cell border/margin/shading resolution, and
 * default-table-style inheritance for borders+cellMargins. The cell content
 * walker recurses into `convertParagraph` from ./paragraph.ts and into
 * `convertTable` itself for nested tables.
 */

import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../../schema';
import type {
  Table,
  TableRow,
  TableCell,
  TableCellFormatting,
  TableBorders,
  TableLook,
  TextFormatting,
  Theme,
} from '../../../types/document';
import type { TableAttrs, TableRowAttrs, TableCellAttrs } from '../../schema/nodes';
import { resolveColorToHex } from '../../../utils/colorResolver';
import { mergeTextFormatting } from '../../../utils/textFormattingMerge';
import type { StyleResolver } from '../../styles';
import { resolveTextFormatting } from './marks';
import { convertParagraph } from './paragraph';
import { registerTableConverter } from '../tableConverterRegistry';

/**
 * Resolve table style conditional formatting
 */
function resolveTableStyleConditional(
  styleResolver: StyleResolver | null,
  tableStyleId: string | undefined,
  conditionType: string
): { tcPr?: TableCellFormatting; rPr?: TextFormatting } | undefined {
  if (!styleResolver || !tableStyleId) return undefined;

  const style = styleResolver.getStyle(tableStyleId);
  if (!style?.tblStylePr) return undefined;

  const conditional = style.tblStylePr.find((p) => p.type === conditionType);
  if (!conditional) return undefined;

  const runPropsFromPpr = resolveTextFormatting(conditional.pPr?.runProperties, styleResolver);
  const resolvedRpr = resolveTextFormatting(conditional.rPr, styleResolver);
  const mergedRunProps = mergeTextFormatting(runPropsFromPpr, resolvedRpr);

  return {
    tcPr: conditional.tcPr,
    rPr: mergedRunProps,
  };
}

function mergeConditionalStyles(
  base?: { tcPr?: TableCellFormatting; rPr?: TextFormatting },
  override?: { tcPr?: TableCellFormatting; rPr?: TextFormatting }
): { tcPr?: TableCellFormatting; rPr?: TextFormatting } | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;

  const merged: { tcPr?: TableCellFormatting; rPr?: TextFormatting } = {};

  const baseTcPr = base.tcPr;
  const overrideTcPr = override.tcPr;
  if (baseTcPr || overrideTcPr) {
    const tcPr: TableCellFormatting = {
      ...(baseTcPr ?? {}),
      ...(overrideTcPr ?? {}),
    };

    if (baseTcPr?.borders || overrideTcPr?.borders) {
      tcPr.borders = {
        ...(baseTcPr?.borders ?? {}),
        ...(overrideTcPr?.borders ?? {}),
      };
    }

    if (baseTcPr?.shading || overrideTcPr?.shading) {
      tcPr.shading = {
        ...(baseTcPr?.shading ?? {}),
        ...(overrideTcPr?.shading ?? {}),
      };
    }

    if (baseTcPr?.margins || overrideTcPr?.margins) {
      tcPr.margins = {
        ...(baseTcPr?.margins ?? {}),
        ...(overrideTcPr?.margins ?? {}),
      };
    }

    merged.tcPr = tcPr;
  }

  merged.rPr = mergeTextFormatting(base.rPr, override.rPr);

  return merged;
}

/**
 * Calculate rowSpan values from vMerge attributes.
 * OOXML uses vMerge="restart" to start a vertical merge and vMerge="continue" for cells that should be merged.
 * This function converts that to rowSpan values and marks which cells should be skipped.
 */
type RowSpanInfo = { rowSpan: number; skip: boolean };

function calculateRowSpans(table: Table): Map<string, RowSpanInfo> {
  const result = new Map<string, RowSpanInfo>();
  const numRows = table.rows.length;

  // Track active vertical merges per column (stores the row index where merge started)
  const activeMerges = new Map<number, number>();

  // Process each row
  for (let rowIndex = 0; rowIndex < numRows; rowIndex++) {
    const row = table.rows[rowIndex];
    let colIndex = 0;
    const rowCells = row.cells.map((cell) => {
      const colspan = cell.formatting?.gridSpan ?? 1;
      const startCol = colIndex;
      colIndex += colspan;
      return {
        colIndex: startCol,
        vMerge: cell.formatting?.vMerge,
        key: `${rowIndex}-${startCol}`,
      };
    });

    const rowWouldBeEmpty =
      rowCells.length > 0 &&
      rowCells.every(
        ({ colIndex: cellColIndex, vMerge }) =>
          vMerge === 'continue' && activeMerges.has(cellColIndex)
      );

    if (rowWouldBeEmpty) {
      // PM tableRow content is `(tableCell | tableHeader)+`. A DOCX row fully
      // covered by vMerge continuations cannot be represented as an empty row,
      // so render those continuation cells as standalone cells and stop the
      // active merge before it overlaps this row.
      for (const { colIndex: cellColIndex, key } of rowCells) {
        activeMerges.delete(cellColIndex);
        result.set(key, { rowSpan: 1, skip: false });
      }
      continue;
    }

    for (const { colIndex: cellColIndex, vMerge, key } of rowCells) {
      const colIndex = cellColIndex;

      if (vMerge === 'restart') {
        // Start of a new vertical merge
        activeMerges.set(colIndex, rowIndex);
        result.set(key, { rowSpan: 1, skip: false });
      } else if (vMerge === 'continue') {
        const startRow = activeMerges.get(colIndex);
        if (startRow !== undefined) {
          // Continuation of a merge - this cell should be skipped
          // Increment rowSpan of the starting cell
          const startKey = `${startRow}-${colIndex}`;
          const startCell = result.get(startKey);
          if (startCell) {
            startCell.rowSpan++;
          }
          result.set(key, { rowSpan: 1, skip: true });
        } else {
          // An orphan continuation has no owning restart cell to span from.
          result.set(key, { rowSpan: 1, skip: false });
        }
      } else {
        // No vMerge - clear any active merge for this column
        activeMerges.delete(colIndex);
        result.set(key, { rowSpan: 1, skip: false });
      }
    }
  }

  return result;
}

export function convertTable(
  table: Table,
  styleResolver: StyleResolver | null,
  theme?: Theme | null
): PMNode {
  // Calculate rowSpan values from vMerge
  const rowSpanMap = calculateRowSpans(table);

  // Get column widths from table grid
  const columnWidths = table.columnWidths;

  // Calculate total width from columnWidths if available (for percentage calculation)
  const totalWidth = columnWidths?.reduce((sum, w) => sum + w, 0) ?? 0;

  // Get the table style's conditional formatting
  const tableStyleId = table.formatting?.styleId;
  const look = table.formatting?.look;

  // Resolve table borders via the OOXML cascade (§17.4.41 + §17.7.4.18):
  //   1. inline w:tblBorders on the table
  //   2. table style's tblPr.borders (basedOn chain already flattened)
  //   3. default table style's tblPr.borders (the style marked w:default="1")
  // Pre-PR, when no tblStyle was set we hardcoded a lookup of styleId
  // "TableGrid" — fragile for non-Word generators (which may not ship that
  // style) and incorrect for docs whose default table style differs from
  // TableGrid. Walking through the parsed default flag matches spec and
  // works for any document language ("Normal Table", "TableNormal", etc.).
  const tableStyle = tableStyleId ? styleResolver?.getStyle(tableStyleId) : undefined;
  const defaultTableStyle = styleResolver?.getDefaultTableStyle();
  const resolvedTableBorders =
    table.formatting?.borders ?? tableStyle?.tblPr?.borders ?? defaultTableStyle?.tblPr?.borders;

  // Resolve default cell margins via the same cascade as borders. Tables
  // that don't carry a tblStyle reference still inherit cellMargins from the
  // default table style per §17.4.41 + §17.7.4.18; pre-PR such tables had
  // no cellMargins at all and the layout-bridge fell back to a hardcoded
  // 7 px. `defaultTableStyle` is shared with the borders cascade above.
  const tableCellMargins =
    table.formatting?.cellMargins ??
    tableStyle?.tblPr?.cellMargins ??
    defaultTableStyle?.tblPr?.cellMargins ??
    undefined;
  const cellMarginsAttr = tableCellMargins
    ? {
        top: tableCellMargins.top?.value,
        bottom: tableCellMargins.bottom?.value,
        left: tableCellMargins.left?.value,
        right: tableCellMargins.right?.value,
      }
    : undefined;

  const attrs: TableAttrs = {
    styleId: table.formatting?.styleId,
    width: table.formatting?.width?.value,
    widthType: table.formatting?.width?.type,
    justification: table.formatting?.justification,
    columnWidths: columnWidths,
    tableLayout: table.formatting?.layout ?? null,
    floating: table.formatting?.floating,
    cellMargins: cellMarginsAttr,
    look: table.formatting?.look,
    bidi: table.formatting?.bidi || undefined,
    _originalFormatting: table.formatting || undefined,
  };
  // Table-property change history (`<w:tblPrChange>`).
  if (table.propertyChanges && table.propertyChanges.length > 0) {
    attrs.tblPrChange = table.propertyChanges;
  }

  const conditionalStyles = {
    wholeTable: resolveTableStyleConditional(styleResolver, tableStyleId, 'wholeTable'),
    firstRow: resolveTableStyleConditional(styleResolver, tableStyleId, 'firstRow'),
    lastRow: resolveTableStyleConditional(styleResolver, tableStyleId, 'lastRow'),
    firstCol: resolveTableStyleConditional(styleResolver, tableStyleId, 'firstCol'),
    lastCol: resolveTableStyleConditional(styleResolver, tableStyleId, 'lastCol'),
    band1Horz: resolveTableStyleConditional(styleResolver, tableStyleId, 'band1Horz'),
    band2Horz: resolveTableStyleConditional(styleResolver, tableStyleId, 'band2Horz'),
    band1Vert: resolveTableStyleConditional(styleResolver, tableStyleId, 'band1Vert'),
    band2Vert: resolveTableStyleConditional(styleResolver, tableStyleId, 'band2Vert'),
    nwCell: resolveTableStyleConditional(styleResolver, tableStyleId, 'nwCell'),
    neCell: resolveTableStyleConditional(styleResolver, tableStyleId, 'neCell'),
    swCell: resolveTableStyleConditional(styleResolver, tableStyleId, 'swCell'),
    seCell: resolveTableStyleConditional(styleResolver, tableStyleId, 'seCell'),
  };

  const bandingEnabledH = look?.noHBand !== true;
  const bandingEnabledV = look?.noVBand !== true;

  // Track data row index (excluding header rows) for banding
  let dataRowIndex = 0;
  const totalRows = table.rows.length;
  const totalColumns =
    columnWidths?.length ??
    Math.max(
      0,
      ...table.rows.map((row) =>
        row.cells.reduce((sum, cell) => sum + (cell.formatting?.gridSpan ?? 1), 0)
      )
    );
  const rows = table.rows.map((row, rowIndex) => {
    // Conditional formatting flag: firstRow in tblLook means "apply first-row styling"
    const isFirstRowStyled = rowIndex === 0 && !!look?.firstRow;
    const isLastRow = rowIndex === totalRows - 1 && !!look?.lastRow;

    const rowBandStyle =
      bandingEnabledH && !isFirstRowStyled && !isLastRow
        ? dataRowIndex % 2 === 0
          ? conditionalStyles.band1Horz
          : conditionalStyles.band2Horz
        : undefined;
    if (bandingEnabledH && !isFirstRowStyled && !isLastRow) {
      dataRowIndex++;
    }

    return convertTableRow(
      row,
      styleResolver,
      isFirstRowStyled,
      columnWidths,
      totalWidth,
      conditionalStyles,
      rowBandStyle,
      bandingEnabledV,
      look,
      resolvedTableBorders, // Pass resolved table borders (own or from style)
      rowIndex,
      totalRows,
      totalColumns,
      rowSpanMap,
      cellMarginsAttr,
      theme
    );
  });

  return schema.node('table', attrs, rows);
}

/**
 * Convert a TableRow to a ProseMirror table row node
 */
function convertTableRow(
  row: TableRow,
  styleResolver: StyleResolver | null,
  isHeaderRow: boolean,
  columnWidths?: number[],
  totalWidth?: number,
  conditionalStyles?: {
    wholeTable?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    firstRow?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    lastRow?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    firstCol?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    lastCol?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    band1Horz?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    band2Horz?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    band1Vert?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    band2Vert?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    nwCell?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    neCell?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    swCell?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
    seCell?: { tcPr?: TableCellFormatting; rPr?: TextFormatting };
  },
  rowBandStyle?: { tcPr?: TableCellFormatting; rPr?: TextFormatting },
  bandingEnabledV?: boolean,
  tableLook?: TableLook,
  tableBorders?: TableBorders,
  rowIndex?: number,
  totalRows?: number,
  totalColumns?: number,
  rowSpanMap?: Map<string, { rowSpan: number; skip: boolean }>,
  defaultCellMargins?: { top?: number; bottom?: number; left?: number; right?: number },
  theme?: Theme | null
): PMNode {
  const attrs: TableRowAttrs = {
    height: row.formatting?.height?.value,
    heightRule: row.formatting?.heightRule,
    // isHeader controls header row REPETITION on page breaks.
    // Only w:tblHeader (row.formatting.header) should trigger this — NOT tblLook/firstRow
    // which is purely a conditional formatting flag (ECMA-376 §17.7.6.1).
    isHeader: !!row.formatting?.header,
    _originalFormatting: row.formatting || undefined,
  };
  // Tracked row structural change — pull `trIns` / `trDel` from the model's
  // `structuralChange` field (parsed earlier from `<w:trPr><w:ins/>` /
  // `<w:del/>`). See ECMA-376 §17.13.5.
  if (row.structuralChange) {
    const sc = row.structuralChange;
    const info = {
      revisionId: sc.info.id,
      author: sc.info.author,
      date: sc.info.date ?? null,
    };
    if (sc.type === 'tableRowInsertion') attrs.trIns = info;
    else if (sc.type === 'tableRowDeletion') attrs.trDel = info;
  }
  // Row property change history (`<w:trPrChange>`).
  if (row.propertyChanges && row.propertyChanges.length > 0) {
    attrs.trPrChange = row.propertyChanges;
  }

  const numCells = row.cells.length;
  const isFirstRow = rowIndex === 0;
  const isLastRow = rowIndex === (totalRows ?? 1) - 1;
  const rowCnf = row.formatting?.conditionalFormat;
  const rowIsFirstRow = rowCnf?.firstRow ?? isFirstRow;
  const rowIsLastRow = rowCnf?.lastRow ?? isLastRow;
  const totalCols = totalColumns ?? numCells;

  // Track column index for mapping to columnWidths (accounting for colspan)
  let colIndex = 0;
  const cells: PMNode[] = [];

  for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex++) {
    const cell = row.cells[cellIndex];
    const colspan = cell.formatting?.gridSpan ?? 1;

    // Check if this cell should be skipped (it's a vMerge continue cell)
    const rowSpanKey = `${rowIndex ?? 0}-${colIndex}`;
    const rowSpanInfo = rowSpanMap?.get(rowSpanKey);
    const shouldSkip = rowSpanInfo?.skip ?? false;
    const calculatedRowSpan = rowSpanInfo?.rowSpan ?? 1;

    // Calculate the width for this cell from columnWidths if cell doesn't have own width
    let gridWidth: number | undefined;
    if (columnWidths && totalWidth && totalWidth > 0) {
      // Sum widths for all columns this cell spans
      let cellWidthTwips = 0;
      for (let i = 0; i < colspan && colIndex + i < columnWidths.length; i++) {
        cellWidthTwips += columnWidths[colIndex + i];
      }
      // Convert to percentage of total table width
      gridWidth = Math.round((cellWidthTwips / totalWidth) * 100);
    }
    colIndex += colspan;

    // Skip cells that are part of a vertical merge (vMerge="continue")
    if (shouldSkip) {
      continue;
    }

    // Determine cell position for table border application
    const isFirstCol = colIndex - colspan === 0;
    const isLastCol = colIndex === totalCols;
    const cellCnf = cell.formatting?.conditionalFormat;
    const cellIsFirstRow = cellCnf?.firstRow ?? rowIsFirstRow;
    const cellIsLastRow = cellCnf?.lastRow ?? rowIsLastRow;
    const cellIsFirstCol = cellCnf?.firstColumn ?? isFirstCol;
    const cellIsLastCol = cellCnf?.lastColumn ?? isLastCol;

    // Determine vertical banding style based on column index
    let vertBandStyle: { tcPr?: TableCellFormatting; rPr?: TextFormatting } | undefined;
    if (bandingEnabledV) {
      const firstColOffset = tableLook?.firstColumn ? 1 : 0;
      const bandColIndex = colIndex - colspan - firstColOffset;
      const isEligible =
        bandColIndex >= 0 &&
        !(tableLook?.lastColumn && cellIsLastCol) &&
        !(tableLook?.firstColumn && cellIsFirstCol);
      if (isEligible) {
        vertBandStyle =
          bandColIndex % 2 === 0 ? conditionalStyles?.band1Vert : conditionalStyles?.band2Vert;
      }
    }

    if (cellCnf?.oddVBand) {
      vertBandStyle = conditionalStyles?.band1Vert;
    } else if (cellCnf?.evenVBand) {
      vertBandStyle = conditionalStyles?.band2Vert;
    }

    let effectiveRowBandStyle = rowBandStyle;
    if (rowCnf?.oddHBand) {
      effectiveRowBandStyle = conditionalStyles?.band1Horz;
    } else if (rowCnf?.evenHBand) {
      effectiveRowBandStyle = conditionalStyles?.band2Horz;
    }
    if (cellCnf?.oddHBand) {
      effectiveRowBandStyle = conditionalStyles?.band1Horz;
    } else if (cellCnf?.evenHBand) {
      effectiveRowBandStyle = conditionalStyles?.band2Horz;
    }

    // Build conditional style precedence (wholeTable -> banding -> row/col -> corners)
    let cellConditionalStyle = conditionalStyles?.wholeTable;
    cellConditionalStyle = mergeConditionalStyles(cellConditionalStyle, effectiveRowBandStyle);
    cellConditionalStyle = mergeConditionalStyles(cellConditionalStyle, vertBandStyle);
    if (cellIsFirstRow && (tableLook?.firstRow || rowCnf?.firstRow || cellCnf?.firstRow)) {
      cellConditionalStyle = mergeConditionalStyles(
        cellConditionalStyle,
        conditionalStyles?.firstRow
      );
    }
    if (cellIsLastRow && (tableLook?.lastRow || rowCnf?.lastRow || cellCnf?.lastRow)) {
      cellConditionalStyle = mergeConditionalStyles(
        cellConditionalStyle,
        conditionalStyles?.lastRow
      );
    }
    if (cellIsFirstCol && (tableLook?.firstColumn || rowCnf?.firstColumn || cellCnf?.firstColumn)) {
      cellConditionalStyle = mergeConditionalStyles(
        cellConditionalStyle,
        conditionalStyles?.firstCol
      );
    }
    if (cellIsLastCol && (tableLook?.lastColumn || rowCnf?.lastColumn || cellCnf?.lastColumn)) {
      cellConditionalStyle = mergeConditionalStyles(
        cellConditionalStyle,
        conditionalStyles?.lastCol
      );
    }
    if (
      cellIsFirstRow &&
      cellIsFirstCol &&
      (tableLook?.firstRow || rowCnf?.firstRow || cellCnf?.firstRow) &&
      (tableLook?.firstColumn || rowCnf?.firstColumn || cellCnf?.firstColumn)
    ) {
      cellConditionalStyle = mergeConditionalStyles(
        cellConditionalStyle,
        conditionalStyles?.nwCell
      );
    }
    if (
      cellIsFirstRow &&
      cellIsLastCol &&
      (tableLook?.firstRow || rowCnf?.firstRow || cellCnf?.firstRow) &&
      (tableLook?.lastColumn || rowCnf?.lastColumn || cellCnf?.lastColumn)
    ) {
      cellConditionalStyle = mergeConditionalStyles(
        cellConditionalStyle,
        conditionalStyles?.neCell
      );
    }
    if (
      cellIsLastRow &&
      cellIsFirstCol &&
      (tableLook?.lastRow || rowCnf?.lastRow || cellCnf?.lastRow) &&
      (tableLook?.firstColumn || rowCnf?.firstColumn || cellCnf?.firstColumn)
    ) {
      cellConditionalStyle = mergeConditionalStyles(
        cellConditionalStyle,
        conditionalStyles?.swCell
      );
    }
    if (
      cellIsLastRow &&
      cellIsLastCol &&
      (tableLook?.lastRow || rowCnf?.lastRow || cellCnf?.lastRow) &&
      (tableLook?.lastColumn || rowCnf?.lastColumn || cellCnf?.lastColumn)
    ) {
      cellConditionalStyle = mergeConditionalStyles(
        cellConditionalStyle,
        conditionalStyles?.seCell
      );
    }

    cells.push(
      convertTableCell(
        cell,
        styleResolver,
        isHeaderRow,
        gridWidth,
        cellConditionalStyle,
        tableBorders,
        isFirstRow,
        isLastRow,
        isFirstCol,
        isLastCol,
        calculatedRowSpan,
        defaultCellMargins,
        theme
      )
    );
  }

  if (cells.length === 0) {
    const fallbackColspan = Math.max(totalCols, 1);
    const fallbackCell: TableCell = {
      type: 'tableCell',
      formatting: fallbackColspan > 1 ? { gridSpan: fallbackColspan } : undefined,
      content: [{ type: 'paragraph', content: [] }],
    };
    const fallbackConditionalStyle = mergeConditionalStyles(
      conditionalStyles?.wholeTable,
      rowBandStyle
    );

    cells.push(
      convertTableCell(
        fallbackCell,
        styleResolver,
        isHeaderRow,
        totalWidth && totalWidth > 0 ? 100 : undefined,
        fallbackConditionalStyle,
        tableBorders,
        isFirstRow,
        isLastRow,
        true,
        true,
        1,
        defaultCellMargins,
        theme
      )
    );
  }

  return schema.node('tableRow', attrs, cells);
}

const CELL_BORDER_SIDES = ['top', 'bottom', 'left', 'right', 'insideH', 'insideV'] as const;

/**
 * Bake themed border colors to RGB up front: the cell schema's `toDOM` has no
 * theme access, so a `themeColor` border would otherwise hit the default Office
 * palette there. Mirrors how cell shading resolves into `backgroundColor`.
 * `auto`, plain-RGB, and unresolvable-themed colors pass through unchanged
 * (`resolveColor` defaults the last case downstream).
 */
function resolveBorderColors(
  borders: TableBorders | undefined,
  theme: Theme | null | undefined
): TableBorders | undefined {
  if (!borders) return borders;
  let resolved: TableBorders | undefined;
  for (const side of CELL_BORDER_SIDES) {
    const border = borders[side];
    if (!border?.color?.themeColor || border.color.auto) continue;
    const hex = resolveColorToHex(border.color, theme);
    if (!hex) continue;
    resolved ??= { ...borders };
    resolved[side] = { ...border, color: { rgb: hex } };
  }
  return resolved ?? borders;
}

/**
 * Convert a TableCell to a ProseMirror table cell node
 */
function convertTableCell(
  cell: TableCell,
  styleResolver: StyleResolver | null,
  isHeader: boolean,
  gridWidthPercent?: number,
  conditionalStyle?: { tcPr?: TableCellFormatting; rPr?: TextFormatting },
  tableBorders?: TableBorders,
  isFirstRow?: boolean,
  isLastRow?: boolean,
  isFirstCol?: boolean,
  isLastCol?: boolean,
  calculatedRowSpan?: number,
  defaultCellMargins?: { top?: number; bottom?: number; left?: number; right?: number },
  theme?: Theme | null
): PMNode {
  const formatting = cell.formatting;

  // Use the pre-calculated rowSpan from vMerge analysis
  const rowspan = calculatedRowSpan ?? 1;

  // Determine width: prefer cell's own width, fall back to grid width.
  // Non-positive values fall through; resolveTableWidthPx maps them to undefined.
  let width = formatting?.width?.value;
  let widthType = formatting?.width?.type;

  // If cell doesn't have its own width, use the grid-calculated percentage
  if (width === undefined && gridWidthPercent !== undefined) {
    width = gridWidthPercent;
    widthType = 'pct';
  }

  // Cell's own shading wins; fall back to the table style's conditional row/col shading.
  const backgroundColor = resolveColorToHex(
    formatting?.shading?.fill ?? conditionalStyle?.tcPr?.shading?.fill,
    theme
  );

  // Convert borders — preserve full BorderSpec per side
  // Priority: cell borders > conditional style borders > table borders
  const baseBorders = tableBorders
    ? {
        top: isFirstRow ? tableBorders.top : tableBorders.insideH,
        bottom: isLastRow ? tableBorders.bottom : tableBorders.insideH,
        left: isFirstCol ? tableBorders.left : tableBorders.insideV,
        right: isLastCol ? tableBorders.right : tableBorders.insideV,
      }
    : undefined;

  const conditionalBorders = conditionalStyle?.tcPr?.borders;
  const cellBorders = formatting?.borders;

  const borders = resolveBorderColors(
    baseBorders || conditionalBorders || cellBorders
      ? {
          ...(baseBorders ?? {}),
          ...(conditionalBorders ?? {}),
          ...(cellBorders ?? {}),
        }
      : undefined,
    theme
  );

  const attrs: TableCellAttrs = {
    colspan: formatting?.gridSpan ?? 1,
    rowspan: rowspan,
    width: width,
    widthType: widthType,
    verticalAlign: formatting?.verticalAlign,
    backgroundColor: backgroundColor,
    textDirection: formatting?.textDirection,
    noWrap: formatting?.noWrap,
    borders: borders,
    margins: formatting?.margins
      ? {
          top: formatting.margins.top?.value,
          bottom: formatting.margins.bottom?.value,
          left: formatting.margins.left?.value,
          right: formatting.margins.right?.value,
        }
      : conditionalStyle?.tcPr?.margins
        ? {
            top: conditionalStyle.tcPr.margins.top?.value,
            bottom: conditionalStyle.tcPr.margins.bottom?.value,
            left: conditionalStyle.tcPr.margins.left?.value,
            right: conditionalStyle.tcPr.margins.right?.value,
          }
        : defaultCellMargins,
    _originalFormatting: formatting || undefined,
    _originalResolvedFill: backgroundColor,
  };

  // Tracked cell structural marker (cellIns / cellDel / cellMerge). Pulled
  // from the model's `structuralChange` (set by tableParser from
  // `<w:tcPr>/<w:cellIns>` etc.). NOTE: `<w:cellMerge>` carries `vMerge`
  // and `vMergeOrig`, NOT `w:val` (wml.xsd CT_CellMergeTrackChange) — but
  // the current model only stores info, so vMerge value isn't yet
  // preserved on the model side. Plumb id/author/date for now; vMerge
  // round-trip will need a model extension.
  if (cell.structuralChange) {
    const sc = cell.structuralChange;
    const info = {
      revisionId: sc.info.id,
      author: sc.info.author,
      date: sc.info.date ?? null,
    };
    if (sc.type === 'tableCellInsertion') {
      attrs.cellMarker = { kind: 'ins', info };
    } else if (sc.type === 'tableCellDeletion') {
      attrs.cellMarker = { kind: 'del', info };
    } else if (sc.type === 'tableCellMerge') {
      // Preserve the source `w:vMerge` / `w:vMergeOrig` value when present
      // (parser reads them off `<w:cellMerge>`). If missing (e.g. legacy
      // model with no vMerge), default to `"cont"` — matches Word's most
      // common tracked-merge case ("this cell got merged INTO the one
      // above"), per ECMA-376 §17.13.5.6.
      attrs.cellMarker = {
        kind: 'merge',
        info,
        vMerge: sc.vMerge ?? 'cont',
        ...(sc.vMergeOrig ? { vMergeOrig: sc.vMergeOrig } : {}),
      };
    }
  }
  // Cell-property change history.
  if (cell.propertyChanges && cell.propertyChanges.length > 0) {
    attrs.tcPrChange = cell.propertyChanges;
  }

  // Convert cell content (paragraphs and nested tables)
  const contentNodes: PMNode[] = [];
  for (const content of cell.content) {
    if (content.type === 'paragraph') {
      contentNodes.push(convertParagraph(content, styleResolver, undefined, conditionalStyle?.rPr));
    } else if (content.type === 'table') {
      // Nested tables - recursively convert
      contentNodes.push(convertTable(content, styleResolver));
    }
  }

  // Ensure cell has at least one paragraph
  if (contentNodes.length === 0) {
    contentNodes.push(schema.node('paragraph', {}, []));
  }

  // Use tableHeader for header cells, tableCell otherwise
  const nodeType = isHeader ? 'tableHeader' : 'tableCell';
  return schema.node(nodeType, attrs, contentNodes);
}

// Publish the canonical converter so the table-insert command (extensions
// layer) can reuse it without a static import that would close a module cycle.
// This runs whenever the conversion layer loads — `toProseDoc` does so on
// every editor mount. See ./tableConverterRegistry for the rationale.
registerTableConverter(convertTable);
