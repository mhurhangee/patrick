/**
 * DOM-based Click-to-Position Mapping
 *
 * Uses the browser's actual rendered DOM to find ProseMirror positions.
 * This is more accurate than geometry-based calculation because it uses
 * the browser's own text rendering with document.elementsFromPoint().
 *
 * DOM elements are tagged with data-pm-start and data-pm-end attributes,
 * enabling binary search to find exact character positions.
 * @packageDocumentation
 * @public
 */

import { findBodyEmptyRuns, findBodyPmSpans } from './findBodyPmSpans';

/**
 * Find ProseMirror position from a click using DOM-based detection.
 *
 * @param container - The pages container element
 * @param clientX - Client X coordinate from mouse event
 * @param clientY - Client Y coordinate from mouse event
 * @param zoom - Current zoom level (default 1)
 * @returns ProseMirror position, or null if not found
 */
export function clickToPositionDom(
  container: HTMLElement,
  clientX: number,
  clientY: number,
  zoom: number = 1
): number | null {
  // Get all elements at the click point
  const elements = document.elementsFromPoint(clientX, clientY);

  // Find the page element
  const pageEl = elements.find((el) => el.classList.contains('layout-page')) as HTMLElement | null;
  if (!pageEl) return null;

  // Find span with PM position data
  const spanEl = elements.find(
    (el) =>
      el.tagName === 'SPAN' &&
      (el as HTMLElement).dataset.pmStart !== undefined &&
      (el as HTMLElement).dataset.pmEnd !== undefined
  ) as HTMLElement | null;

  if (spanEl) {
    return findPositionInSpan(spanEl, clientX, clientY);
  }

  // Check for empty paragraphs (including inside table cells)
  const emptyRun = elements.find((el) =>
    el.classList.contains('layout-empty-run')
  ) as HTMLElement | null;
  if (emptyRun) {
    const paragraph = emptyRun.closest('.layout-paragraph') as HTMLElement | null;
    if (paragraph && paragraph.dataset.pmStart) {
      return Number(paragraph.dataset.pmStart);
    }
  }

  // Check for paragraph elements directly (handles clicks in whitespace
  // to the right of text, or table cells where the narrow empty-run span
  // isn't hit but the parent paragraph div is)
  const paragraphEl = elements.find(
    (el) =>
      el.classList.contains('layout-paragraph') && (el as HTMLElement).dataset.pmStart !== undefined
  ) as HTMLElement | null;
  if (paragraphEl && paragraphEl.dataset.pmStart) {
    // Try to find the nearest span within this paragraph so clicks to the
    // right of text land at the end of the line, not the paragraph start.
    const nearestPos = findNearestSpanInElement(paragraphEl, clientX, clientY);
    if (nearestPos !== null) {
      return nearestPos;
    }
    return Number(paragraphEl.dataset.pmStart);
  }

  // Check if click is within a table cell. When clicking in empty space below
  // text in a cell, restrict the search to spans within that cell to avoid
  // the cursor jumping to a different cell (fixes #54).
  const cellEl = elements.find((el) =>
    el.classList.contains('layout-table-cell')
  ) as HTMLElement | null;
  if (cellEl) {
    return findNearestSpanInElement(cellEl, clientX, clientY);
  }

  // Fallback: Find nearest text span on the page
  return findNearestSpan(container, pageEl, clientX, clientY, zoom);
}

/**
 * Find exact position within a text span using binary search on character boundaries.
 */
