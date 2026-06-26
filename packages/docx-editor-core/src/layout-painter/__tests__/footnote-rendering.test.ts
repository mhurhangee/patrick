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

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function makeFootnoteContent(text: string): FootnoteContent {
  const block: ParagraphBlock = {
    kind: 'paragraph',
    id: 'fn-p1',
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
        lineHeight: 12,
      },
    ],
    totalHeight: 12,
  };

  return {
    id: 1,
    displayNumber: 1,
    blocks: [block],
    measures: [measure],
    height: 12,
  };
}

describe('renderPage footnote area', () => {
  test('renders measured footnote content at the reserved page-bottom position', () => {
    const footnoteContent = makeFootnoteContent('1  measured sample footnote');
    const reservedHeight = footnoteContent.height + FOOTNOTE_SEPARATOR_HEIGHT;
    const page: Page = {
      number: 1,
      fragments: [],
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      size: { w: 400, h: 300 },
      footnoteReservedHeight: reservedHeight,
    };

    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      {
        document,
        footnoteArea: [
          {
            displayNumber: '1',
            text: 'plain fallback should not be painted',
            content: footnoteContent,
          },
        ],
      }
    );

    const area = el.querySelector<HTMLElement>('.layout-footnote-area');
    const measured = area?.querySelector<HTMLElement>('.layout-footnote-content');

    expect(area).toBeTruthy();
    expect(area!.style.top).toBe(
      `${page.size.h - page.margins.top - page.margins.bottom - reservedHeight}px`
    );
    expect(measured).toBeTruthy();
    expect(measured!.style.height).toBe(`${footnoteContent.height}px`);
    expect(area!.textContent).toContain('measured sample footnote');
    expect(area!.textContent).not.toContain('plain fallback');
  });
});
