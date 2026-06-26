import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type {
  FootnoteContent,
  Page,
  ParagraphBlock,
  ParagraphMeasure,
} from '../../layout-engine/types';
import { FOOTNOTE_SEPARATOR_HEIGHT } from '../../layout-bridge/footnoteLayout';
import { renderPage } from '../renderPage';
import type { FootnoteRenderItem } from '../renderPage/footnotes';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function makeFootnoteContent(id: number, text: string, height = 12): FootnoteContent {
  const block: ParagraphBlock = {
    kind: 'paragraph',
    id: `fn-p${id}`,
    runs: [{ kind: 'text', text, fontSize: 8, fontFamily: 'Calibri' }],
  };
  const measure: ParagraphMeasure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: text.length,
        width: 120,
        ascent: 9,
        descent: 3,
        lineHeight: height,
      },
    ],
    totalHeight: height,
  };
  return { id, displayNumber: id, blocks: [block], measures: [measure], height };
}

function fnItem(id: number, text: string): FootnoteRenderItem {
  return { displayNumber: String(id), text, content: makeFootnoteContent(id, text) };
}

describe('renderPage footnote columns (w15:footnoteColumns)', () => {
  test('lays four footnotes out in two side-by-side balanced columns', () => {
    const footnoteArea = [
      fnItem(1, 'first footnote'),
      fnItem(2, 'second footnote'),
      fnItem(3, 'third footnote'),
      fnItem(4, 'fourth footnote'),
    ];
    const page: Page = {
      number: 1,
      fragments: [],
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      size: { w: 800, h: 400 },
      footnoteColumns: 2,
    };

    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, footnoteArea }
    );

    const area = el.querySelector<HTMLElement>('.layout-footnote-area');
    expect(area).toBeTruthy();

    // Two side-by-side columns under the separator.
    const columnsRow = area!.querySelector<HTMLElement>('.layout-footnote-columns');
    expect(columnsRow).toBeTruthy();
    expect(columnsRow!.style.display).toBe('flex');
    const columns = area!.querySelectorAll('.layout-footnote-column');
    expect(columns).toHaveLength(2);

    // All four footnotes painted, two per column, in order.
    expect(area!.textContent).toContain('first footnote');
    expect(area!.textContent).toContain('fourth footnote');
    expect(columns[0].querySelectorAll('.layout-footnote-content')).toHaveLength(2);
    expect(columns[1].querySelectorAll('.layout-footnote-content')).toHaveLength(2);

    // The area is reserved at the balanced height (tallest column = 2 × 12),
    // not the 4 × 12 sum: top sits lower on the page than a single column would.
    const balanced = 2 * 12 + FOOTNOTE_SEPARATOR_HEIGHT;
    expect(area!.style.top).toBe(
      `${page.size.h - page.margins.top - page.margins.bottom - balanced}px`
    );
  });

  test('a single-column page is unaffected (no columns wrapper)', () => {
    const page: Page = {
      number: 1,
      fragments: [],
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      size: { w: 800, h: 400 },
      footnoteColumns: 1,
    };
    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, footnoteArea: [fnItem(1, 'lonely footnote')] }
    );
    const area = el.querySelector<HTMLElement>('.layout-footnote-area');
    expect(area).toBeTruthy();
    expect(area!.querySelector('.layout-footnote-columns')).toBeNull();
    expect(area!.querySelectorAll('.layout-footnote-content')).toHaveLength(1);
  });
});
