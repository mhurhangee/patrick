/**
 * Built-in table style presets (matching common Word styles) and the
 * by-id lookup used when applying a table style. Pure data + lookup — the
 * visual gallery that once rendered these was removed in the UI rebuild;
 * table styling is now applied through the toolbar/context-menu actions
 * resolved in useTableDialogs.
 */

export interface TableStylePreset {
  id: string;
  name: string;
  /** Table-level borders */
  tableBorders?: {
    top?: { style: string; size?: number; color?: { rgb: string } };
    bottom?: { style: string; size?: number; color?: { rgb: string } };
    left?: { style: string; size?: number; color?: { rgb: string } };
    right?: { style: string; size?: number; color?: { rgb: string } };
    insideH?: { style: string; size?: number; color?: { rgb: string } };
    insideV?: { style: string; size?: number; color?: { rgb: string } };
  };
  /** Conditional formatting per cell position */
  conditionals?: Record<
    string,
    {
      backgroundColor?: string;
      borders?: {
        top?: { style: string; size?: number; color?: { rgb: string } } | null;
        bottom?: { style: string; size?: number; color?: { rgb: string } } | null;
        left?: { style: string; size?: number; color?: { rgb: string } } | null;
        right?: { style: string; size?: number; color?: { rgb: string } } | null;
      };
      bold?: boolean;
      color?: string;
    }
  >;
  /** Which conditional formatting is active by default */
  look?: {
    firstRow?: boolean;
    lastRow?: boolean;
    firstCol?: boolean;
    lastCol?: boolean;
    noHBand?: boolean;
    noVBand?: boolean;
  };
}

const border1 = (rgb: string) => ({ style: 'single' as const, size: 4, color: { rgb } });