function findPositionInSpan(spanEl: HTMLElement, clientX: number, _clientY: number): number | null {
  const pmStart = Number(spanEl.dataset.pmStart);
  const pmEnd = Number(spanEl.dataset.pmEnd);

  // Special handling for tab spans - they have a visual width but only contain NBSP
  // Clicking anywhere on a tab should position cursor at start or end based on click position
  if (spanEl.classList.contains('layout-run-tab')) {
    const rect = spanEl.getBoundingClientRect();
    const midpoint = (rect.left + rect.right) / 2;
    // Click in left half -> start of tab, right half -> end of tab
    return clientX < midpoint ? pmStart : pmEnd;
  }

  const textNode = spanEl.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    // No text content - return start position
    return pmStart;
  }

  const text = textNode as Text;
  const textLength = text.length;

  if (textLength === 0) {
    return pmStart;
  }

  const ownerDoc = spanEl.ownerDocument;
  if (!ownerDoc) return pmStart;

  // Binary search for the character boundary
  let left = 0;
  let right = textLength;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const range = ownerDoc.createRange();
    range.setStart(text, mid);
    range.setEnd(text, mid);

    const rect = range.getBoundingClientRect();
    const charX = rect.left;

    if (clientX < charX) {
      right = mid;
    } else {
      left = mid + 1;
    }
  }

  // Refine: check if we're closer to left-1 or left
  if (left > 0 && left <= textLength) {
    const range = ownerDoc.createRange();

    // Get position of character at left-1
    range.setStart(text, left - 1);
    range.setEnd(text, left - 1);
    const leftRect = range.getBoundingClientRect();

    // Get position of character at left
    range.setStart(text, Math.min(left, textLength));
    range.setEnd(text, Math.min(left, textLength));
    const rightRect = range.getBoundingClientRect();

    // Use the closer boundary
    const distLeft = Math.abs(clientX - leftRect.left);
    const distRight = Math.abs(clientX - rightRect.left);

    if (distLeft < distRight) {
      return pmStart + (left - 1);
    }
  }

  return pmStart + Math.min(left, pmEnd - pmStart);
}

/**
 * Find the nearest text span within a specific element (e.g. a table cell).
 * Used when a click lands in empty space within a cell to keep the cursor
 * inside that cell rather than jumping to a different one.
 */
function findNearestSpanInElement(
  element: HTMLElement,
  clientX: number,
  clientY: number
): number | null {
  // Check for empty paragraphs within this element
  const emptyRun = element.querySelector('.layout-empty-run') as HTMLElement | null;
  if (emptyRun) {
    const paragraph = emptyRun.closest('.layout-paragraph') as HTMLElement | null;
    if (paragraph && paragraph.dataset.pmStart) {
      return Number(paragraph.dataset.pmStart);
    }
  }

  // Find the closest line within this element
  const lines = element.querySelectorAll('.layout-line');
  let closestLine: HTMLElement | null = null;
  let closestLineDistance = Infinity;

  for (const line of Array.from(lines)) {
    const lineEl = line as HTMLElement;
    const rect = lineEl.getBoundingClientRect();
    const centerY = (rect.top + rect.bottom) / 2;
    const distance = Math.abs(clientY - centerY);

    if (distance < closestLineDistance) {
      closestLineDistance = distance;
      closestLine = lineEl;
    }
  }

  if (!closestLine) {
    // No lines - try paragraph directly
    const paragraph = element.querySelector(
      '.layout-paragraph[data-pm-start]'
    ) as HTMLElement | null;
    if (paragraph?.dataset.pmStart) {
      return Number(paragraph.dataset.pmStart);
    }
    // Last resort: use the cell's own PM position
    if (element.dataset.pmStart) {
      return Number(element.dataset.pmStart);
    }
    return null;
  }

  // Find closest span in that line
  const lineSpans = closestLine.querySelectorAll('span[data-pm-start][data-pm-end]');
  if (lineSpans.length === 0) {
    const paragraph = closestLine.closest('.layout-paragraph') as HTMLElement | null;
    if (paragraph?.dataset.pmStart) {
      return Number(paragraph.dataset.pmStart);
    }
    return null;
  }

  let closestSpan: HTMLElement | null = null;
  let closestSpanDistance = Infinity;

  for (const span of Array.from(lineSpans)) {
    const spanEl = span as HTMLElement;
    const rect = spanEl.getBoundingClientRect();

    if (clientX >= rect.left && clientX <= rect.right) {
      return findPositionInSpan(spanEl, clientX, clientY);
    }

    const distance = clientX < rect.left ? rect.left - clientX : clientX - rect.right;
    if (distance < closestSpanDistance) {
      closestSpanDistance = distance;
      closestSpan = spanEl;
    }
  }

  if (!closestSpan) return null;

  const rect = closestSpan.getBoundingClientRect();
  if (clientX < rect.left) {
    return Number(closestSpan.dataset.pmStart);
  } else {
    return Number(closestSpan.dataset.pmEnd);
  }
}

