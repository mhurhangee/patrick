import type { Page } from '../layout-engine/types';
import { emuToPixels } from '../utils/units';

/**
 * Page geometry needed to translate OOXML `relativeFrom` anchors into painter
 * coordinates. All values are in CSS pixels.
 */
export interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
  marginLeft: number;
  marginTop: number;
  contentWidth: number;
  contentHeight: number;
}

export interface AnchoredObjectPositionInput {
  width: number;
  height: number;
  position?: {
    horizontal?: { relativeTo?: string; posOffset?: number; align?: string };
    vertical?: { relativeTo?: string; posOffset?: number; align?: string };
  };
  cssFloat?: 'left' | 'right' | 'none';
}

export interface AnchoredObjectPosition {
  x: number;
  y: number;
  side: 'left' | 'right';
}

export function pageGeometryFromPage(page: Pick<Page, 'size' | 'margins'>): PageGeometry {
  return {
    pageWidth: page.size.w,
    pageHeight: page.size.h,
    marginLeft: page.margins.left,
    marginTop: page.margins.top,
    contentWidth: page.size.w - page.margins.left - page.margins.right,
    contentHeight: page.size.h - page.margins.top - page.margins.bottom,
  };
}

export function resolveAnchoredObjectPosition(
  object: AnchoredObjectPositionInput,
  fragmentY: number,
  contentWidth: number,
  geometry?: PageGeometry
): AnchoredObjectPosition {
  const { x, side } = resolveHorizontalAnchor(object, contentWidth, geometry);
  const y = resolveVerticalAnchor(object, fragmentY, geometry);
  return { x, y, side };
}

/**
 * Content-area top Y (px) of an anchored object, resolving its OOXML vertical
 * anchor (`page` / `margin` / `topMargin` / `bottomMargin` / `paragraph`, with
 * `align` or `posOffset`). Exposed so the measure pipeline can reserve a
 * `topAndBottom` band at the exact Y the painter will place the object —
 * the two paths must not diverge (dual-renderer rule).
 */
export function resolveAnchoredObjectVerticalTop(
  object: AnchoredObjectPositionInput,
  fragmentY: number,
  geometry?: PageGeometry
): number {
  return resolveVerticalAnchor(object, fragmentY, geometry);
}

function resolveHorizontalAnchor(
  object: AnchoredObjectPositionInput,
  contentWidth: number,
  geometry: PageGeometry | undefined
): Pick<AnchoredObjectPosition, 'x' | 'side'> {
  const horizontal = object.position?.horizontal;
  if (!horizontal) {
    return object.cssFloat === 'right'
      ? { x: contentWidth - object.width, side: 'right' }
      : { x: 0, side: 'left' };
  }

  const band = horizontalAnchorBand(horizontal.relativeTo, contentWidth, geometry);
  if (horizontal.align === 'right') {
    return { x: band.size ? band.base + band.size - object.width : 0, side: 'right' };
  }
  if (horizontal.align === 'left') {
    return { x: band.base, side: 'left' };
  }
  if (horizontal.align === 'center') {
    return { x: band.size ? band.base + (band.size - object.width) / 2 : 0, side: 'left' };
  }
  if (horizontal.posOffset !== undefined) {
    const x = band.base + emuToPixels(horizontal.posOffset);
    return { x, side: x > contentWidth / 2 ? 'right' : 'left' };
  }

  return { x: band.base, side: 'left' };
}

function horizontalAnchorBand(
  relativeTo: string | undefined,
  contentWidth: number,
  geometry: PageGeometry | undefined
): { base: number; size: number } {
  const pageWidth = geometry?.pageWidth ?? 0;
  const marginLeft = geometry?.marginLeft ?? 0;

  switch (relativeTo) {
    case 'page':
      return { base: -marginLeft, size: pageWidth };
    case 'leftMargin':
      return { base: -marginLeft, size: marginLeft };
    case 'rightMargin':
      return { base: contentWidth, size: marginLeft };
    case 'character':
      return { base: 0, size: 0 };
    case 'column':
    case 'margin':
    case 'insideMargin':
    case 'outsideMargin':
    default:
      return { base: 0, size: contentWidth };
  }
}

function resolveVerticalAnchor(
  object: AnchoredObjectPositionInput,
  fragmentY: number,
  geometry: PageGeometry | undefined
): number {
  const vertical = object.position?.vertical;
  if (!vertical) return fragmentY;

  const band = verticalAnchorBand(vertical.relativeTo, fragmentY, geometry);
  if (vertical.align === 'top') {
    return band.base;
  }
  if (vertical.align === 'center') {
    return band.size ? band.base + (band.size - object.height) / 2 : fragmentY;
  }
  if (vertical.align === 'bottom') {
    return band.size ? band.base + band.size - object.height : fragmentY;
  }
  if (vertical.posOffset !== undefined) {
    return band.base + emuToPixels(vertical.posOffset);
  }

  return vertical.relativeTo === 'paragraph' || vertical.relativeTo === 'line'
    ? fragmentY
    : band.base;
}

function verticalAnchorBand(
  relativeTo: string | undefined,
  fragmentY: number,
  geometry: PageGeometry | undefined
): { base: number; size: number } {
  const pageHeight = geometry?.pageHeight ?? 0;
  const marginTop = geometry?.marginTop ?? 0;
  const contentHeight = geometry?.contentHeight ?? 0;

  switch (relativeTo) {
    case 'paragraph':
    case 'line':
      return { base: fragmentY, size: 0 };
    case 'page':
      return { base: -marginTop, size: pageHeight };
    case 'topMargin':
      return { base: -marginTop, size: marginTop };
    case 'bottomMargin':
      return { base: contentHeight, size: marginTop };
    case 'margin':
    case 'insideMargin':
    case 'outsideMargin':
    default:
      return { base: 0, size: contentHeight };
  }
}
