import { describe, expect, test } from 'bun:test';
import {
  distributeFootnotesIntoColumns,
  calculateFootnoteReservedHeights,
  FOOTNOTE_SEPARATOR_HEIGHT,
} from '../footnoteLayout';

describe('distributeFootnotesIntoColumns', () => {
  test('columns <= 1 returns a single column unchanged', () => {
    const items = [
      { id: 'a', height: 10 },
      { id: 'b', height: 10 },
    ];
    expect(distributeFootnotesIntoColumns(items, 1)).toEqual([items]);
    expect(distributeFootnotesIntoColumns(items, 0)).toEqual([items]);
  });

  test('balances four equal items 2-and-2 across two columns', () => {
    const items = [
      { id: 'a', height: 10 },
      { id: 'b', height: 10 },
      { id: 'c', height: 10 },
      { id: 'd', height: 10 },
    ];
    const cols = distributeFootnotesIntoColumns(items, 2);
    expect(cols).toHaveLength(2);
    expect(cols[0].map((i) => i.id)).toEqual(['a', 'b']);
    expect(cols[1].map((i) => i.id)).toEqual(['c', 'd']);
  });

  test('preserves document order within and across columns', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: i, height: 10 }));
    const cols = distributeFootnotesIntoColumns(items, 3);
    const flattened = cols.flat().map((i) => i.id);
    expect(flattened).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('a single tall note followed by short notes does not scramble order', () => {
    const items = [
      { id: 'tall', height: 100 },
      { id: 's1', height: 10 },
      { id: 's2', height: 10 },
    ];
    const cols = distributeFootnotesIntoColumns(items, 2);
    // 'tall' must stay first; short notes follow in order.
    expect(cols.flat().map((i) => i.id)).toEqual(['tall', 's1', 's2']);
  });
});

describe('calculateFootnoteReservedHeights with columns', () => {
  const contentMap = new Map([
    [1, { height: 10 }],
    [2, { height: 10 }],
    [3, { height: 10 }],
    [4, { height: 10 }],
  ]);
  const pageMap = new Map([[1, [1, 2, 3, 4]]]);

  test('single column reserves the full sum plus separator', () => {
    const reserved = calculateFootnoteReservedHeights(pageMap, contentMap, 1);
    expect(reserved.get(1)).toBe(40 + FOOTNOTE_SEPARATOR_HEIGHT);
  });

  test('two columns reserve only the tallest balanced column plus separator', () => {
    const reserved = calculateFootnoteReservedHeights(pageMap, contentMap, 2);
    // 4 × 10 balanced 2-up → tallest column is 20, not the 40 sum.
    expect(reserved.get(1)).toBe(20 + FOOTNOTE_SEPARATOR_HEIGHT);
  });
});
