/**
 * Regression: a floating text box in a header/footer must NOT advance the
 * in-flow cursor. A centered banner (e.g. "For Internal Use") is positioned and
 * surrounding header text flows as if the box weren't there — so the in-flow
 * paragraphs sit beside/around it rather than being pushed below it. Pushing
 * them down made the header's in-flow content overflow the band and overlap the
 * body on every page (the COMPANY.LOGO regression after #709), and would shove
 * the body off a page for a tall anchored letterhead (#705). Inline and
 * topAndBottom boxes still stack on the cursor. Mirrors floating tables.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  renderHeaderFooterContent,
  type HeaderFooterContent,
  type HeaderFooterLayoutInfo,
} from '../renderPage/headerFooter';
import type {
  TextBoxBlock,
  ParagraphBlock,
  TextBoxMeasure,
  ParagraphMeasure,
} from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const ctx: RenderContext = { pageNumber: 1, totalPages: 1, section: 'body', contentWidth: 600 };
const layout: HeaderFooterLayoutInfo = {
  flowTop: 48,
  flowLeft: 72,
  contentWidth: 600,
  pageWidth: 744,
  pageHeight: 1123,
  margins: { top: 102, right: 72, bottom: 72, left: 72 },
};

const TB_HEIGHT = 33;
const PARA_HEIGHT = 18;

function textBoxBlock(displayMode: 'float' | 'inline' | 'block'): TextBoxBlock {
  return { kind: 'textBox', id: 'tb1', width: 214, height: TB_HEIGHT, content: [], displayMode };
}
const textBoxMeasure: TextBoxMeasure = {
  kind: 'textBox',
  width: 214,
  height: TB_HEIGHT,
  innerMeasures: [],
};

const paragraphBlock: ParagraphBlock = {
  kind: 'paragraph',
  id: 'p1',
  runs: [{ kind: 'text', text: 'TENDER NO:' }],
};
const paragraphMeasure: ParagraphMeasure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 10,
      width: 80,
      ascent: 12,
      descent: 4,
      lineHeight: 18,
    },
  ],
  totalHeight: PARA_HEIGHT,
};

function render(displayMode: 'float' | 'inline' | 'block'): number {
  const content: HeaderFooterContent = {
    blocks: [textBoxBlock(displayMode), paragraphBlock],
    measures: [textBoxMeasure, paragraphMeasure],
    height: TB_HEIGHT + PARA_HEIGHT,
    flowHeight: PARA_HEIGHT,
    visualTop: 0,
    visualBottom: TB_HEIGHT + PARA_HEIGHT,
  };
  const el = renderHeaderFooterContent(content, ctx, { document }, layout);
  // The paragraph fragment is the one carrying the body text.
  const para = Array.from(el.querySelectorAll<HTMLElement>('.layout-paragraph')).find((p) =>
    p.textContent?.includes('TENDER NO:')
  )!;
  return Math.round(parseFloat(para.style.top));
}

describe('HF floating text box does not advance the flow cursor (#729)', () => {
  test('float box: following paragraph stays at the top (not pushed below the box)', () => {
    expect(render('float')).toBe(0);
  });

  test('inline box still stacks: following paragraph is pushed below the box', () => {
    expect(render('inline')).toBe(TB_HEIGHT);
  });

  test('topAndBottom (block) box still stacks: following paragraph below the box', () => {
    expect(render('block')).toBe(TB_HEIGHT);
  });
});
