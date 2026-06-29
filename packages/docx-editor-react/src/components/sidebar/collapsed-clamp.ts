import type { CSSProperties } from 'react';

/** Approx line height of a card's body text (text-[13px] leading-snug). */
const LINE_PX = 18;
/** Card chrome above/around the body (padding) to subtract from the slot. */
const CHROME_PX = 24;

/**
 * Line-clamp style for a collapsed card's body, sized to the room it has before
 * the next card (`availableHeight`). Isolated cards (`undefined` = unbounded)
 * show their full text; clustered cards clamp down, never below two lines.
 */
export function collapsedClamp(availableHeight: number | undefined): CSSProperties | undefined {
  if (availableHeight == null) return undefined;
  const lines = Math.max(2, Math.floor((availableHeight - CHROME_PX) / LINE_PX));
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
  };
}
