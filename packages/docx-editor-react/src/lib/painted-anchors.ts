/**
 * Painted-DOM anchor geometry — reads the engine's painted pages (the
 * `.paged-editor__pages` / `data-pm-start|end` contract) to position UI
 * (the floating comment button, the context-menu comment action) relative to
 * the editor's scroll container.
 */

import { findBodyPmAnchors } from '@eigenpal/docx-editor-core/layout-bridge';

/**
 * Y position (relative to parentEl) of the painted element containing `pmPos`.
 * Queries all elements with `data-pm-start` — spans, divs, imgs — not just
 * spans, since table cell content uses div fragments.
 */
export function findSelectionYPosition(
  scrollContainer: HTMLElement | null,
  parentEl: HTMLElement | null,
  pmPos: number
): number | null {
  if (!scrollContainer || !parentEl) return null;
  const pagesEl = scrollContainer.querySelector('.paged-editor__pages');
  if (!pagesEl) return null;
  for (const el of findBodyPmAnchors(pagesEl)) {
    const pmStart = Number(el.dataset.pmStart);
    const pmEnd = Number(el.dataset.pmEnd);
    if (pmPos >= pmStart && pmPos <= pmEnd) {
      return el.getBoundingClientRect().top - parentEl.getBoundingClientRect().top;
    }
  }
  return null;
}
