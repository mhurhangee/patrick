import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { getSelectionRectsFromDom } from '../clickToPositionDom';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function buildBlankRow(pmPos: number): HTMLElement {
  document.body.innerHTML = `
    <div class="layout-page" data-page-number="1">
      <div class="layout-page-content">
        <div class="layout-paragraph">
          <div class="layout-line">
            <span class="layout-run" data-pm-start="${pmPos}" data-pm-end="${pmPos}">\u200B</span>
          </div>
        </div>
      </div>
    </div>`;
  return document.body.firstElementChild as HTMLElement;
}

function buildEmptyParagraph(pmStart: number, pmEnd: number): HTMLElement {
  document.body.innerHTML = `
    <div class="layout-page" data-page-number="1">
      <div class="layout-page-content">
        <div class="layout-paragraph" data-pm-start="${pmStart}" data-pm-end="${pmEnd}">
          <div class="layout-line">
            <span class="layout-run layout-empty-run">&nbsp;</span>
          </div>
        </div>
      </div>
    </div>`;
  return document.body.firstElementChild as HTMLElement;
}

describe('getSelectionRectsFromDom — blank-line marker', () => {
  test('emits a fixed-width sliver for a zero-width marker inside the selection', () => {
    const container = buildBlankRow(7);

    const rects = getSelectionRectsFromDom(container, 5, 10, new DOMRect(0, 0, 0, 0));

    expect(rects).toHaveLength(1);
    expect(rects[0].width).toBe(4);
  });

  test('emits nothing for a blank-line marker outside the selection', () => {
    const container = buildBlankRow(7);

    const rects = getSelectionRectsFromDom(container, 0, 3, new DOMRect(0, 0, 0, 0));

    expect(rects).toHaveLength(0);
  });
});

describe('getSelectionRectsFromDom — empty paragraph (unpositioned empty-run)', () => {
  test('emits a fixed-width sliver from the paragraph position when the selection spans it', () => {
    const container = buildEmptyParagraph(7, 9);

    const rects = getSelectionRectsFromDom(container, 5, 12, new DOMRect(0, 0, 0, 0));

    expect(rects).toHaveLength(1);
    expect(rects[0].width).toBe(4);
  });

  test('emits nothing when the empty paragraph is outside the selection', () => {
    const container = buildEmptyParagraph(7, 9);

    const rects = getSelectionRectsFromDom(container, 0, 3, new DOMRect(0, 0, 0, 0));

    expect(rects).toHaveLength(0);
  });
});
