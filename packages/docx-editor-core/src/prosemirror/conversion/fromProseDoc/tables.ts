/**
 * PM table → Document Table conversion.
 *
 * Walks the PM table tree, resolving row/colspan into a flat grid of cell
 * anchors so vMerge="restart"/"continue" gets emitted in the right slots
 * on save. Each `*AttrsToFormatting` helper reads `_originalFormatting`
 * first so DOCX-only properties (cellSpacing, indent, layout, conditional
 * format, vMerge, etc.) survive a round-trip even when the user only
 * touched a subset of attrs.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type {
  Table,
  TableRow,
  TableCell,
  TableFormatting,
  TableRowFormatting,
  TableCellFormatting,
  TableBorders,
  Paragraph,
} from '../../../types/document';
import type { TableAttrs, TableRowAttrs, TableCellAttrs } from '../../schema/nodes';
import { convertPMParagraph } from './paragraph';

function inferTableBorders(rows: TableRow[]): TableBorders | undefined {
  for (const row of rows) {
    for (const cell of row.cells) {
      const borders = cell.formatting?.borders;
      if (borders) {
        const base =
          borders.top ||
          borders.left ||
          borders.right ||
          borders.bottom ||
          borders.insideH ||
          borders.insideV;
        if (!base) return undefined;
        return {
          top: borders.top ?? base,
          bottom: borders.bottom ?? base,
          left: borders.left ?? base,
          right: borders.right ?? base,
          insideH: borders.insideH ?? borders.bottom ?? base,
          insideV: borders.insideV ?? borders.right ?? base,
        };
      }
    }
  }
  return undefined;
}

interface PMTableCellAnchor {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
  cell: TableCell;
}

function collectPMTableAnchors(node: PMNode): {
  anchors: PMTableCellAnchor[];
  totalCols: number;
} {
  const occupied: boolean[][] = [];
  const anchors: PMTableCellAnchor[] = [];
  let totalCols = 0;

  for (let rowIndex = 0; rowIndex < node.childCount; rowIndex++) {
    const rowNode = node.child(rowIndex);
    let colIndex = 0;

    rowNode.forEach((cellNode) => {
      if (cellNode.type.name !== 'tableCell' && cellNode.type.name !== 'tableHeader') return;

      while (occupied[rowIndex]?.[colIndex]) colIndex++;

      const rowspan = (cellNode.attrs as TableCellAttrs).rowspan || 1;
      const colspan = (cellNode.attrs as TableCellAttrs).colspan || 1;

      anchors.push({
        row: rowIndex,
        col: colIndex,
        rowspan,
        colspan,
        cell: convertPMTableCell(cellNode),
      });

      for (let r = rowIndex; r < rowIndex + rowspan; r++) {
        const rowSlots = occupied[r] ?? [];
        occupied[r] = rowSlots;
        for (let c = colIndex; c < colIndex + colspan; c++) {
          rowSlots[c] = true;
        }
      }

      colIndex += colspan;
      totalCols = Math.max(totalCols, colIndex);
    });
  }

  return { anchors, totalCols };
}

/**
 * Validate and repair `vMerge` markers column-by-column after a table has been
 * reconstructed from PM.
 *
 * A real vertical merge is a `restart` followed by one or more `continue` cells
 * in consecutive rows of the SAME grid column. Two things produce invalid
 * markers that must be cleared so we never emit malformed OOXML:
 *
 *  - A stale `restart` on a `rowspan:1` cell left behind when the user splits a
 *    merged cell (prosemirror-tables `splitCell` keeps `_originalFormatting`).
 *    These appear as a `restart` with no `continue` under it (or `restart`
 *    directly above another `restart`).
 *  - An orphan `continue` with no owning `restart` above it.
 *
 * Markers that DO form a valid run are left untouched — including the
 * `rowWouldBeEmpty` case where both the origin and continuation cells are
 * standalone `rowspan:1` nodes. Grid columns are keyed by each cell's start
 * column (cumulative `gridSpan`), which is how OOXML aligns vMerge.
 */
