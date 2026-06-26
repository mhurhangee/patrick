/**
 * Table border helpers.
 *
 * Border application, row-offset geometry, and the "cut edge" rule that closes
 * a table fragment at a page break. Split out of renderTable.ts to keep that
 * file focused on row/cell/fragment painting.
 */

import type { TableMeasure } from '../layout-engine/types';

type BorderSpec = { width?: number; color?: string; style?: string };

/** Whether a border spec actually paints anything. */
export function isVisibleBorder(border: BorderSpec | undefined): border is BorderSpec {
  return !!border && border.style !== 'none' && border.style !== 'nil' && border.width !== 0;
}

/**
 * Apply a single border to an element.
 */
export function applyBorder(
  el: HTMLElement,
  side: 'top' | 'right' | 'bottom' | 'left',
  border: BorderSpec | undefined
): void {
  const styleProp = `border${side.charAt(0).toUpperCase() + side.slice(1)}` as
    | 'borderTop'
    | 'borderRight'
    | 'borderBottom'
    | 'borderLeft';

  if (!isVisibleBorder(border)) {
    el.style[styleProp] = 'none';
  } else {
    const width = border.width ?? 1;
    const color = border.color ?? '#000000';
    const style = border.style ?? 'solid';
    el.style[styleProp] = `${width}px ${style} ${color}`;
  }
}

/**
 * Cumulative per-row Y offsets, each rounded to a whole pixel so every row box
 * (and the borders on it) lands on the device-pixel grid — fractional row
 * heights otherwise render borders at sub-pixel positions, making some lines
 * look thicker/softer than others. Length is `rows + 1`; the final entry is the
 * total table height.
 *
 * NB: the paginator has a sibling `rowTops` in `tableRowBreak.ts` that keeps
 * the UNrounded offsets (it splits against exact measured heights). Keep the
 * two separate — rounding here is purely for paint crispness.
 */
export function buildRowYPositions(rows: TableMeasure['rows']): number[] {
  const positions: number[] = [];
  let y = 0;
  for (const r of rows) {
    positions.push(Math.round(y));
    y += r?.height ?? 0;
  }
  positions.push(Math.round(y));
  return positions;
}

/**
 * Clip box for the windowed body of a continuation fragment that repeats a
 * header. The header occupies [0, headerHeight] of the table element; the body
 * must clip its already-shown top slice (a row resumed mid-content) BELOW the
 * header instead of painting over it — the table's single overflow:hidden only
 * clips outside the whole fragment. Returns the element to append body rows into
 * and the Y origin to subtract from full-table coordinates. With no header the
 * table's own overflow:hidden suffices, so the table element is reused as-is.
 * (overflowX stays visible so per-row change bars at left:-10px aren't cut off.)
 */
export function makeTableBodyClip(
  tableEl: HTMLElement,
  headerHeight: number,
  visibleHeight: number,
  width: number,
  doc: Document
): { bodyParent: HTMLElement; bodyOriginY: number } {
  if (headerHeight <= 0) return { bodyParent: tableEl, bodyOriginY: 0 };
  const bodyClip = doc.createElement('div');
  bodyClip.style.position = 'absolute';
  bodyClip.style.left = '0';
  bodyClip.style.top = `${headerHeight}px`;
  bodyClip.style.width = `${width}px`;
  bodyClip.style.height = `${Math.max(0, visibleHeight - headerHeight)}px`;
  bodyClip.style.overflowX = 'visible';
  bodyClip.style.overflowY = 'hidden';
  tableEl.appendChild(bodyClip);
  return { bodyParent: bodyClip, bodyOriginY: headerHeight };
}

/**
 * Build a single-column horizontal rule that closes a table fragment at a page
 * break. Word draws this "cut edge" so each fragment reads as a complete
 * bordered box; our rows clip at the window so the natural border is off-screen.
 * One rule is emitted per column (by the caller) so per-column border styles and
 * borderless columns are respected.
 */
export function makeCutBorder(
  doc: Document,
  opts: { x: number; topY: number; width: number; edge: 'top' | 'bottom'; border: BorderSpec }
): HTMLElement {
  const line = doc.createElement('div');
  line.className = 'layout-table-cut-border';
  line.style.position = 'absolute';
  line.style.left = `${opts.x}px`;
  line.style.width = `${opts.width}px`;
  const bw = opts.border.width ?? 1;
  // Sit the rule just inside the cut edge (bottom edge draws upward).
  line.style.top = `${opts.edge === 'bottom' ? opts.topY - bw : opts.topY}px`;
  applyBorder(line, 'top', opts.border);
  return line;
}
