/**
 * Visible boundary chrome for block-level content controls (`w:sdt`) in the
 * paged view. Kept out of `renderPage.ts` so that file stays under its
 * line cap; the body painter calls `renderSdtBoundaryBoxes` once per page.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { Page, Fragment, SdtGroup } from '../layout-engine/types';

/**
 * Draw the visible boundary for each block-level content control on a page.
 *
 * The body lays fragments out as flat, absolutely-positioned siblings (there
 * is no wrapper element per control), so the boundary is an overlay box sized
 * to the union of the control's fragments — at content width, matching Word.
 * Every depth gets its own box (a nested control draws inside its parent's),
 * and a control split across pages simply draws one box per page. The box
 * carries the control identity (`data-sdt-*`) and a corner label chip that
 * CSS reveals on hover/focus; `pointer-events: none` keeps it from stealing
 * clicks from the editable content underneath.
 */
export function renderSdtBoundaryBoxes(
  page: Page,
  contentEl: HTMLElement,
  contentWidth: number,
  sdtGroupsOf: (frag: Fragment) => SdtGroup[],
  doc: Document
): void {
  // Accumulate vertical extent per (groupId @ depth) in fragment order.
  type Acc = { group: SdtGroup; depth: number; top: number; bottom: number };
  const boxes = new Map<string, Acc>();
  const order: string[] = [];

  for (const fragment of page.fragments) {
    const groups = sdtGroupsOf(fragment);
    if (groups.length === 0 || !('height' in fragment)) continue;
    const top = fragment.y - page.margins.top;
    const bottom = top + (fragment as { height: number }).height;
    groups.forEach((group, depth) => {
      // Key by id AND depth so a re-entered id can't merge across nesting.
      const key = `${depth}:${group.id}`;
      const acc = boxes.get(key);
      if (acc) {
        acc.top = Math.min(acc.top, top);
        acc.bottom = Math.max(acc.bottom, bottom);
      } else {
        boxes.set(key, { group, depth, top, bottom });
        order.push(key);
      }
    });
  }

  // Inset each nesting level slightly so a nested box sits inside its parent.
  const PAD = 2;
  const boxEls: HTMLElement[] = [];
  for (const key of order) {
    const { group, depth, top, bottom } = boxes.get(key)!;
    const inset = depth * (PAD + 1);
    const box = doc.createElement('div');
    box.className = 'layout-block-sdt-box';
    box.dataset.sdtGroupId = group.id;
    box.dataset.sdtType = group.sdtType;
    box.dataset.sdtDepth = String(depth + 1);
    if (group.tag != null) box.dataset.sdtTag = group.tag;
    if (group.alias != null) box.dataset.sdtAlias = group.alias;
    if (group.lock != null) box.dataset.sdtLock = group.lock;
    box.style.position = 'absolute';
    box.style.left = `${inset}px`;
    box.style.top = `${top - PAD}px`;
    box.style.width = `${contentWidth - inset * 2}px`;
    box.style.height = `${bottom - top + PAD * 2}px`;

    // Corner label chip — the control's alias, else its tag, else its type.
    const labelText = group.alias || group.tag || group.sdtType;
    if (labelText) {
      const label = doc.createElement('span');
      label.className = 'layout-block-sdt-label';
      label.textContent = labelText;
      box.appendChild(label);
    }

    contentEl.appendChild(box);
    boxEls.push(box);
  }

  attachSdtHoverReveal(contentEl, boxEls);
}

/**
 * Reveal a control's boundary (border + label chip) only while the pointer is
 * over THAT control — Word-style, rather than lighting up every box at once.
 * The boxes are `pointer-events: none` so they never steal clicks, which means
 * `:hover` can't fire on them; instead we hit-test the pointer against each
 * box's rect and toggle `.is-active`. A point inside a nested box is also
 * inside its parent, so nesting reveals both. Listeners live on the freshly
 * built `contentEl`, so they're discarded with it on the next render (no leak).
 */
function attachSdtHoverReveal(contentEl: HTMLElement, boxEls: HTMLElement[]): void {
  if (boxEls.length === 0 || typeof contentEl.addEventListener !== 'function') return;
  const setActive = (clientX: number, clientY: number): void => {
    for (const b of boxEls) {
      const r = b.getBoundingClientRect();
      const inside =
        clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
      if (inside !== b.classList.contains('is-active')) b.classList.toggle('is-active', inside);
    }
  };
  // Coalesce mousemove into one rect-read pass per animation frame, so a fast
  // pointer over a control-dense page doesn't force a reflow per event.
  const raf =
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => cb();
  let queued = false;
  let lastX = 0;
  let lastY = 0;
  contentEl.addEventListener('mousemove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (queued) return;
    queued = true;
    raf(() => {
      queued = false;
      setActive(lastX, lastY);
    });
  });
  contentEl.addEventListener('mouseleave', () => {
    for (const b of boxEls) b.classList.remove('is-active');
  });
}

/**
 * Group ids of every block-level content control that encloses the given
 * selection — used to keep a control's boundary visible while the caret is
 * inside it (Word-style focus), independent of mouse hover. The id matches
 * `toFlowBlocks`' `sdt@${pos}` scheme, where `pos` is the SDT node's position;
 * `$pos.before(d)` yields exactly that for an ancestor at depth `d`, so the
 * ids line up with the painted boxes' `data-sdt-group-id`. Both ends of a
 * range are collected so a selection straddling a control still lights it up.
 */
export function enclosingSdtGroupIds(doc: PMNode, from: number, to: number): Set<string> {
  const ids = new Set<string>();
  const max = doc.content.size;
  const collect = (pos: number): void => {
    const $pos = doc.resolve(Math.max(0, Math.min(pos, max)));
    for (let d = 1; d <= $pos.depth; d++) {
      if ($pos.node(d).type.name === 'blockSdt') ids.add(`sdt@${$pos.before(d)}`);
    }
  };
  collect(from);
  if (to !== from) collect(to);
  return ids;
}

/**
 * Toggle the `.is-focused` reveal class on the painted boundary boxes whose
 * control encloses the caret. Kept separate from the hover-driven `.is-active`
 * class so the two reveal paths never clear each other.
 */
export function applySdtFocus(container: HTMLElement, focusedIds: Set<string>): void {
  const boxes = container.querySelectorAll<HTMLElement>('.layout-block-sdt-box');
  for (const box of boxes) {
    const id = box.dataset.sdtGroupId;
    const on = id != null && focusedIds.has(id);
    if (on !== box.classList.contains('is-focused')) box.classList.toggle('is-focused', on);
  }
}