function normalizeVMergeRuns(rows: TableRow[]): void {
  const byColumn = new Map<number, { rowIndex: number; cell: TableCell }[]>();
  rows.forEach((row, rowIndex) => {
    let col = 0;
    for (const cell of row.cells) {
      const startCol = col;
      col += cell.formatting?.gridSpan ?? 1;
      if (cell.formatting?.vMerge) {
        const list = byColumn.get(startCol) ?? [];
        list.push({ rowIndex, cell });
        byColumn.set(startCol, list);
      }
    }
  });

  const clearMarker = (cell: TableCell): void => {
    if (!cell.formatting) return;
    delete cell.formatting.vMerge;
    if (Object.keys(cell.formatting).length === 0) cell.formatting = undefined;
  };

  for (const entries of byColumn.values()) {
    // entries are already in ascending row order.
    let runStart: TableCell | null = null;
    let runLen = 0;
    let lastRow = -1;
    const closeRun = (): void => {
      // A `restart` with no following `continue` is not a real merge.
      if (runStart && runLen < 2) clearMarker(runStart);
      runStart = null;
      runLen = 0;
    };
    for (const { rowIndex, cell } of entries) {
      const marker = cell.formatting?.vMerge;
      if (marker === 'restart') {
        closeRun();
        runStart = cell;
        runLen = 1;
        lastRow = rowIndex;
      } else if (marker === 'continue') {
        if (runStart && rowIndex === lastRow + 1) {
          runLen++;
          lastRow = rowIndex;
        } else {
          // Non-consecutive or orphan continuation — close any open run and
          // drop this stray marker.
          closeRun();
          clearMarker(cell);
        }
      }
    }
    closeRun();
  }
}

export function convertPMTable(node: PMNode): Table {
  const attrs = node.attrs as TableAttrs;
  const { anchors, totalCols } = collectPMTableAnchors(node);
  const anchorByStart = new Map<string, PMTableCellAnchor>();
  const anchorByCoveredSlot = new Map<string, PMTableCellAnchor>();

  for (const anchor of anchors) {
    anchorByStart.set(`${anchor.row}-${anchor.col}`, anchor);
    for (let row = anchor.row; row < anchor.row + anchor.rowspan; row++) {
      for (let col = anchor.col; col < anchor.col + anchor.colspan; col++) {
        anchorByCoveredSlot.set(`${row}-${col}`, anchor);
      }
    }
  }

  const rows: TableRow[] = [];
  for (let rowIndex = 0; rowIndex < node.childCount; rowIndex++) {
    const rowNode = node.child(rowIndex);
    const cells: TableCell[] = [];

    for (let colIndex = 0; colIndex < totalCols; ) {
      const anchor = anchorByStart.get(`${rowIndex}-${colIndex}`);
      if (anchor) {
        const formatting = { ...(anchor.cell.formatting ?? {}) };
        if (anchor.colspan > 1) {
          formatting.gridSpan = anchor.colspan;
        } else {
          delete formatting.gridSpan;
        }
        if (anchor.rowspan > 1) {
          formatting.vMerge = 'restart';
        } else if (formatting.vMerge !== 'restart' && formatting.vMerge !== 'continue') {
          delete formatting.vMerge;
        }
        // else: keep the `restart`/`continue` marker that came from
        // `_originalFormatting`. A vertical merge whose continuation row is
        // *fully* covered (the `rowWouldBeEmpty` path in toProseDoc/tables.ts)
        // can't be modeled with PM `rowspan`, so both the origin and the
        // continuation cells live as standalone `rowspan:1` nodes carrying the
        // markers only in `_originalFormatting`. `normalizeVMergeRuns` below
        // validates every column and clears any marker that doesn't form a real
        // `restart`+`continue` run (e.g. a stale `restart` left by the library
        // splitCell, which doesn't null `_originalFormatting`). Fixes #805.
        cells.push({
          ...anchor.cell,
          formatting: Object.keys(formatting).length ? formatting : undefined,
        });
        colIndex += anchor.colspan;
        continue;
      }

      const coveringAnchor = anchorByCoveredSlot.get(`${rowIndex}-${colIndex}`);
      if (!coveringAnchor) {
        colIndex++;
        continue;
      }

      const formatting = { ...(coveringAnchor.cell.formatting ?? {}) };
      if (coveringAnchor.colspan > 1) {
        formatting.gridSpan = coveringAnchor.colspan;
      } else {
        delete formatting.gridSpan;
      }
      formatting.vMerge = 'continue';

      cells.push({
        ...coveringAnchor.cell,
        content: [],
        formatting,
      });
      colIndex += coveringAnchor.colspan;
    }

    const rowAttrs = rowNode.attrs as TableRowAttrs;
    const tr: TableRow = {
      type: 'tableRow',
      formatting: tableRowAttrsToFormatting(rowAttrs),
      cells,
    };
    // Round-trip row-level structural revisions (`<w:trPr><w:ins/>` etc).
    if (rowAttrs.trIns) {
      tr.structuralChange = {
        type: 'tableRowInsertion',
        info: {
          id: rowAttrs.trIns.revisionId,
          author: rowAttrs.trIns.author,
          ...(rowAttrs.trIns.date ? { date: rowAttrs.trIns.date } : {}),
        },
      };
    } else if (rowAttrs.trDel) {
      tr.structuralChange = {
        type: 'tableRowDeletion',
        info: {
          id: rowAttrs.trDel.revisionId,
          author: rowAttrs.trDel.author,
          ...(rowAttrs.trDel.date ? { date: rowAttrs.trDel.date } : {}),
        },
      };
    }
    if (rowAttrs.trPrChange && rowAttrs.trPrChange.length > 0) {
      tr.propertyChanges = rowAttrs.trPrChange;
    }
    rows.push(tr);
  }

  normalizeVMergeRuns(rows);

  const formatting = tableAttrsToFormatting(attrs) || undefined;
  if (!formatting?.borders) {
    const inferredBorders = inferTableBorders(rows);
    if (inferredBorders) {
      if (formatting) {
        formatting.borders = inferredBorders;
      } else {
        // No other formatting — create a minimal formatting object with borders
        // so borders persist on round-trip.
        return {
          type: 'table',
          columnWidths: attrs.columnWidths || undefined,
          formatting: { borders: inferredBorders },
          rows,
        };
      }
    }
  }

  const result: Table = {
    type: 'table',
    columnWidths: attrs.columnWidths || undefined,
    formatting,
    rows,
  };
  if (attrs.tblPrChange && attrs.tblPrChange.length > 0) {
    result.propertyChanges = attrs.tblPrChange;
  }
  return result;
}