/**
 * Find the nearest text span when click is not directly on text.
 * This handles clicks in margins, between lines, etc.
 */
function findNearestSpan(
  _container: HTMLElement,
  pageEl: HTMLElement,
  clientX: number,
  clientY: number,
  _zoom: number
): number | null {
  // Get all text spans on this page
  const spans = pageEl.querySelectorAll('span[data-pm-start][data-pm-end]');
  if (spans.length === 0) {
    // No text spans - return position based on paragraph
    const paragraphs = pageEl.querySelectorAll('.layout-paragraph');
    if (paragraphs.length > 0) {
      const firstP = paragraphs[0] as HTMLElement;
      return Number(firstP.dataset.pmStart) || 0;
    }
    return null;
  }

  // Find the closest line to the click Y
  const lines = pageEl.querySelectorAll('.layout-line');
  let closestLine: HTMLElement | null = null;
  let closestLineDistance = Infinity;

  for (const line of Array.from(lines)) {
    const lineEl = line as HTMLElement;
    const rect = lineEl.getBoundingClientRect();
    const centerY = (rect.top + rect.bottom) / 2;
    const distance = Math.abs(clientY - centerY);

    if (distance < closestLineDistance) {
      closestLineDistance = distance;
      closestLine = lineEl;
    }
  }

  if (!closestLine) return null;

  // Get spans in this line
  const lineSpans = closestLine.querySelectorAll('span[data-pm-start][data-pm-end]');
  if (lineSpans.length === 0) {
    // Empty line - find PM position from paragraph
    const paragraph = closestLine.closest('.layout-paragraph') as HTMLElement | null;
    if (paragraph?.dataset.pmStart) {
      return Number(paragraph.dataset.pmStart);
    }
    return null;
  }

  // Find closest span in the line
  let closestSpan: HTMLElement | null = null;
  let closestSpanDistance = Infinity;

  for (const span of Array.from(lineSpans)) {
    const spanEl = span as HTMLElement;
    const rect = spanEl.getBoundingClientRect();

    // Check if click is within span bounds
    if (clientX >= rect.left && clientX <= rect.right) {
      return findPositionInSpan(spanEl, clientX, clientY);
    }

    // Calculate distance to span
    const distance = clientX < rect.left ? rect.left - clientX : clientX - rect.right;

    if (distance < closestSpanDistance) {
      closestSpanDistance = distance;
      closestSpan = spanEl;
    }
  }

  if (!closestSpan) return null;

  const rect = closestSpan.getBoundingClientRect();

  // If click is to the left, return start; if right, return end
  if (clientX < rect.left) {
    return Number(closestSpan.dataset.pmStart);
  } else {
    return Number(closestSpan.dataset.pmEnd);
  }
}

/**
 * Get selection rectangles for a PM range using DOM-based detection.
 *
 * @param container - The pages container element
 * @param from - Start PM position
 * @param to - End PM position
 * @param overlayRect - Bounding rect of the selection overlay
 * @returns Array of selection rectangles in overlay coordinates
 */
export interface DomSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
}

/** A rect whose height drops below this after clipping is treated as fully hidden. */
const MIN_VISIBLE_RECT = 0.5;

/**
 * Vertically clip a client rect to the enclosing page-fragment table's visible
 * box. A table that breaks across a page sits in a `.layout-table` with
 * `overflow:hidden` and `height = visibleHeight`; getClientRects() still reports
 * the geometry of lines that are visually clipped (off the page / in the
 * inter-page gap), so selection highlights must be clipped to the same box.
 *
 * Uses `.layout-table:not(.layout-nested-table)` because only the page-fragment
 * table carries the window clip — the inner nested table has no overflow:hidden.
 * Clips vertically only (the gap bug is vertical; horizontal clipping could trim
 * change bars on tracked-change tables that set overflow-x: visible).
 *
 * Returns null when the rect is fully outside the window.
 */
