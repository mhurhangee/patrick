import type { ImageRun, WrapTextDirection } from '../layout-engine/types';
import { isFloatingWrapType, isWrapNone, wrapsAroundText } from '../docx/wrapTypes';

/**
 * Whether a floating image record reserves space in the text-wrap calculation.
 * Records reaching this predicate have already passed `isFloatingImageRun`, so
 * `wrapType=undefined` implies a `cssFloat`-driven float that wraps text.
 */
export function floatingImageWrapsText(img: { wrapType?: string }): boolean {
  return !isWrapNone(img.wrapType) && img.wrapType !== 'topAndBottom';
}

export function floatingImageIsBehindDoc(img: { wrapType?: string }): boolean {
  return img.wrapType === 'behind';
}

/**
 * Check if an image run is a floating image positioned at page/cell level.
 */
export function isFloatingImageRun(run: ImageRun): boolean {
  if (isFloatingWrapType(run.wrapType)) return true;
  return run.displayMode === 'float';
}

/**
 * Check if a floating image should create text wrapping exclusion zones.
 * wrapNone images (`behind` / `inFront`) are positioned floats but do not
 * shrink line widths; text paints over or under them.
 */
export function isTextWrappingFloatingImageRun(run: ImageRun): boolean {
  if (isWrapNone(run.wrapType) || run.wrapType === 'topAndBottom') return false;
  if (wrapsAroundText(run.wrapType)) return true;
  return run.displayMode === 'float' && run.cssFloat !== 'none';
}

export function imageWrapTextFromCssFloat(cssFloat: ImageRun['cssFloat']): WrapTextDirection {
  if (cssFloat === 'left') return 'right';
  if (cssFloat === 'right') return 'left';
  return 'bothSides';
}