/**
 * Convert ProseMirror table attrs to TableFormatting
 */
function tableAttrsToFormatting(attrs: TableAttrs): TableFormatting | undefined {
  // If we have the original formatting from the DOCX, use it as a base
  // for lossless round-trip. This preserves properties like cellSpacing,
  // indent, layout, bidi, overlap, shading that aren't tracked as PM attrs.
  if (attrs._originalFormatting) {
    const orig = attrs._originalFormatting;
    const result = { ...orig };

    // Override properties that user may have changed via editor commands
    if (attrs.styleId !== (orig.styleId || undefined)) {
      result.styleId = attrs.styleId || undefined;
    }
    if (attrs.justification !== (orig.justification || undefined)) {
      result.justification = attrs.justification || undefined;
    }
    if (attrs.floating !== (orig.floating || undefined)) {
      result.floating = attrs.floating || undefined;
    }
    // Layout: a column resize switches the table to fixed layout (issue #781).
    if (attrs.tableLayout !== (orig.layout || undefined)) {
      result.layout = attrs.tableLayout || undefined;
    }
    if (attrs.look !== (orig.look || undefined)) {
      result.look = attrs.look || undefined;
    }
    if (attrs.bidi !== (orig.bidi || undefined)) {
      result.bidi = attrs.bidi || undefined;
    }
    // Width: check if changed
    const origWidthVal = orig.width?.value;
    const origWidthType = orig.width?.type;
    if (attrs.width !== origWidthVal || attrs.widthType !== origWidthType) {
      if (attrs.width != null || attrs.widthType) {
        result.width = {
          value: attrs.width ?? 0,
          type: (attrs.widthType as 'auto' | 'dxa' | 'pct' | 'nil') || 'dxa',
        };
      } else {
        result.width = undefined;
      }
    }
    // CellMargins: override if changed
    if (attrs.cellMargins) {
      result.cellMargins = {
        top:
          attrs.cellMargins.top != null
            ? { value: attrs.cellMargins.top, type: 'dxa' as const }
            : undefined,
        bottom:
          attrs.cellMargins.bottom != null
            ? { value: attrs.cellMargins.bottom, type: 'dxa' as const }
            : undefined,
        left:
          attrs.cellMargins.left != null
            ? { value: attrs.cellMargins.left, type: 'dxa' as const }
            : undefined,
        right:
          attrs.cellMargins.right != null
            ? { value: attrs.cellMargins.right, type: 'dxa' as const }
            : undefined,
      };
    }

    return result;
  }

  // Fallback: reconstruct formatting from individual attrs (e.g. for
  // newly created tables that don't have _originalFormatting)
  const hasFormatting =
    attrs.styleId ||
    attrs.width != null ||
    attrs.widthType ||
    attrs.justification ||
    attrs.tableLayout ||
    attrs.floating ||
    attrs.cellMargins ||
    attrs.look ||
    attrs.bidi;

  if (!hasFormatting) {
    return undefined;
  }

  // Convert cellMargins back to CellMargins format (twips → TableMeasurement)
  const cellMargins = attrs.cellMargins
    ? {
        top:
          attrs.cellMargins.top != null
            ? { value: attrs.cellMargins.top, type: 'dxa' as const }
            : undefined,
        bottom:
          attrs.cellMargins.bottom != null
            ? { value: attrs.cellMargins.bottom, type: 'dxa' as const }
            : undefined,
        left:
          attrs.cellMargins.left != null
            ? { value: attrs.cellMargins.left, type: 'dxa' as const }
            : undefined,
        right:
          attrs.cellMargins.right != null
            ? { value: attrs.cellMargins.right, type: 'dxa' as const }
            : undefined,
      }
    : undefined;

  // Restore width — handle width=0 with type="auto" (common OOXML pattern)
  let width: TableFormatting['width'];
  if (attrs.width != null || attrs.widthType) {
    width = {
      value: attrs.width ?? 0,
      type: (attrs.widthType as 'auto' | 'dxa' | 'pct' | 'nil') || 'dxa',
    };
  }

  return {
    styleId: attrs.styleId || undefined,
    width,
    justification: attrs.justification || undefined,
    layout: attrs.tableLayout || undefined,
    floating: attrs.floating || undefined,
    cellMargins,
    look: attrs.look || undefined,
    bidi: attrs.bidi || undefined,
  };
}

