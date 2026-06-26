/**
 * ProseMirror NodeSpecs for table / row / cell / header.
 *
 * Each spec is declarative — attr declarations + parseDOM rules + toDOM
 * recipes. The CSS-style builder helpers in this file (cell border, padding,
 * width, text-direction) are used by toDOM for cell and header.
 */

import type { NodeSpec } from 'prosemirror-model';
import type { TableAttrs, TableRowAttrs, TableCellAttrs } from '../../../schema/nodes';
import type { ColorValue } from '../../../../types/colors';
import { resolveColor } from '../../../../utils/colorResolver';
import { parseCellAttrsFromDOM } from './paste';

export const tableSpec: NodeSpec = {
  content: 'tableRow+',
  group: 'block',
  tableRole: 'table',
  isolating: true,
  attrs: {
    styleId: { default: null },
    width: { default: null },
    widthType: { default: null },
    justification: { default: null },
    columnWidths: { default: null },
    // `w:tblLayout` type ('fixed' | 'autofit'). Tracked as a first-class attr
    // so explicit column widths survive the round-trip: without `fixed`, Word
    // autofits and ignores `w:tblGrid`/`w:tcW` (issue #781).
    tableLayout: { default: null },
    floating: { default: null },
    cellMargins: { default: null },
    look: { default: null },
    bidi: { default: null },
    _originalFormatting: { default: null },
    // Table-property change history (`<w:tblPrChange>`). Round-trip only;
    // accept/reject by id resolves the entry. Serializer clamps to one entry.
    tblPrChange: { default: null },
  },
  parseDOM: [
    {
      tag: 'table',
      getAttrs(dom): TableAttrs {
        const element = dom as HTMLTableElement;
        return {
          styleId: element.dataset.styleId || undefined,
          justification: element.dataset.justification as TableAttrs['justification'] | undefined,
          bidi: element.dataset.bidi === 'true' || element.dir === 'rtl' || undefined,
        };
      },
    },
  ],
  toDOM(node) {
    const attrs = node.attrs as TableAttrs;
    const domAttrs: Record<string, string> = { class: 'docx-table' };

    if (attrs.styleId) {
      domAttrs['data-style-id'] = attrs.styleId;
    }

    if (attrs.bidi) {
      domAttrs['data-bidi'] = 'true';
      domAttrs.dir = 'rtl';
    }

    const styles: string[] = ['border-collapse: collapse'];

    if (attrs.bidi) {
      styles.push('direction: rtl');
    }

    if (attrs.width && attrs.widthType === 'pct') {
      styles.push(`width: ${attrs.width / 50}%`);
      styles.push('table-layout: fixed');
    } else if (attrs.width && attrs.widthType === 'dxa') {
      const widthPx = Math.round((attrs.width / 20) * 1.333);
      styles.push(`width: ${widthPx}px`);
      styles.push('table-layout: fixed');
    } else {
      // Default: fill available width so tables aren't collapsed to content
      styles.push('width: 100%');
      styles.push('table-layout: fixed');
    }

    if (attrs.justification === 'center') {
      styles.push('margin-left: auto', 'margin-right: auto');
    } else if (attrs.justification === 'right') {
      styles.push('margin-left: auto');
    }
    domAttrs.style = styles.join('; ');

    // Tracked table-property change — surface data-revision-id so the
    // sidebar can anchor on the table block.
    if (Array.isArray(attrs.tblPrChange) && attrs.tblPrChange.length > 0) {
      const first = attrs.tblPrChange[0];
      domAttrs.class += ' ep-revision-prop-change';
      domAttrs['data-revision-id'] = String(first.info.id);
      domAttrs['data-revision-author'] = first.info.author;
      if (first.info.date) domAttrs['data-revision-date'] = first.info.date;
    }

    return ['table', domAttrs, ['tbody', 0]];
  },
};