export function clipRectToTableWindow(
  spanEl: Element,
  rect: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  }
): { left: number; top: number; right: number; bottom: number } | null {
  const clipEl = spanEl.closest('.layout-table:not(.layout-nested-table)');
  if (!clipEl) return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  const clip = clipEl.getBoundingClientRect();
  const top = Math.max(rect.top, clip.top);
  const bottom = Math.min(rect.bottom, clip.bottom);
  if (bottom - top <= MIN_VISIBLE_RECT) return null;
  return { left: rect.left, top, right: rect.right, bottom };
}

const BLANK_LINE_SELECTION_WIDTH_PX = 4;

function blankLineSliverRect(markerEl: HTMLElement, overlayRect: DOMRect): DomSelectionRect | null {
  const lineEl = markerEl.closest('.layout-line') as HTMLElement | null;
  const lineBox = (lineEl ?? markerEl).getBoundingClientRect();
  const left = markerEl.getBoundingClientRect().left;
  const clipped = clipRectToTableWindow(markerEl, {
    left,
    top: lineBox.top,
    right: left + BLANK_LINE_SELECTION_WIDTH_PX,
    bottom: lineBox.bottom,
  });
  if (!clipped) return null;
  const pageEl = markerEl.closest('.layout-page') as HTMLElement | null;
  return {
    x: clipped.left - overlayRect.left,
    y: clipped.top - overlayRect.top,
    width: clipped.right - clipped.left,
    height: clipped.bottom - clipped.top,
    pageIndex: pageEl ? Number(pageEl.dataset.pageNumber || 1) - 1 : 0,
  };
}

function emptyParagraphRangeFor(emptyRun: HTMLElement): { pmStart: number; pmEnd: number } | null {
  const paragraph = emptyRun.closest('.layout-paragraph') as HTMLElement | null;
  if (!paragraph) return null;
  const pmStart = Number(paragraph.dataset.pmStart);
  const pmEnd = Number(paragraph.dataset.pmEnd);
  if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd)) return null;
  return { pmStart, pmEnd };
}

export function getSelectionRectsFromDom(
  container: HTMLElement,
  from: number,
  to: number,
  overlayRect: DOMRect
): DomSelectionRect[] {
  const rects: DomSelectionRect[] = [];

  // Find all body spans that intersect with the selection. Scoped via
  // `findBodyPmSpans` so HF spans (whose PM positions live in a
  // separate document) don't bleed selection rects into headers when
  // body PM positions happen to overlap. Same fix as #406 / #408 on
  // the React-side selection-resolution path.
  const spans = findBodyPmSpans(container);

  for (const span of Array.from(spans)) {
    const spanEl = span as HTMLElement;
    const pmStart = Number(spanEl.dataset.pmStart);
    const pmEnd = Number(spanEl.dataset.pmEnd);

    // Check if span overlaps with selection
    if (pmEnd <= from || pmStart >= to) continue;

    // Clip each rect to the enclosing split-table's visible window so selecting
    // across a page-broken table doesn't scatter boxes into the inter-page gap
    // (getClientRects reports geometry for lines hidden by the table's
    // overflow:hidden).
    const pageEl = spanEl.closest('.layout-page') as HTMLElement | null;
    const pageIndex = pageEl ? Number(pageEl.dataset.pageNumber || 1) - 1 : 0;
    const pushClipped = (rect: { left: number; top: number; right: number; bottom: number }) => {
      const clipped = clipRectToTableWindow(spanEl, rect);
      if (!clipped) return;
      rects.push({
        x: clipped.left - overlayRect.left,
        y: clipped.top - overlayRect.top,
        width: clipped.right - clipped.left,
        height: clipped.bottom - clipped.top,
        pageIndex,
      });
    };

    if (pmStart === pmEnd) {
      const sliver = blankLineSliverRect(spanEl, overlayRect);
      if (sliver) rects.push(sliver);
      continue;
    }

    // Tab runs render as fixed-width spans with no text node — use their box.
    if (spanEl.classList.contains('layout-run-tab')) {
      pushClipped(spanEl.getBoundingClientRect());
      continue;
    }

    // Text node may be a direct child, or nested inside an <a> for hyperlinks.
    let textNode: Text | null = null;
    if (spanEl.firstChild?.nodeType === Node.TEXT_NODE) {
      textNode = spanEl.firstChild as Text;
    } else if (
      spanEl.firstChild?.nodeType === Node.ELEMENT_NODE &&
      (spanEl.firstChild as HTMLElement).tagName === 'A' &&
      spanEl.firstChild.firstChild?.nodeType === Node.TEXT_NODE
    ) {
      textNode = spanEl.firstChild.firstChild as Text;
    }
    if (!textNode) continue;
    const ownerDoc = spanEl.ownerDocument;
    if (!ownerDoc) continue;

    // Calculate character range within this span
    const startChar = Math.max(0, from - pmStart);
    const endChar = Math.min(textNode.length, to - pmStart);

    if (startChar >= endChar) continue;

    // Create range for the selected text
    const range = ownerDoc.createRange();
    range.setStart(textNode, startChar);
    range.setEnd(textNode, endChar);

    // Get all client rects (handles line wraps)
    for (const clientRect of Array.from(range.getClientRects())) {
      pushClipped(clientRect);
    }
  }

  for (const emptyRun of findBodyEmptyRuns(container)) {
    const range = emptyParagraphRangeFor(emptyRun);
    if (!range || range.pmEnd <= from || range.pmStart >= to) continue;
    const sliver = blankLineSliverRect(emptyRun, overlayRect);
    if (sliver) rects.push(sliver);
  }

  return rects;
}