/**
 * Convert ProseMirror table row attrs to TableRowFormatting
 */
function tableRowAttrsToFormatting(attrs: TableRowAttrs): TableRowFormatting | undefined {
  // If we have the original formatting from the DOCX, use it as a base
  // for lossless round-trip. This preserves properties like cantSplit,
  // justification, hidden, conditionalFormat that aren't tracked as PM attrs.
  if (attrs._originalFormatting) {
    const orig = attrs._originalFormatting;
    const result = { ...orig };

    // Override properties that user may have changed via editor commands
    if (attrs.height !== (orig.height?.value || undefined)) {
      result.height = attrs.height ? { value: attrs.height, type: 'dxa' as const } : undefined;
    }
    if (attrs.heightRule !== (orig.heightRule || undefined)) {
      result.heightRule = (attrs.heightRule as 'auto' | 'atLeast' | 'exact') || undefined;
    }
    if (attrs.isHeader !== (orig.header || undefined)) {
      result.header = attrs.isHeader || undefined;
    }

    return result;
  }

  // Fallback: reconstruct formatting from individual attrs
  const hasFormatting = attrs.height || attrs.isHeader;

  if (!hasFormatting) {
    return undefined;
  }

  return {
    height: attrs.height
      ? {
          value: attrs.height,
          type: 'dxa',
        }
      : undefined,
    heightRule: (attrs.heightRule as 'auto' | 'atLeast' | 'exact') || undefined,
    header: attrs.isHeader || undefined,
  };
}

/**
 * Convert a ProseMirror table cell node to our TableCell type
 */
function convertPMTableCell(node: PMNode): TableCell {
  const attrs = node.attrs as TableCellAttrs;
  const content: (Paragraph | Table)[] = [];

  // Extract cell content (paragraphs and nested tables)
  node.forEach((contentNode) => {
    if (contentNode.type.name === 'paragraph') {
      content.push(convertPMParagraph(contentNode));
    } else if (contentNode.type.name === 'table') {
      content.push(convertPMTable(contentNode));
    }
  });

  const cell: TableCell = {
    type: 'tableCell',
    formatting: tableCellAttrsToFormatting(attrs),
    content,
  };
  // Round-trip cell-level structural revisions (`<w:cellIns>`/`<w:cellDel>`
  // /`<w:cellMerge>`).
  if (attrs.cellMarker) {
    const m = attrs.cellMarker;
    const info = {
      id: m.info.revisionId,
      author: m.info.author,
      ...(m.info.date ? { date: m.info.date } : {}),
    };
    if (m.kind === 'ins') cell.structuralChange = { type: 'tableCellInsertion', info };
    else if (m.kind === 'del') cell.structuralChange = { type: 'tableCellDeletion', info };
    else {
      cell.structuralChange = {
        type: 'tableCellMerge',
        info,
        ...(m.vMerge ? { vMerge: m.vMerge } : {}),
        ...(m.vMergeOrig ? { vMergeOrig: m.vMergeOrig } : {}),
      };
    }
  }
  if (attrs.tcPrChange && attrs.tcPrChange.length > 0) {
    cell.propertyChanges = attrs.tcPrChange;
  }
  return cell;
}

