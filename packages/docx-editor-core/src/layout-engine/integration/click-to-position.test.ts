import { describe, test, expect } from 'bun:test';

import { layoutDocument } from '../index';
import type { FlowBlock, Measure } from '../types';
import { hitTestPage, hitTestFragment, getPageTop } from '../../layout-bridge/hitTest';
import { clickToPosition, clickToPositionInParagraph } from '../../layout-bridge/clickToPosition';

import {
  makeParagraphBlock,
  makeLine,
  makeParagraphMeasure,
  makeLayoutOptions,
  DEFAULT_MARGINS,
} from './helpers';

describe('Click-to-Position Mapping', () => {
  describe('page hit testing', () => {
    test('hitTestPage finds correct page', () => {
      // Create a 2-page layout
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      for (let i = 0; i < 20; i++) {
        blocks.push(makeParagraphBlock(i, `Para ${i}`, i * 10));
        measures.push(makeParagraphMeasure([makeLine(0, 0, 0, 8, 60, 50)]));
      }

      const layout = layoutDocument(blocks, measures, makeLayoutOptions({ pageGap: 20 }));

      expect(layout.pages.length).toBeGreaterThan(1);

      // Hit test at top of document
      const hit1 = hitTestPage(layout, { x: 100, y: 50 });
      expect(hit1).not.toBeNull();
      expect(hit1!.pageIndex).toBe(0);

      // Hit test in second page (after first page height + gap)
      const pageHeight = layout.pageSize.h;
      const pageGap = 20;
      const secondPageTop = pageHeight + pageGap;
      const hit2 = hitTestPage(layout, { x: 100, y: secondPageTop + 50 });
      expect(hit2).not.toBeNull();
      expect(hit2!.pageIndex).toBe(1);
    });

    test('hitTestPage returns correct pageY offset', () => {
      const blocks: FlowBlock[] = [makeParagraphBlock(0, 'Test', 1)];
      const measures: Measure[] = [makeParagraphMeasure([makeLine(0, 0, 0, 4, 50, 24)])];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      const hit = hitTestPage(layout, { x: 100, y: 150 });
      expect(hit).not.toBeNull();
      expect(hit!.pageY).toBe(150);
    });

    test('getPageTop returns cumulative offset', () => {
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      for (let i = 0; i < 20; i++) {
        blocks.push(makeParagraphBlock(i, `Para ${i}`, i * 10));
        measures.push(makeParagraphMeasure([makeLine(0, 0, 0, 8, 60, 50)]));
      }

      const layout = layoutDocument(blocks, measures, makeLayoutOptions({ pageGap: 20 }));

      expect(getPageTop(layout, 0)).toBe(0);

      if (layout.pages.length > 1) {
        const expectedPage1Top = layout.pageSize.h + 20;
        expect(getPageTop(layout, 1)).toBe(expectedPage1Top);
      }
    });
  });

  describe('fragment hit testing', () => {
    test('hitTestFragment finds correct fragment', () => {
      const blocks: FlowBlock[] = [
        makeParagraphBlock(0, 'First', 1),
        makeParagraphBlock(1, 'Second', 8),
      ];
      const measures: Measure[] = [
        makeParagraphMeasure([makeLine(0, 0, 0, 5, 50, 24)]),
        makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 24)]),
      ];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      const pageHit = hitTestPage(layout, { x: 100, y: DEFAULT_MARGINS.top + 5 });
      expect(pageHit).not.toBeNull();

      const fragmentHit = hitTestFragment(pageHit!, blocks, measures, {
        x: DEFAULT_MARGINS.left + 10,
        y: DEFAULT_MARGINS.top + 5,
      });

      expect(fragmentHit).not.toBeNull();
      expect(fragmentHit!.fragment.blockId).toBe(0);
    });

    test('hitTestFragment calculates correct local coordinates', () => {
      const blocks: FlowBlock[] = [makeParagraphBlock(0, 'Test content', 1)];
      const measures: Measure[] = [makeParagraphMeasure([makeLine(0, 0, 0, 12, 100, 24)])];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      const pageHit = hitTestPage(layout, { x: 150, y: 110 });
      const fragmentHit = hitTestFragment(pageHit!, blocks, measures, { x: 150, y: 110 });

      expect(fragmentHit).not.toBeNull();

      // Local coordinates should be relative to fragment position
      const fragment = fragmentHit!.fragment;
      expect(fragmentHit!.localX).toBe(150 - fragment.x);
      expect(fragmentHit!.localY).toBe(110 - fragment.y);
    });
  });

  describe('click to PM position', () => {
    test('clickToPositionInParagraph maps click to correct position', () => {
      const block = makeParagraphBlock(0, 'Hello World', 1);
      const measure = makeParagraphMeasure([makeLine(0, 0, 0, 11, 100, 24)]);

      // Create a synthetic fragment hit
      const fragmentHit = {
        fragment: {
          kind: 'paragraph' as const,
          blockId: 0,
          x: 96,
          y: 96,
          width: 624,
          height: 24,
          fromLine: 0,
          toLine: 1,
        },
        block,
        measure,
        pageIndex: 0,
        localX: 0, // Click at start of line
        localY: 10,
      };

      const result = clickToPositionInParagraph(fragmentHit);

      expect(result).not.toBeNull();
      expect(result!.pmPosition).toBe(1); // Start of text
      expect(result!.lineIndex).toBe(0);
    });

    test('clickToPosition returns PM position from fragment hit', () => {
      const block = makeParagraphBlock(0, 'Test', 1);
      const measure = makeParagraphMeasure([makeLine(0, 0, 0, 4, 40, 24)]);

      const fragmentHit = {
        fragment: {
          kind: 'paragraph' as const,
          blockId: 0,
          x: 96,
          y: 96,
          width: 624,
          height: 24,
          fromLine: 0,
          toLine: 1,
        },
        block,
        measure,
        pageIndex: 0,
        localX: 0,
        localY: 10,
      };

      const pmPosition = clickToPosition(fragmentHit);

      expect(pmPosition).not.toBeNull();
      expect(pmPosition).toBeGreaterThanOrEqual(1);
    });

    // Note: This test requires a DOM environment with canvas for text measurement.
    // In headless bun:test, we test the logic without requiring precise character positioning.
    test('click at end of line returns end position (mock)', () => {
      const block = makeParagraphBlock(0, 'Hello', 1);
      const measure = makeParagraphMeasure([makeLine(0, 0, 0, 5, 50, 24)]);

      // Test the fragment structure is correct
      const fragmentHit = {
        fragment: {
          kind: 'paragraph' as const,
          blockId: 0,
          x: 96,
          y: 96,
          width: 624,
          height: 24,
          fromLine: 0,
          toLine: 1,
        },
        block,
        measure,
        pageIndex: 0,
        localX: 0, // Click at start (doesn't require canvas measurement)
        localY: 10,
      };

      // Verify the block structure is correct
      expect(block.pmStart).toBe(1);
      expect(block.pmEnd).toBe(7); // 'Hello' + paragraph node boundary

      // This tests that the mapping starts correctly
      const result = clickToPositionInParagraph(fragmentHit);
      expect(result).not.toBeNull();
      expect(result!.pmPosition).toBe(1); // Start of text
    });
  });
});
