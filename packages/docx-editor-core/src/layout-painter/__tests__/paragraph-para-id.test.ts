import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderParagraphFragment } from '../renderParagraph';
import type {
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
} from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const context: RenderContext = { pageNumber: 1, totalPages: 1, section: 'body' };
const measure: ParagraphMeasure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 4,
      width: 40,
      ascent: 10,
      descent: 3,
      lineHeight: 13,
    },
  ],
  totalHeight: 13,
};
const fragment: ParagraphFragment = {
  kind: 'paragraph',
  blockId: 'block-1',
  x: 0,
  y: 0,
  width: 200,
  height: 13,
  fromLine: 0,
  toLine: 1,
};

describe('renderParagraphFragment — stable paragraph identity', () => {
  test('emits data-para-id when the paragraph block has a paraId', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'block-1',
      paraId: '1A2B3C4D',
      runs: [{ kind: 'text', text: 'Test' }],
    };

    const el = renderParagraphFragment(fragment, block, measure, context);
    expect(el.dataset.paraId).toBe('1A2B3C4D');
  });

  test('omits data-para-id when no stable id is available', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'block-1',
      runs: [{ kind: 'text', text: 'Test' }],
    };

    const el = renderParagraphFragment(fragment, block, measure, context);
    expect(el.dataset.paraId).toBeUndefined();
  });
});