/**
 * Get caret position from DOM for a PM position.
 *
 * @param container - The pages container element
 * @param pmPos - ProseMirror position
 * @param overlayRect - Bounding rect of the selection overlay
 * @returns Caret position in overlay coordinates, or null
 */
export interface DomCaretPosition {
  x: number;
  y: number;
  height: number;
  pageIndex: number;
}

/**
 * A table fragment clips its content with `overflow:hidden` + a fixed height,
 * translating rows for the visible page window. When a row breaks mid-content
 * across pages, the painter renders the SAME cell content in both fragments
 * with identical `data-pm-start`/`data-pm-end` — only one copy is on-window.
 * An element whose box lies outside its `.layout-table` fragment's box is the
 * off-page duplicate and must not win the caret lookup (issue #763).
 */
function isClippedOutOfTableFragment(el: HTMLElement, rect: DOMRect): boolean {
  // `:not(.layout-nested-table)` because only the page-fragment table carries
  // the `overflow:hidden` + window translate; a nested table has no clip, so
  // its box would never indicate the off-page duplicate (matches
  // `clipRectToTableWindow`).
  const tableEl = el.closest('.layout-table:not(.layout-nested-table)') as HTMLElement | null;
  if (!tableEl) return false;
  const t = tableEl.getBoundingClientRect();
  const mid = (rect.top + rect.bottom) / 2;
  return mid < t.top - 0.5 || mid > t.bottom + 0.5;
}

/** Build the caret position from a matched span (tab / text / empty run). */
function caretFromSpan(
  spanEl: HTMLElement,
  pmPos: number,
  pmStart: number,
  overlayRect: DOMRect,
  zoom: number
): DomCaretPosition {
  const pageEl = spanEl.closest('.layout-page') as HTMLElement | null;
  const pageIndex = pageEl ? Number(pageEl.dataset.pageNumber || 1) - 1 : 0;
  const lineEl = spanEl.closest('.layout-line');
  const lineHeight = lineEl ? (lineEl as HTMLElement).offsetHeight : 16;

  const textNode = spanEl.firstChild;
  const isTab = spanEl.classList.contains('layout-run-tab');
  if (isTab || !textNode || textNode.nodeType !== Node.TEXT_NODE) {
    // Tab or no text node — caret at the span's left edge.
    const spanRect = spanEl.getBoundingClientRect();
    return {
      x: spanRect.left - overlayRect.left,
      y: spanRect.top - overlayRect.top,
      height: lineHeight,
      pageIndex,
    };
  }

  const text = textNode as Text;
  const charIndex = Math.min(pmPos - pmStart, text.length);
  const ownerDoc = spanEl.ownerDocument!;
  const range = ownerDoc.createRange();
  range.setStart(text, charIndex);
  range.setEnd(text, charIndex);
  const rangeRect = range.getBoundingClientRect();

  // Caret height tracks the run AT the cursor, not the line box: on a line
  // with mixed font sizes the line box is as tall as the largest run, but
  // the caret should match the font where the insertion point sits, like
  // Word (#748). The collapsed range's rect already reports the per-run
  // font box (and its top is baseline-aligned), so use it; fall back to the
  // line height if the browser returns a zero-height rect.
  //
  // `rangeRect` comes from getBoundingClientRect, so its height is in screen
  // space (scaled by `zoom`); divide it back to layout px so the returned
  // height matches the offsetHeight-based fallbacks. Consumers paint the caret
  // inside the zoom-scaled container and so expect layout px (#928).
  return {
    x: rangeRect.left - overlayRect.left,
    y: rangeRect.top - overlayRect.top,
    height: rangeRect.height ? rangeRect.height / zoom : lineHeight,
    pageIndex,
  };
}

