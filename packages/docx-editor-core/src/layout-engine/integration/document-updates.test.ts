import { describe, test, expect } from 'bun:test';

import { layoutDocument } from '../index';
import type { FlowBlock, Measure } from '../types';

import { makeParagraphBlock, makeLine, makeParagraphMeasure, makeLayoutOptions } from './helpers';

describe('Document Updates', () => {
  describe('adding content', () => {
    test('adding paragraph increases fragment count', () => {
      // Initial state: 1 paragraph
      const initialBlocks: FlowBlock[] = [makeParagraphBlock(0, 'Initial', 1)];
      const initialMeasures: Measure[] = [makeParagraphMeasure([makeLine(0, 0, 0, 7, 60, 24)])];

      const initialLayout = layoutDocument(initialBlocks, initialMeasures, makeLayoutOptions());

      // After adding paragraph: 2 paragraphs
      const updatedBlocks: FlowBlock[] = [
        makeParagraphBlock(0, 'Initial', 1),
        makeParagraphBlock(1, 'Added', 10),
      ];
      const updatedMeasures: Measure[] = [
        makeParagraphMeasure([makeLine(0, 0, 0, 7, 60, 24)]),
        makeParagraphMeasure([makeLine(0, 0, 0, 5, 50, 24)]),
      ];

      const updatedLayout = layoutDocument(updatedBlocks, updatedMeasures, makeLayoutOptions());

      expect(updatedLayout.pages[0].fragments.length).toBe(
        initialLayout.pages[0].fragments.length + 1
      );
    });

    test('adding enough content creates new page', () => {
      // Start with content that fits on one page
      const smallBlocks: FlowBlock[] = [makeParagraphBlock(0, 'Small', 1)];
      const smallMeasures: Measure[] = [makeParagraphMeasure([makeLine(0, 0, 0, 5, 50, 24)])];

      const smallLayout = layoutDocument(smallBlocks, smallMeasures, makeLayoutOptions());
      expect(smallLayout.pages.length).toBe(1);

      // Add content that overflows
      const largeBlocks: FlowBlock[] = [];
      const largeMeasures: Measure[] = [];

      for (let i = 0; i < 20; i++) {
        largeBlocks.push(makeParagraphBlock(i, `Para ${i}`, i * 10));
        largeMeasures.push(makeParagraphMeasure([makeLine(0, 0, 0, 8, 60, 50)]));
      }

      const largeLayout = layoutDocument(largeBlocks, largeMeasures, makeLayoutOptions());
      expect(largeLayout.pages.length).toBeGreaterThan(1);
    });
  });

  describe('removing content', () => {
    test('removing paragraph decreases fragment count', () => {
      const blocks: FlowBlock[] = [
        makeParagraphBlock(0, 'First', 1),
        makeParagraphBlock(1, 'Second', 8),
      ];
      const measures: Measure[] = [
        makeParagraphMeasure([makeLine(0, 0, 0, 5, 50, 24)]),
        makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 24)]),
      ];

      const beforeLayout = layoutDocument(blocks, measures, makeLayoutOptions());

      // Remove second paragraph
      const afterBlocks = blocks.slice(0, 1);
      const afterMeasures = measures.slice(0, 1);

      const afterLayout = layoutDocument(afterBlocks, afterMeasures, makeLayoutOptions());

      expect(afterLayout.pages[0].fragments.length).toBe(
        beforeLayout.pages[0].fragments.length - 1
      );
    });

    test('removing content can reduce page count', () => {
      // Create multi-page document
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      for (let i = 0; i < 20; i++) {
        blocks.push(makeParagraphBlock(i, `Para ${i}`, i * 10));
        measures.push(makeParagraphMeasure([makeLine(0, 0, 0, 8, 60, 50)]));
      }

      const multiPageLayout = layoutDocument(blocks, measures, makeLayoutOptions());
      expect(multiPageLayout.pages.length).toBeGreaterThan(1);

      // Remove most content
      const smallBlocks = blocks.slice(0, 2);
      const smallMeasures = measures.slice(0, 2);

      const singlePageLayout = layoutDocument(smallBlocks, smallMeasures, makeLayoutOptions());
      expect(singlePageLayout.pages.length).toBe(1);
    });
  });

  describe('modifying content', () => {
    test('changing text updates PM positions in layout', () => {
      // Original paragraph
      const originalBlock = makeParagraphBlock(0, 'Original', 1);
      const originalMeasure = makeParagraphMeasure([makeLine(0, 0, 0, 8, 70, 24)]);

      const originalLayout = layoutDocument(
        [originalBlock],
        [originalMeasure],
        makeLayoutOptions()
      );

      // Modified paragraph (longer text)
      const modifiedBlock = makeParagraphBlock(0, 'Modified text here', 1);
      const modifiedMeasure = makeParagraphMeasure([makeLine(0, 0, 0, 18, 140, 24)]);

      const modifiedLayout = layoutDocument(
        [modifiedBlock],
        [modifiedMeasure],
        makeLayoutOptions()
      );

      // Both should have same structure but different PM bounds
      expect(modifiedLayout.pages.length).toBe(originalLayout.pages.length);
      expect(modifiedLayout.pages[0].fragments.length).toBe(
        originalLayout.pages[0].fragments.length
      );

      // PM end should differ based on text length
      const originalFrag = originalLayout.pages[0].fragments[0];
      const modifiedFrag = modifiedLayout.pages[0].fragments[0];

      expect(modifiedFrag.pmEnd).toBeGreaterThan(originalFrag.pmEnd!);
    });

    test('line height changes update fragment positions', () => {
      const blocks: FlowBlock[] = [
        makeParagraphBlock(0, 'First', 1),
        makeParagraphBlock(1, 'Second', 8),
      ];

      // Small line height
      const smallMeasures: Measure[] = [
        makeParagraphMeasure([makeLine(0, 0, 0, 5, 50, 24)]),
        makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 24)]),
      ];

      const smallLayout = layoutDocument(blocks, smallMeasures, makeLayoutOptions());

      // Large line height
      const largeMeasures: Measure[] = [
        makeParagraphMeasure([makeLine(0, 0, 0, 5, 50, 48)]), // Double line height
        makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 48)]),
      ];

      const largeLayout = layoutDocument(blocks, largeMeasures, makeLayoutOptions());

      // Second fragment should be positioned further down with larger line height
      const smallSecondY = smallLayout.pages[0].fragments[1].y;
      const largeSecondY = largeLayout.pages[0].fragments[1].y;

      expect(largeSecondY).toBeGreaterThan(smallSecondY);
    });
  });
});
