import { describe, expect, test } from 'bun:test';
import { MIN_CARD_GAP } from '../utils/sidebarConstants';
import { type ResolvableSidebarItem, resolveItemPositions } from './resolveItemPositions';

const item = (id: string, fixedY: number, estimatedHeight = 40): ResolvableSidebarItem => ({
  id,
  anchorPos: 0,
  fixedY,
  estimatedHeight,
});

const run = (items: ResolvableSidebarItem[], cardHeights = new Map<string, number>()) =>
  resolveItemPositions(items, new Map(), null, 1, cardHeights, new Map());

describe('resolveItemPositions — availableBelow', () => {
  test('is the gap to the next card anchor minus MIN_CARD_GAP', () => {
    const res = run([item('a', 0), item('b', 100)]);
    expect(res[0].availableBelow).toBe(100 - MIN_CARD_GAP);
  });

  test('is undefined for the last card (unbounded room)', () => {
    const res = run([item('a', 0), item('b', 100)]);
    expect(res[1].availableBelow).toBeUndefined();
  });

  test('a single card has unbounded room', () => {
    const res = run([item('a', 50)]);
    expect(res[0].availableBelow).toBeUndefined();
  });

  test('is anchor-based, independent of card heights / cascade push', () => {
    // 'a' is rendered 200px tall, which cascades 'b' well below its anchor,
    // but the room budget stays the anchor gap (30 - 8), unaffected.
    const res = run([item('a', 0), item('b', 30)], new Map([['a', 200]]));
    expect(res[0].availableBelow).toBe(30 - MIN_CARD_GAP);
    expect(res[1].y).toBeGreaterThan(res[0].y);
  });

  test('tracks anchor order after sorting by Y', () => {
    const res = run([item('late', 200), item('early', 0)]);
    expect(res.map((r) => r.item.id)).toEqual(['early', 'late']);
    expect(res[0].availableBelow).toBe(200 - MIN_CARD_GAP);
  });
});