export function getCaretPositionFromDom(
  container: HTMLElement,
  pmPos: number,
  overlayRect: DOMRect,
  zoom: number = 1
): DomCaretPosition | null {
  // Body-scoped span lookup so HF spans don't mis-resolve the caret
  // when a body PM position happens to fall within an HF range.
  const spans = findBodyPmSpans(container);

  // A position that lands inside a table cell which breaks across pages can
  // match the SAME run painted in two fragments. Prefer the on-window copy;
  // remember the first match as a fallback if every copy is clipped out.
  let fallback: HTMLElement | null = null;
  let fallbackStart = 0;

  for (const span of Array.from(spans)) {
    const spanEl = span as HTMLElement;
    const pmStart = Number(spanEl.dataset.pmStart);
    const pmEnd = Number(spanEl.dataset.pmEnd);

    // Tab spans use an exclusive end to avoid boundary conflicts: a tab at
    // [5,6) means position 6 belongs to the next run, not the tab.
    const isTab = spanEl.classList.contains('layout-run-tab');
    const matches = isTab ? pmPos >= pmStart && pmPos < pmEnd : pmPos >= pmStart && pmPos <= pmEnd;
    if (!matches) continue;

    const spanRect = spanEl.getBoundingClientRect();
    if (isClippedOutOfTableFragment(spanEl, spanRect)) {
      if (!fallback) {
        fallback = spanEl;
        fallbackStart = pmStart;
      }
      continue;
    }
    return caretFromSpan(spanEl, pmPos, pmStart, overlayRect, zoom);
  }

  if (fallback) {
    return caretFromSpan(fallback, pmPos, fallbackStart, overlayRect, zoom);
  }

  // Check empty paragraphs (prefer an on-window copy here too).
  const paragraphs = container.querySelectorAll('.layout-paragraph');
  let pFallback: { el: HTMLElement; targetEl: HTMLElement } | null = null;
  for (const p of Array.from(paragraphs)) {
    const pEl = p as HTMLElement;
    const pStart = Number(pEl.dataset.pmStart);
    const pEnd = Number(pEl.dataset.pmEnd);

    if (pmPos >= pStart && pmPos <= pEnd) {
      const emptyRun = pEl.querySelector('.layout-empty-run');
      const targetEl = (emptyRun as HTMLElement) || pEl;
      const rect = targetEl.getBoundingClientRect();
      if (isClippedOutOfTableFragment(pEl, rect)) {
        if (!pFallback) pFallback = { el: pEl, targetEl };
        continue;
      }
      return caretFromParagraph(pEl, targetEl, overlayRect);
    }
  }
  if (pFallback) {
    return caretFromParagraph(pFallback.el, pFallback.targetEl, overlayRect);
  }

  return null;
}

/** Caret position for an empty paragraph / its empty-run placeholder. */
function caretFromParagraph(
  pEl: HTMLElement,
  targetEl: HTMLElement,
  overlayRect: DOMRect
): DomCaretPosition {
  const rect = targetEl.getBoundingClientRect();
  const pageEl = pEl.closest('.layout-page') as HTMLElement | null;
  const pageIndex = pageEl ? Number(pageEl.dataset.pageNumber || 1) - 1 : 0;
  const lineEl = targetEl.closest('.layout-line') || targetEl;
  const lineHeight = (lineEl as HTMLElement).offsetHeight || 16;

  return {
    x: rect.left - overlayRect.left,
    y: rect.top - overlayRect.top,
    height: lineHeight,
    pageIndex,
  };
}
