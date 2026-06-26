/**
 * `applyCellSelectionHighlight` — paints `.layout-table-cell-selected` onto
 * painted cells matching a CellSelection. The selection is duck-typed
 * (`$anchorCell` / `forEachCell`), so tests pass a minimal stand-in rather
 * than constructing a real prosemirror-tables CellSelection.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { EditorState } from 'prosemirror-state';

import { applyCellSelectionHighlight } from '../cellSelectionHighlight';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

/** Build a page with body + footer tables; each cell carries data-pm-start. */
function buildPage(): HTMLElement {
  document.body.innerHTML = `
    <div class="paged-editor__pages">
      <div class="layout-page">
        <div class="layout-page-content">
          <div class="layout-table-cell" data-pm-start="10" id="b10"></div>
          <div class="layout-table-cell" data-pm-start="20" id="b20"></div>
          <div class="layout-table-cell" data-pm-start="30" id="b30"></div>
        </div>
        <div class="layout-page-footer">
          <div class="layout-table-cell" data-pm-start="10" id="f10"></div>
        </div>
      </div>
    </div>`;
  return document.querySelector('.paged-editor__pages') as HTMLElement;
}

/** A fake EditorState whose selection is a CellSelection over [ranges]. */
function cellSelectionState(ranges: Array<[number, number]>): EditorState {
  return {
    selection: {
      $anchorCell: {},
      forEachCell: (cb: (node: { nodeSize: number }, pos: number) => void) => {
        for (const [from, to] of ranges) cb({ nodeSize: to - from }, from);
      },
    },
  } as unknown as EditorState;
}

/** A fake EditorState with a plain (non-cell) selection. */
function textSelectionState(): EditorState {
  return { selection: {} } as unknown as EditorState;
}

describe('applyCellSelectionHighlight', () => {
  test('highlights cells whose pmStart falls in a selected range', () => {
    const pages = buildPage();
    // Select cells at pos 10 and 20 (ranges cover [10,11) and [20,21)).
    applyCellSelectionHighlight(
      pages,
      cellSelectionState([
        [10, 11],
        [20, 21],
      ])
    );
    expect(document.getElementById('b10')!.classList.contains('layout-table-cell-selected')).toBe(
      true
    );
    expect(document.getElementById('b20')!.classList.contains('layout-table-cell-selected')).toBe(
      true
    );
    expect(document.getElementById('b30')!.classList.contains('layout-table-cell-selected')).toBe(
      false
    );
  });

  test('scopes to body — does not light up footer cells at the same pm pos', () => {
    const pages = buildPage();
    applyCellSelectionHighlight(pages, cellSelectionState([[10, 11]]), { scope: 'body' });
    expect(document.getElementById('b10')!.classList.contains('layout-table-cell-selected')).toBe(
      true
    );
    // Footer cell at pos 10 lives in a separate PM doc — must stay untouched.
    expect(document.getElementById('f10')!.classList.contains('layout-table-cell-selected')).toBe(
      false
    );
  });

  test('a non-cell selection clears any prior highlight', () => {
    const pages = buildPage();
    applyCellSelectionHighlight(pages, cellSelectionState([[10, 11]]));
    expect(document.getElementById('b10')!.classList.contains('layout-table-cell-selected')).toBe(
      true
    );
    applyCellSelectionHighlight(pages, textSelectionState());
    expect(document.getElementById('b10')!.classList.contains('layout-table-cell-selected')).toBe(
      false
    );
  });

  test('clearing a footer selection does not wipe a body highlight', () => {
    const pages = buildPage();
    applyCellSelectionHighlight(pages, cellSelectionState([[10, 11]]), { scope: 'body' });
    // Footer pass with no cell selection clears only the footer scope.
    applyCellSelectionHighlight(pages, textSelectionState(), { scope: 'footer' });
    expect(document.getElementById('b10')!.classList.contains('layout-table-cell-selected')).toBe(
      true
    );
  });
});
