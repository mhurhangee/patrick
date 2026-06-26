/**
 * Regression test for #718 — a list level whose `numFmt` is `none` (ECMA-376
 * §17.18.59) shows no auto-number. An abstractNum with `numFmt="none"` and an
 * empty `lvlText` is Word's idiom for "indent like a list but render no
 * marker", so such paragraphs must come back with NO marker instead of a
 * fabricated "1.".
 */
import { describe, test, expect } from 'bun:test';
import { computeListMarker } from '../toFlowBlocks/listMarkers';
import type { ParagraphAttrs } from '../../prosemirror/schema/nodes';

function base(overrides: Partial<ParagraphAttrs>): ParagraphAttrs {
  return {
    numPr: { numId: 1, ilvl: 0 },
    listLevelNumFmts: ['none'],
    listNumFmt: 'none',
    ...overrides,
  } as ParagraphAttrs;
}

describe('Issue #718 — numFmt="none" produces no list marker', () => {
  test('empty lvlText with numFmt none yields no marker (not a decimal number)', () => {
    const marker = computeListMarker(base({ listMarker: '' }), new Map(), new Set());
    expect(marker).toBeNull();
  });

  test('numFmt none does not increment the counter across paragraphs', () => {
    const counters = new Map<number, number[]>();
    const seen = new Set<string>();
    expect(computeListMarker(base({ listMarker: '' }), counters, seen)).toBeNull();
    expect(computeListMarker(base({ listMarker: '' }), counters, seen)).toBeNull();
  });

  test('numFmt none with a literal lvlText renders the literal text', () => {
    const marker = computeListMarker(base({ listMarker: '►' }), new Map(), new Set());
    expect(marker).toBe('►');
  });

  test('a real decimal list is unaffected', () => {
    const marker = computeListMarker(
      {
        numPr: { numId: 2, ilvl: 0 },
        listLevelNumFmts: ['decimal'],
        listNumFmt: 'decimal',
        listMarker: '%1.',
      } as ParagraphAttrs,
      new Map(),
      new Set()
    );
    expect(marker).toBe('1.');
  });
});
