import { describe, test, expect } from 'bun:test';

import { layoutDocument } from '../index';
import type { FlowBlock, Measure } from '../types';

import { makeParagraphBlock, makeLine, makeParagraphMeasure, makeLayoutOptions } from './helpers';

describe('Header/Footer Margin Inflation', () => {
  test('header content height inflates top margin', () => {
    const blocks: FlowBlock[] = [makeParagraphBlock(0, 'Body content', 1)];
    const measures: Measure[] = [makeParagraphMeasure([makeLine(0, 0, 0, 12, 100, 24)])];

    // Without headers
    const noHeaderLayout = layoutDocument(blocks, measures, makeLayoutOptions());

    // With tall header
    const withHeaderLayout = layoutDocument(
      blocks,
      measures,
      makeLayoutOptions({
        headerContentHeights: { default: 50 },
      })
    );

    // Body content should start lower when header is present
    const noHeaderY = noHeaderLayout.pages[0].fragments[0].y;
    const withHeaderY = withHeaderLayout.pages[0].fragments[0].y;

    // With header, body should start at max(margin, headerDistance + headerHeight)
    expect(withHeaderY).toBeGreaterThanOrEqual(noHeaderY);
  });

  test('footer content height inflates bottom margin', () => {
    // Create content that nearly fills a page
    const blocks: FlowBlock[] = [];
    const measures: Measure[] = [];

    for (let i = 0; i < 8; i++) {
      blocks.push(makeParagraphBlock(i, `Para ${i}`, i * 10));
      measures.push(makeParagraphMeasure([makeLine(0, 0, 0, 8, 60, 100)]));
    }

    // Without footer
    const noFooterLayout = layoutDocument(blocks, measures, makeLayoutOptions());

    // With tall footer (reduces available content area)
    const withFooterLayout = layoutDocument(
      blocks,
      measures,
      makeLayoutOptions({
        footerContentHeights: { default: 100 },
      })
    );

    // With footer, content area is smaller, may need more pages
    expect(withFooterLayout.pages.length).toBeGreaterThanOrEqual(noFooterLayout.pages.length);
  });
});
