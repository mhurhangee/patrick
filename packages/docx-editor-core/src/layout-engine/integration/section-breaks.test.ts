import { describe, test, expect } from 'bun:test';

import { layoutDocument } from '../index';
import type { FlowBlock, Measure } from '../types';

import { makeParagraphBlock, makeLine, makeParagraphMeasure, makeLayoutOptions } from './helpers';

describe('Section Breaks', () => {
  test('nextPage section break forces new page', () => {
    const blocks: FlowBlock[] = [
      makeParagraphBlock(0, 'Before section', 1),
      { kind: 'sectionBreak', id: 1, type: 'nextPage' },
      makeParagraphBlock(2, 'After section', 18),
    ];
    const measures: Measure[] = [
      makeParagraphMeasure([makeLine(0, 0, 0, 14, 120, 24)]),
      { kind: 'sectionBreak' },
      makeParagraphMeasure([makeLine(0, 0, 0, 13, 110, 24)]),
    ];

    const layout = layoutDocument(blocks, measures, makeLayoutOptions());

    expect(layout.pages.length).toBe(2);
    expect(layout.pages[0].fragments.some((f) => f.blockId === 0)).toBe(true);
    expect(layout.pages[1].fragments.some((f) => f.blockId === 2)).toBe(true);
  });

  test('continuous section break does not force new page', () => {
    const blocks: FlowBlock[] = [
      makeParagraphBlock(0, 'Before section', 1),
      { kind: 'sectionBreak', id: 1, type: 'continuous' },
      makeParagraphBlock(2, 'After section', 18),
    ];
    const measures: Measure[] = [
      makeParagraphMeasure([makeLine(0, 0, 0, 14, 120, 24)]),
      { kind: 'sectionBreak' },
      makeParagraphMeasure([makeLine(0, 0, 0, 13, 110, 24)]),
    ];

    const layout = layoutDocument(blocks, measures, makeLayoutOptions());

    expect(layout.pages.length).toBe(1);
    expect(layout.pages[0].fragments.length).toBe(2);
  });
});
