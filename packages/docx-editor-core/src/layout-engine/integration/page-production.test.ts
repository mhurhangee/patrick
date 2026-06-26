import { describe, test, expect } from 'bun:test';

import { layoutDocument } from '../index';
import type { FlowBlock, Measure, MeasuredLine, PageMargins } from '../types';

import {
  makeParagraphBlock,
  makeLine,
  makeParagraphMeasure,
  makeLayoutOptions,
  DEFAULT_PAGE_SIZE,
  DEFAULT_MARGINS,
} from './helpers';

describe('Layout Engine - Page Production', () => {
  describe('single page scenarios', () => {
    test('empty document produces one empty page', () => {
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      expect(layout.pages.length).toBe(1);
      expect(layout.pages[0].fragments.length).toBe(0);
      expect(layout.pageSize).toEqual(DEFAULT_PAGE_SIZE);
    });

    test('single paragraph fits on one page', () => {
      const blocks: FlowBlock[] = [makeParagraphBlock(0, 'Hello, World!', 1)];
      const measures: Measure[] = [makeParagraphMeasure([makeLine(0, 0, 0, 13, 100, 24)])];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      expect(layout.pages.length).toBe(1);
      expect(layout.pages[0].fragments.length).toBe(1);

      const fragment = layout.pages[0].fragments[0];
      expect(fragment.kind).toBe('paragraph');
      expect(fragment.blockId).toBe(0);
    });

    test('multiple paragraphs fit on one page', () => {
      const blocks: FlowBlock[] = [
        makeParagraphBlock(0, 'First paragraph', 1),
        makeParagraphBlock(1, 'Second paragraph', 18),
        makeParagraphBlock(2, 'Third paragraph', 36),
      ];
      const measures: Measure[] = [
        makeParagraphMeasure([makeLine(0, 0, 0, 15, 120, 24)]),
        makeParagraphMeasure([makeLine(0, 0, 0, 16, 130, 24)]),
        makeParagraphMeasure([makeLine(0, 0, 0, 15, 120, 24)]),
      ];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      expect(layout.pages.length).toBe(1);
      expect(layout.pages[0].fragments.length).toBe(3);
    });

    test('uses the next section page size and margins after a section break', () => {
      const firstSectionPage = { w: 800, h: 1000 };
      const secondSectionPage = { w: 1000, h: 800 };
      const firstSectionMargins: PageMargins = { top: 80, right: 80, bottom: 80, left: 80 };
      const secondSectionMargins: PageMargins = { top: 40, right: 120, bottom: 40, left: 120 };
      const blocks: FlowBlock[] = [
        makeParagraphBlock(0, 'Portrait section', 1),
        {
          kind: 'sectionBreak',
          id: 1,
          pageSize: firstSectionPage,
          margins: firstSectionMargins,
        },
        makeParagraphBlock(2, 'Landscape section', 20),
      ];
      const measures: Measure[] = [
        makeParagraphMeasure([makeLine(0, 0, 0, 16, 120, 24)]),
        { kind: 'sectionBreak' },
        makeParagraphMeasure([makeLine(0, 0, 0, 17, 120, 24)]),
      ];

      const layout = layoutDocument(
        blocks,
        measures,
        makeLayoutOptions({
          pageSize: firstSectionPage,
          margins: firstSectionMargins,
          finalPageSize: secondSectionPage,
          finalMargins: secondSectionMargins,
        })
      );

      expect(layout.pages.length).toBe(2);
      expect(layout.pages[0].size).toEqual(firstSectionPage);
      expect(layout.pages[0].margins).toEqual(firstSectionMargins);
      expect(layout.pages[1].size).toEqual(secondSectionPage);
      expect(layout.pages[1].margins).toEqual(secondSectionMargins);
      expect(layout.pages[1].fragments[0].x).toBe(secondSectionMargins.left);
    });

    test('paragraph positions are stacked vertically', () => {
      const blocks: FlowBlock[] = [
        makeParagraphBlock(0, 'First', 1),
        makeParagraphBlock(1, 'Second', 8),
      ];
      const measures: Measure[] = [
        makeParagraphMeasure([makeLine(0, 0, 0, 5, 50, 24)]),
        makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 24)]),
      ];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      const frag0 = layout.pages[0].fragments[0];
      const frag1 = layout.pages[0].fragments[1];

      // Second fragment should start below first
      expect(frag1.y).toBeGreaterThan(frag0.y);
    });
  });

  describe('multi-page scenarios', () => {
    test('content exceeding page height creates multiple pages', () => {
      // Create many paragraphs that exceed page content height
      // Content height = 1056 - 96 - 96 = 864px
      // Each paragraph = 100px line height
      // 9 paragraphs = 900px > 864px, should overflow to page 2
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      for (let i = 0; i < 10; i++) {
        blocks.push(makeParagraphBlock(i, `Paragraph ${i}`, i * 15));
        measures.push(makeParagraphMeasure([makeLine(0, 0, 0, 12, 100, 100)]));
      }

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      expect(layout.pages.length).toBe(2);
      // First page should have fragments
      expect(layout.pages[0].fragments.length).toBeGreaterThan(0);
      // Second page should have remaining fragments
      expect(layout.pages[1].fragments.length).toBeGreaterThan(0);
    });

    test('explicit page break creates new page', () => {
      const blocks: FlowBlock[] = [
        makeParagraphBlock(0, 'Before break', 1),
        { kind: 'pageBreak', id: 1, pmStart: 15, pmEnd: 16 },
        makeParagraphBlock(2, 'After break', 17),
      ];
      const measures: Measure[] = [
        makeParagraphMeasure([makeLine(0, 0, 0, 12, 100, 24)]),
        { kind: 'pageBreak' },
        makeParagraphMeasure([makeLine(0, 0, 0, 11, 90, 24)]),
      ];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      expect(layout.pages.length).toBe(2);
      expect(layout.pages[0].fragments.length).toBe(1);
      expect(layout.pages[1].fragments.length).toBe(1);
    });

    test('pageBreakBefore attribute creates new page', () => {
      const blocks: FlowBlock[] = [
        makeParagraphBlock(0, 'First paragraph', 1),
        makeParagraphBlock(1, 'Second with break', 18, { pageBreakBefore: true }),
      ];
      const measures: Measure[] = [
        makeParagraphMeasure([makeLine(0, 0, 0, 15, 120, 24)]),
        makeParagraphMeasure([makeLine(0, 0, 0, 17, 140, 24)]),
      ];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      expect(layout.pages.length).toBe(2);
      expect(layout.pages[0].fragments[0].blockId).toBe(0);
      expect(layout.pages[1].fragments[0].blockId).toBe(1);
    });
  });

  describe('paragraph splitting across pages', () => {
    test('long paragraph splits across pages', () => {
      // Create a paragraph with many lines that exceeds page height
      const lines: MeasuredLine[] = [];
      const lineHeight = 100;
      const numLines = 15; // 15 * 100 = 1500px > 864px content area

      for (let i = 0; i < numLines; i++) {
        lines.push(makeLine(0, i * 10, 0, (i + 1) * 10, 500, lineHeight));
      }

      const blocks: FlowBlock[] = [makeParagraphBlock(0, 'A'.repeat(150), 1)];
      const measures: Measure[] = [makeParagraphMeasure(lines)];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      expect(layout.pages.length).toBeGreaterThan(1);

      // First page fragment should have fromLine = 0
      const firstFrag = layout.pages[0].fragments[0];
      expect(firstFrag.kind).toBe('paragraph');
      if (firstFrag.kind === 'paragraph') {
        expect(firstFrag.fromLine).toBe(0);
        expect(firstFrag.toLine).toBeGreaterThan(0);
        expect(firstFrag.continuesOnNext).toBe(true);
      }

      // Second page fragment should continue
      const secondFrag = layout.pages[1].fragments[0];
      expect(secondFrag.kind).toBe('paragraph');
      if (secondFrag.kind === 'paragraph') {
        expect(secondFrag.continuesFromPrev).toBe(true);
      }
    });
  });

  describe('keepNext chain handling', () => {
    test('keepNext paragraphs stay together on new page', () => {
      // Create paragraphs that nearly fill first page
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      // Add filler paragraphs to fill most of the page
      for (let i = 0; i < 7; i++) {
        blocks.push(makeParagraphBlock(i, `Filler ${i}`, i * 10));
        measures.push(makeParagraphMeasure([makeLine(0, 0, 0, 10, 80, 100)]));
      }

      // Add keepNext paragraph that should pull next paragraph to new page
      blocks.push(makeParagraphBlock(7, 'KeepNext heading', 70, { keepNext: true }));
      measures.push(makeParagraphMeasure([makeLine(0, 0, 0, 16, 120, 100)]));

      // Add following paragraph
      blocks.push(makeParagraphBlock(8, 'Following paragraph', 88));
      measures.push(makeParagraphMeasure([makeLine(0, 0, 0, 19, 150, 100)]));

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      // The keepNext heading and following paragraph should be on same page
      const headingFrag = layout.pages.flatMap((p) => p.fragments).find((f) => f.blockId === 7);
      const followingFrag = layout.pages.flatMap((p) => p.fragments).find((f) => f.blockId === 8);

      // They should be on the same page
      const headingPage = layout.pages.findIndex((p) => p.fragments.includes(headingFrag!));
      const followingPage = layout.pages.findIndex((p) => p.fragments.includes(followingFrag!));

      expect(headingPage).toBe(followingPage);
    });
  });

  describe('margin and positioning', () => {
    test('fragments are positioned within content area', () => {
      const blocks: FlowBlock[] = [makeParagraphBlock(0, 'Test content', 1)];
      const measures: Measure[] = [makeParagraphMeasure([makeLine(0, 0, 0, 12, 100, 24)])];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      const fragment = layout.pages[0].fragments[0];

      // Fragment X should be at left margin
      expect(fragment.x).toBe(DEFAULT_MARGINS.left);

      // Fragment Y should be at top margin
      expect(fragment.y).toBe(DEFAULT_MARGINS.top);
    });

    test('content width is page width minus margins', () => {
      const blocks: FlowBlock[] = [makeParagraphBlock(0, 'Test', 1)];
      const measures: Measure[] = [makeParagraphMeasure([makeLine(0, 0, 0, 4, 50, 24)])];

      const layout = layoutDocument(blocks, measures, makeLayoutOptions());

      const fragment = layout.pages[0].fragments[0];
      const expectedWidth = DEFAULT_PAGE_SIZE.w - DEFAULT_MARGINS.left - DEFAULT_MARGINS.right;

      expect(fragment.width).toBe(expectedWidth);
    });
  });
});