export const tableRowSpec: NodeSpec = {
  content: '(tableCell | tableHeader)+',
  tableRole: 'row',
  attrs: {
    height: { default: null },
    heightRule: { default: null },
    isHeader: { default: false },
    _originalFormatting: { default: null },
    // Row-mark insertion / deletion (`<w:trPr><w:ins/>` / `<w:del/>`) and
    // row-property change history. See ECMA-376 §17.13.5.
    trIns: { default: null },
    trDel: { default: null },
    trPrChange: { default: null },
  },
  parseDOM: [{ tag: 'tr' }],
  toDOM(node) {
    const attrs = node.attrs as TableRowAttrs;
    const domAttrs: Record<string, string> = {};

    if (attrs.height) {
      const heightPx = Math.round((attrs.height / 20) * 1.333);
      domAttrs.style = `height: ${heightPx}px`;
    }

    if (attrs.trIns || attrs.trDel) {
      const rev = attrs.trIns ?? attrs.trDel!;
      const kindClass = attrs.trIns ? 'ep-revision-ins' : 'ep-revision-del';
      domAttrs.class = 'ep-revision-row ' + kindClass;
      domAttrs['data-revision-id'] = String(rev.revisionId);
      domAttrs['data-revision-author'] = rev.author;
      if (rev.date) domAttrs['data-revision-date'] = rev.date;
    } else if (Array.isArray(attrs.trPrChange) && attrs.trPrChange.length > 0) {
      // Row-property-only change — surface a click-to-jump anchor.
      const first = attrs.trPrChange[0];
      domAttrs.class = 'ep-revision-prop-change';
      domAttrs['data-revision-id'] = String(first.info.id);
      domAttrs['data-revision-author'] = first.info.author;
      if (first.info.date) domAttrs['data-revision-date'] = first.info.date;
    }

    return ['tr', domAttrs, 0];
  },
};

// OOXML border style → CSS border-style mapping
const BORDER_STYLE_CSS: Record<string, string> = {
  single: 'solid',
  double: 'double',
  dotted: 'dotted',
  dashed: 'dashed',
  thick: 'solid',
  dashSmallGap: 'dashed',
  dotDash: 'dashed',
  dotDotDash: 'dotted',
  triple: 'double',
  thinThickSmallGap: 'double',
  thickThinSmallGap: 'double',
  thinThickThinSmallGap: 'double',
  thinThickMediumGap: 'double',
  thickThinMediumGap: 'double',
  thinThickThinMediumGap: 'double',
  thinThickLargeGap: 'double',
  thickThinLargeGap: 'double',
  thinThickThinLargeGap: 'double',
  wave: 'solid',
  doubleWave: 'double',
  dashDotStroked: 'dashed',
  threeDEmboss: 'ridge',
  threeDEngrave: 'groove',
  outset: 'outset',
  inset: 'inset',
};

// Helper for cell border rendering — works with full BorderSpec objects
function buildCellBorderStyles(attrs: TableCellAttrs): string[] {
  const styles: string[] = [];
  const borders = attrs.borders;

  if (!borders) return styles;

  const borderToCss = (border?: { style?: string; size?: number; color?: ColorValue }): string => {
    if (!border || !border.style || border.style === 'none' || border.style === 'nil') {
      return 'none';
    }
    const widthPx = border.size ? Math.max(1, Math.round((border.size / 8) * 1.333)) : 1;
    const cssStyle = BORDER_STYLE_CSS[border.style] || 'solid';
    const color = resolveColor(border.color, undefined);
    return `${widthPx}px ${cssStyle} ${color}`;
  };

  styles.push(`border-top: ${borderToCss(borders.top)}`);
  styles.push(`border-bottom: ${borderToCss(borders.bottom)}`);
  styles.push(`border-left: ${borderToCss(borders.left)}`);
  styles.push(`border-right: ${borderToCss(borders.right)}`);

  return styles;
}

// Convert cell margins (twips) to CSS padding
function buildCellPaddingStyles(attrs: TableCellAttrs): string[] {
  const margins = attrs.margins;
  // Word default cell margins: 108 twips (top/bottom), 108 twips (left/right)
  if (!margins) {
    const px = Math.round((108 / 20) * 1.333);
    return [`padding: ${px}px ${px}px`];
  }

  const toPixels = (twips?: number) => (twips ? Math.round((twips / 20) * 1.333) : 0);
  const top = toPixels(margins.top);
  const right = toPixels(margins.right);
  const bottom = toPixels(margins.bottom);
  const left = toPixels(margins.left);

  return [`padding: ${top}px ${right}px ${bottom}px ${left}px`];
}