const BUILTIN_STYLES: TableStylePreset[] = [
  {
    id: 'TableNormal',
    name: 'Normal Table',
    look: { firstRow: false, lastRow: false, noHBand: true, noVBand: true },
  },
  {
    id: 'TableGrid',
    name: 'Table Grid',
    tableBorders: {
      top: border1('000000'),
      bottom: border1('000000'),
      left: border1('000000'),
      right: border1('000000'),
      insideH: border1('000000'),
      insideV: border1('000000'),
    },
    look: { firstRow: false, lastRow: false, noHBand: true, noVBand: true },
  },
  {
    id: 'TableGridLight',
    name: 'Grid Table Light',
    tableBorders: {
      top: border1('BFBFBF'),
      bottom: border1('BFBFBF'),
      left: border1('BFBFBF'),
      right: border1('BFBFBF'),
      insideH: border1('BFBFBF'),
      insideV: border1('BFBFBF'),
    },
    look: { firstRow: true, lastRow: false, noHBand: true, noVBand: true },
    conditionals: {
      firstRow: { bold: true, borders: { bottom: border1('000000') } },
    },
  },
  {
    id: 'PlainTable1',
    name: 'Plain Table 1',
    tableBorders: {
      top: border1('BFBFBF'),
      bottom: border1('BFBFBF'),
      insideH: border1('BFBFBF'),
    },
    look: { firstRow: true, lastRow: false, noHBand: true, noVBand: true },
    conditionals: {
      firstRow: { bold: true },
    },
  },
  {
    id: 'PlainTable2',
    name: 'Plain Table 2',
    look: { firstRow: true, lastRow: false, noHBand: false, noVBand: true },
    conditionals: {
      firstRow: { bold: true, borders: { bottom: border1('7F7F7F') } },
      band1Horz: { backgroundColor: '#F2F2F2' },
    },
  },
  {
    id: 'PlainTable3',
    name: 'Plain Table 3',
    look: { firstRow: true, lastRow: false, noHBand: false, noVBand: true },
    conditionals: {
      firstRow: { bold: true, color: '#FFFFFF', backgroundColor: '#A5A5A5' },
      band1Horz: { backgroundColor: '#E7E7E7' },
    },
  },
  {
    id: 'PlainTable4',
    name: 'Plain Table 4',
    look: { firstRow: true, lastRow: false, noHBand: false, noVBand: true },
    conditionals: {
      firstRow: { bold: true, color: '#FFFFFF', backgroundColor: '#000000' },
      band1Horz: { backgroundColor: '#F2F2F2' },
    },
  },
  {
    id: 'GridTable1Light-Accent1',
    name: 'Grid Table 1 Light',
    tableBorders: {
      top: border1('B4C6E7'),
      bottom: border1('B4C6E7'),
      left: border1('B4C6E7'),
      right: border1('B4C6E7'),
      insideH: border1('B4C6E7'),
      insideV: border1('B4C6E7'),
    },
    look: { firstRow: true, lastRow: false, noHBand: true, noVBand: true },
    conditionals: {
      firstRow: { bold: true, borders: { bottom: border1('4472C4') } },
    },
  },
  {
    id: 'GridTable4-Accent1',
    name: 'Grid Table 4 Accent 1',
    tableBorders: {
      top: border1('4472C4'),
      bottom: border1('4472C4'),
      left: border1('4472C4'),
      right: border1('4472C4'),
      insideH: border1('4472C4'),
      insideV: border1('4472C4'),
    },
    look: { firstRow: true, lastRow: false, noHBand: false, noVBand: true },
    conditionals: {
      firstRow: { bold: true, color: '#FFFFFF', backgroundColor: '#4472C4' },
      band1Horz: { backgroundColor: '#D6E4F0' },
    },
  },
  {
    id: 'GridTable5Dark-Accent1',
    name: 'Grid Table 5 Dark',
    tableBorders: {
      top: border1('FFFFFF'),
      bottom: border1('FFFFFF'),
      left: border1('FFFFFF'),
      right: border1('FFFFFF'),
      insideH: border1('FFFFFF'),
      insideV: border1('FFFFFF'),
    },
    look: { firstRow: true, lastRow: false, noHBand: false, noVBand: true },
    conditionals: {
      firstRow: { bold: true, color: '#FFFFFF', backgroundColor: '#4472C4' },
      band1Horz: { backgroundColor: '#D6E4F0' },
      band2Horz: { backgroundColor: '#B4C6E7' },
    },
  },
  {
    id: 'ListTable3-Accent2',
    name: 'List Table 3 Accent 2',
    tableBorders: {
      top: border1('ED7D31'),
      bottom: border1('ED7D31'),
    },
    look: { firstRow: true, lastRow: false, noHBand: false, noVBand: true },
    conditionals: {
      firstRow: { bold: true, color: '#FFFFFF', backgroundColor: '#ED7D31' },
      band1Horz: { backgroundColor: '#FBE4D5' },
    },
  },
  {
    id: 'ListTable4-Accent3',
    name: 'List Table 4 Accent 3',
    tableBorders: {
      top: border1('A5A5A5'),
      bottom: border1('A5A5A5'),
      insideH: border1('A5A5A5'),
    },
    look: { firstRow: true, lastRow: false, noHBand: false, noVBand: true },
    conditionals: {
      firstRow: { bold: true, color: '#FFFFFF', backgroundColor: '#A5A5A5' },
      band1Horz: { backgroundColor: '#EDEDED' },
    },
  },
  {
    id: 'GridTable4-Accent5',
    name: 'Grid Table 4 Accent 5',
    tableBorders: {
      top: border1('5B9BD5'),
      bottom: border1('5B9BD5'),
      left: border1('5B9BD5'),
      right: border1('5B9BD5'),
      insideH: border1('5B9BD5'),
      insideV: border1('5B9BD5'),
    },
    look: { firstRow: true, lastRow: false, noHBand: false, noVBand: true },
    conditionals: {
      firstRow: { bold: true, color: '#FFFFFF', backgroundColor: '#5B9BD5' },
      band1Horz: { backgroundColor: '#DEEAF6' },
    },
  },
  {
    id: 'GridTable4-Accent6',
    name: 'Grid Table 4 Accent 6',
    tableBorders: {
      top: border1('70AD47'),
      bottom: border1('70AD47'),
      left: border1('70AD47'),
      right: border1('70AD47'),
      insideH: border1('70AD47'),
      insideV: border1('70AD47'),
    },
    look: { firstRow: true, lastRow: false, noHBand: false, noVBand: true },
    conditionals: {
      firstRow: { bold: true, color: '#FFFFFF', backgroundColor: '#70AD47' },
      band1Horz: { backgroundColor: '#E2EFDA' },
    },
  },
];

/** Get a built-in style preset by ID (for resolving in DocxEditor). */
export function getBuiltinTableStyle(styleId: string): TableStylePreset | undefined {
  return BUILTIN_STYLES.find((s) => s.id === styleId);
}