/**
 * Convert ProseMirror table cell attrs to TableCellFormatting
 * Borders are stored as full BorderSpec objects — no conversion needed.
 */
function tableCellAttrsToFormatting(attrs: TableCellAttrs): TableCellFormatting | undefined {
  // If we have the original formatting from the DOCX, use it as a base
  // for lossless round-trip. This preserves properties like vMerge, fitText,
  // hideMark, conditionalFormat that aren't tracked as PM attrs.
  if (attrs._originalFormatting) {
    const orig = attrs._originalFormatting;
    const result = { ...orig };

    // Override properties that user may have changed via editor commands
    if (attrs.colspan > 1) {
      result.gridSpan = attrs.colspan;
    }
    // Width: use != null to handle width=0 correctly
    if (attrs.width != null) {
      result.width = {
        value: attrs.width,
        type: (attrs.widthType as 'auto' | 'dxa' | 'pct' | 'nil') || 'dxa',
      };
    }
    if (attrs.verticalAlign !== (orig.verticalAlign || undefined)) {
      result.verticalAlign = attrs.verticalAlign || undefined;
    }
    if (attrs.backgroundColor) {
      // Preserve themeFill/tint/shade when the user hasn't changed the fill:
      // _originalResolvedFill is set at parse time to the resolved hex of the
      // original shading, so matching backgroundColor means nothing changed.
      if (attrs._originalResolvedFill === attrs.backgroundColor && orig.shading) {
        result.shading = orig.shading;
      } else {
        result.shading = { fill: { rgb: attrs.backgroundColor } };
      }
    } else if (orig.shading) {
      // User cleared the background color
      result.shading = undefined;
    }
    if (attrs.borders) {
      result.borders = attrs.borders as TableCellFormatting['borders'];
    }
    if (attrs.margins) {
      const m = attrs.margins;
      const margins: TableCellFormatting['margins'] = {};
      if (m.top != null) margins.top = { value: m.top, type: 'dxa' };
      if (m.bottom != null) margins.bottom = { value: m.bottom, type: 'dxa' };
      if (m.left != null) margins.left = { value: m.left, type: 'dxa' };
      if (m.right != null) margins.right = { value: m.right, type: 'dxa' };
      result.margins = margins;
    }
    if (attrs.textDirection !== (orig.textDirection || undefined)) {
      result.textDirection =
        (attrs.textDirection as TableCellFormatting['textDirection']) || undefined;
    }

    return result;
  }

  // Fallback: reconstruct formatting from individual attrs
  const hasFormatting =
    attrs.colspan > 1 ||
    attrs.rowspan > 1 ||
    attrs.width != null ||
    attrs.verticalAlign ||
    attrs.backgroundColor ||
    attrs.borders ||
    attrs.margins ||
    attrs.textDirection;

  if (!hasFormatting) {
    return undefined;
  }

  // Convert margins (twips values) back to TableMeasurement objects
  let margins: TableCellFormatting['margins'];
  if (attrs.margins) {
    const m = attrs.margins;
    margins = {};
    if (m.top != null) margins.top = { value: m.top, type: 'dxa' };
    if (m.bottom != null) margins.bottom = { value: m.bottom, type: 'dxa' };
    if (m.left != null) margins.left = { value: m.left, type: 'dxa' };
    if (m.right != null) margins.right = { value: m.right, type: 'dxa' };
  }

  return {
    gridSpan: attrs.colspan > 1 ? attrs.colspan : undefined,
    width:
      attrs.width != null
        ? {
            value: attrs.width,
            type: (attrs.widthType as 'auto' | 'dxa' | 'pct' | 'nil') || 'dxa',
          }
        : undefined,
    verticalAlign: attrs.verticalAlign || undefined,
    textDirection: (attrs.textDirection as TableCellFormatting['textDirection']) || undefined,
    shading: attrs.backgroundColor
      ? {
          fill: { rgb: attrs.backgroundColor },
        }
      : undefined,
    borders: attrs.borders as TableCellFormatting['borders'],
    margins,
  };
}
