import { describe, test, expect } from 'bun:test';

import { layoutDocument } from '../index';
import type { FlowBlock, Measure, ParagraphBlock } from '../types';

import { makeLine, makeParagraphMeasure, makeLayoutOptions } from './helpers';

describe('Layout Engine - Contextual Spacing', () => {
  // Non-suppressed gaps below are max(spaceAfter, spaceBefore) — Word
  // collapses adjacent paragraph spacing rather than summing it.
  /**
   * Helper to create a paragraph block with spacing and contextualSpacing attrs.
   */
  function makeSpacedParagraph(
    id: number,
    text: string,
    pmStart: number,
    options: {
      spaceBefore?: number;
      spaceAfter?: number;
      contextualSpacing?: boolean;
      styleId?: string;
    } = {}
  ): ParagraphBlock {
    return {
      kind: 'paragraph',
      id,
      runs: [{ kind: 'text', text, pmStart, pmEnd: pmStart + text.length }],
      attrs: {
        spacing: {
          before: options.spaceBefore ?? 0,
          after: options.spaceAfter ?? 13,
        },
        contextualSpacing: options.contextualSpacing,
        styleId: options.styleId,
      },
      pmStart,
      pmEnd: pmStart + text.length + 1,
    };
  }

  test('suppresses spacing between consecutive same-style paragraphs with contextualSpacing', () => {
    // Two ListBullet paragraphs with contextualSpacing — spacing should be suppressed
    const blocks: FlowBlock[] = [
      makeSpacedParagraph(0, 'Item 1', 1, {
        spaceAfter: 13,
        contextualSpacing: true,
        styleId: 'ListBullet',
      }),
      makeSpacedParagraph(1, 'Item 2', 9, {
        spaceBefore: 5,
        spaceAfter: 13,
        contextualSpacing: true,
        styleId: 'ListBullet',
      }),
    ];
    const measures: Measure[] = [
      makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 20)]),
      makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 20)]),
    ];

    const layout = layoutDocument(blocks, measures, makeLayoutOptions());

    expect(layout.pages.length).toBe(1);
    const frags = layout.pages[0].fragments;
    expect(frags.length).toBe(2);

    // With contextual spacing suppressed, second paragraph should be immediately
    // after the first (no spaceAfter on first, no spaceBefore on second)
    const gap = frags[1].y - (frags[0].y + frags[0].height);
    expect(gap).toBe(0);
  });

  test('does NOT suppress spacing when contextualSpacing is false', () => {
    const blocks: FlowBlock[] = [
      makeSpacedParagraph(0, 'Para 1', 1, {
        spaceAfter: 13,
        contextualSpacing: false,
        styleId: 'Normal',
      }),
      makeSpacedParagraph(1, 'Para 2', 9, {
        spaceBefore: 5,
        spaceAfter: 13,
        contextualSpacing: false,
        styleId: 'Normal',
      }),
    ];
    const measures: Measure[] = [
      makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 20)]),
      makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 20)]),
    ];

    const layout = layoutDocument(blocks, measures, makeLayoutOptions());

    const frags = layout.pages[0].fragments;
    const gap = frags[1].y - (frags[0].y + frags[0].height);
    expect(gap).toBe(13); // max(13, 5)
  });

  test('does NOT suppress spacing when styles differ', () => {
    const blocks: FlowBlock[] = [
      makeSpacedParagraph(0, 'Bullet', 1, {
        spaceAfter: 13,
        contextualSpacing: true,
        styleId: 'ListBullet',
      }),
      makeSpacedParagraph(1, 'Normal', 9, {
        spaceBefore: 5,
        spaceAfter: 13,
        contextualSpacing: true,
        styleId: 'Normal',
      }),
    ];
    const measures: Measure[] = [
      makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 20)]),
      makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 20)]),
    ];

    const layout = layoutDocument(blocks, measures, makeLayoutOptions());

    const frags = layout.pages[0].fragments;
    // Different styles — spacing should NOT be suppressed
    const gap = frags[1].y - (frags[0].y + frags[0].height);
    expect(gap).toBe(13); // max(13, 5)
  });

  test('does NOT suppress when only one paragraph has contextualSpacing', () => {
    const blocks: FlowBlock[] = [
      makeSpacedParagraph(0, 'First', 1, {
        spaceAfter: 13,
        contextualSpacing: true,
        styleId: 'ListBullet',
      }),
      makeSpacedParagraph(1, 'Second', 8, {
        spaceBefore: 5,
        spaceAfter: 13,
        contextualSpacing: false,
        styleId: 'ListBullet',
      }),
    ];
    const measures: Measure[] = [
      makeParagraphMeasure([makeLine(0, 0, 0, 5, 50, 20)]),
      makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 20)]),
    ];

    const layout = layoutDocument(blocks, measures, makeLayoutOptions());

    const frags = layout.pages[0].fragments;
    const gap = frags[1].y - (frags[0].y + frags[0].height);
    expect(gap).toBe(13); // max(13, 5)
  });

  test('suppresses spacing in a chain of 3+ same-style paragraphs', () => {
    const blocks: FlowBlock[] = [
      makeSpacedParagraph(0, 'A', 1, {
        spaceAfter: 10,
        contextualSpacing: true,
        styleId: 'ListBullet',
      }),
      makeSpacedParagraph(1, 'B', 4, {
        spaceBefore: 5,
        spaceAfter: 10,
        contextualSpacing: true,
        styleId: 'ListBullet',
      }),
      makeSpacedParagraph(2, 'C', 7, {
        spaceBefore: 5,
        spaceAfter: 10,
        contextualSpacing: true,
        styleId: 'ListBullet',
      }),
    ];
    const measures: Measure[] = [
      makeParagraphMeasure([makeLine(0, 0, 0, 1, 10, 20)]),
      makeParagraphMeasure([makeLine(0, 0, 0, 1, 10, 20)]),
      makeParagraphMeasure([makeLine(0, 0, 0, 1, 10, 20)]),
    ];

    const layout = layoutDocument(blocks, measures, makeLayoutOptions());

    const frags = layout.pages[0].fragments;
    expect(frags.length).toBe(3);

    // All gaps should be zero
    const gap1 = frags[1].y - (frags[0].y + frags[0].height);
    const gap2 = frags[2].y - (frags[1].y + frags[1].height);
    expect(gap1).toBe(0);
    expect(gap2).toBe(0);
  });

  test('preserves spacing before first and after last in contextual chain', () => {
    // A normal paragraph, then 2 contextual, then normal
    const blocks: FlowBlock[] = [
      makeSpacedParagraph(0, 'Normal', 1, {
        spaceAfter: 13,
        styleId: 'Normal',
      }),
      makeSpacedParagraph(1, 'Bullet 1', 9, {
        spaceBefore: 5,
        spaceAfter: 13,
        contextualSpacing: true,
        styleId: 'ListBullet',
      }),
      makeSpacedParagraph(2, 'Bullet 2', 19, {
        spaceBefore: 5,
        spaceAfter: 13,
        contextualSpacing: true,
        styleId: 'ListBullet',
      }),
      makeSpacedParagraph(3, 'Normal 2', 29, {
        spaceBefore: 5,
        spaceAfter: 13,
        styleId: 'Normal',
      }),
    ];
    const measures: Measure[] = [
      makeParagraphMeasure([makeLine(0, 0, 0, 6, 60, 20)]),
      makeParagraphMeasure([makeLine(0, 0, 0, 8, 80, 20)]),
      makeParagraphMeasure([makeLine(0, 0, 0, 8, 80, 20)]),
      makeParagraphMeasure([makeLine(0, 0, 0, 8, 80, 20)]),
    ];

    const layout = layoutDocument(blocks, measures, makeLayoutOptions());

    const frags = layout.pages[0].fragments;
    expect(frags.length).toBe(4);

    // Normal → Bullet: no contextualSpacing, max(13, 5)
    const gap0to1 = frags[1].y - (frags[0].y + frags[0].height);
    expect(gap0to1).toBe(13);

    // Bullet → Bullet: both contextual, same style → suppressed
    const gap1to2 = frags[2].y - (frags[1].y + frags[1].height);
    expect(gap1to2).toBe(0);

    // Bullet → Normal: Normal lacks contextualSpacing, max(13, 5)
    const gap2to3 = frags[3].y - (frags[2].y + frags[2].height);
    expect(gap2to3).toBe(13);
  });

  test('does NOT suppress when styleId is undefined', () => {
    const blocks: FlowBlock[] = [
      makeSpacedParagraph(0, 'No style 1', 1, {
        spaceAfter: 10,
        contextualSpacing: true,
        // no styleId
      }),
      makeSpacedParagraph(1, 'No style 2', 13, {
        spaceBefore: 5,
        spaceAfter: 10,
        contextualSpacing: true,
        // no styleId
      }),
    ];
    const measures: Measure[] = [
      makeParagraphMeasure([makeLine(0, 0, 0, 10, 100, 20)]),
      makeParagraphMeasure([makeLine(0, 0, 0, 10, 100, 20)]),
    ];

    const layout = layoutDocument(blocks, measures, makeLayoutOptions());

    const frags = layout.pages[0].fragments;
    // Without styleId, contextual spacing should NOT be applied
    const gap = frags[1].y - (frags[0].y + frags[0].height);
    expect(gap).toBe(10); // max(10, 5)
  });
});