// OOXML text direction → CSS writing-mode + direction
function buildTextDirectionStyles(textDirection?: string): string[] {
  if (!textDirection) return [];
  const styles: string[] = [];

  switch (textDirection) {
    case 'tbRl':
    case 'tbRlV':
      styles.push('writing-mode: vertical-rl');
      break;
    case 'btLr':
      styles.push('writing-mode: vertical-lr', 'transform: rotate(180deg)');
      break;
    case 'rl':
    case 'rlV':
      styles.push('direction: rtl');
      break;
    case 'tb':
    case 'tbV':
      styles.push('writing-mode: vertical-lr');
      break;
    // 'lr', 'lrV' are the default left-to-right, no extra styles needed
  }

  return styles;
}

function buildCellWidthStyles(attrs: TableCellAttrs): string[] {
  const styles: string[] = [];

  if (attrs.colwidth && attrs.colwidth.length > 0) {
    const totalWidth = attrs.colwidth.reduce((sum, w) => sum + w, 0);
    styles.push(`width: ${totalWidth}px`);
  } else if (attrs.width && attrs.widthType === 'pct') {
    styles.push(`width: ${attrs.width}%`);
  } else if (attrs.width) {
    const widthPx = Math.round((attrs.width / 20) * 1.333);
    styles.push(`width: ${widthPx}px`);
  }

  return styles;
}

export const tableCellSpec: NodeSpec = {
  content: '(paragraph | table)+',
  tableRole: 'cell',
  isolating: true,
  attrs: {
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
    width: { default: null },
    widthType: { default: null },
    verticalAlign: { default: null },
    backgroundColor: { default: null },
    borders: { default: null },
    margins: { default: null },
    textDirection: { default: null },
    noWrap: { default: false },
    _originalFormatting: { default: null },
    _originalResolvedFill: { default: null },
    // Cell structural marker (ins/del/merge) and property change history.
    // `cellMarker` is mutually exclusive per EG_CellMarkupElements; merge
    // is vertical-only (vMerge/vMergeOrig).
    cellMarker: { default: null },
    tcPrChange: { default: null },
  },
  parseDOM: [
    {
      tag: 'td',
      getAttrs: (dom) => parseCellAttrsFromDOM(dom as HTMLTableCellElement),
    },
  ],
  toDOM(node) {
    const attrs = node.attrs as TableCellAttrs;
    const domAttrs: Record<string, string> = { class: 'docx-table-cell' };
    if (attrs.cellMarker) {
      const m = attrs.cellMarker;
      const kindClass =
        m.kind === 'ins'
          ? 'ep-revision-ins'
          : m.kind === 'del'
            ? 'ep-revision-del'
            : 'ep-revision-merge';
      domAttrs.class = `${domAttrs.class} ep-revision-cell ${kindClass}`;
      domAttrs['data-revision-id'] = String(m.info.revisionId);
      domAttrs['data-revision-author'] = m.info.author;
      if (m.info.date) domAttrs['data-revision-date'] = m.info.date;
      if (m.kind === 'merge') domAttrs['data-vmerge'] = m.vMerge;
    } else if (Array.isArray(attrs.tcPrChange) && attrs.tcPrChange.length > 0) {
      // Cell-property-only change. Surface a click-to-jump anchor.
      const first = attrs.tcPrChange[0];
      domAttrs.class = `${domAttrs.class} ep-revision-prop-change`;
      domAttrs['data-revision-id'] = String(first.info.id);
      domAttrs['data-revision-author'] = first.info.author;
      if (first.info.date) domAttrs['data-revision-date'] = first.info.date;
    }

    if (attrs.colspan > 1) domAttrs.colspan = String(attrs.colspan);
    if (attrs.rowspan > 1) domAttrs.rowspan = String(attrs.rowspan);

    const styles: string[] = [];
    styles.push(...buildCellPaddingStyles(attrs));

    if (attrs.noWrap) {
      styles.push('white-space: nowrap');
    } else {
      styles.push('word-wrap: break-word', 'overflow-wrap: break-word', 'overflow: hidden');
    }

    styles.push(...buildCellWidthStyles(attrs));
    styles.push(...buildCellBorderStyles(attrs));
    styles.push(...buildTextDirectionStyles(attrs.textDirection));

    if (attrs.verticalAlign) {
      domAttrs['data-valign'] = attrs.verticalAlign;
      styles.push(`vertical-align: ${attrs.verticalAlign}`);
    }
    if (attrs.backgroundColor) {
      domAttrs['data-bgcolor'] = attrs.backgroundColor;
      styles.push(`background-color: #${attrs.backgroundColor}`);
    }
    domAttrs.style = styles.join('; ');

    return ['td', domAttrs, 0];
  },
};

export const tableHeaderSpec: NodeSpec = {
  content: '(paragraph | table)+',
  tableRole: 'header_cell',
  isolating: true,
  attrs: {
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
    width: { default: null },
    widthType: { default: null },
    verticalAlign: { default: null },
    backgroundColor: { default: null },
    borders: { default: null },
    margins: { default: null },
    textDirection: { default: null },
    noWrap: { default: false },
    _originalFormatting: { default: null },
    _originalResolvedFill: { default: null },
    cellMarker: { default: null },
    tcPrChange: { default: null },
  },
  parseDOM: [
    {
      tag: 'th',
      getAttrs: (dom) => parseCellAttrsFromDOM(dom as HTMLTableCellElement),
    },
  ],
  toDOM(node) {
    const attrs = node.attrs as TableCellAttrs;
    const domAttrs: Record<string, string> = { class: 'docx-table-header' };

    if (attrs.colspan > 1) domAttrs.colspan = String(attrs.colspan);
    if (attrs.rowspan > 1) domAttrs.rowspan = String(attrs.rowspan);

    // Mirror the tableCellSpec revision cue so header cells also surface
    // tracked-change attrs to the sidebar / painter.
    if (attrs.cellMarker) {
      const m = attrs.cellMarker;
      const kindClass =
        m.kind === 'ins'
          ? 'ep-revision-ins'
          : m.kind === 'del'
            ? 'ep-revision-del'
            : 'ep-revision-merge';
      domAttrs.class = `${domAttrs.class} ep-revision-cell ${kindClass}`;
      domAttrs['data-revision-id'] = String(m.info.revisionId);
      domAttrs['data-revision-author'] = m.info.author;
      if (m.info.date) domAttrs['data-revision-date'] = m.info.date;
      if (m.kind === 'merge') domAttrs['data-vmerge'] = m.vMerge;
    } else if (Array.isArray(attrs.tcPrChange) && attrs.tcPrChange.length > 0) {
      const first = attrs.tcPrChange[0];
      domAttrs.class = `${domAttrs.class} ep-revision-prop-change`;
      domAttrs['data-revision-id'] = String(first.info.id);
      domAttrs['data-revision-author'] = first.info.author;
      if (first.info.date) domAttrs['data-revision-date'] = first.info.date;
    }

    const styles: string[] = ['font-weight: bold'];
    styles.push(...buildCellPaddingStyles(attrs));

    if (attrs.noWrap) {
      styles.push('white-space: nowrap');
    } else {
      styles.push('word-wrap: break-word', 'overflow-wrap: break-word', 'overflow: hidden');
    }

    styles.push(...buildCellWidthStyles(attrs));
    styles.push(...buildCellBorderStyles(attrs));
    styles.push(...buildTextDirectionStyles(attrs.textDirection));

    if (attrs.verticalAlign) {
      domAttrs['data-valign'] = attrs.verticalAlign;
      styles.push(`vertical-align: ${attrs.verticalAlign}`);
    }

    if (attrs.backgroundColor) {
      domAttrs['data-bgcolor'] = attrs.backgroundColor;
      styles.push(`background-color: #${attrs.backgroundColor}`);
    }

    domAttrs.style = styles.join('; ');

    return ['th', domAttrs, 0];
  },
};
