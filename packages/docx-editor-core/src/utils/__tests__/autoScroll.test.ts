/**
 * Drag auto-scroll delta math — the proximity-based speed curve shared by the
 * React and Vue auto-scroll hooks.
 */

import { describe, expect, test } from 'bun:test';
import {
  AUTO_SCROLL_EDGE_ZONE,
  AUTO_SCROLL_MAX_SPEED,
  computeAutoScrollDelta,
} from '../autoScroll';

const rect = { top: 100, bottom: 500 };

describe('computeAutoScrollDelta', () => {
  test('zero outside both edge zones', () => {
    expect(computeAutoScrollDelta(rect, 300)).toBe(0);
    // Just inside the inner boundary on each side.
    expect(computeAutoScrollDelta(rect, rect.top + AUTO_SCROLL_EDGE_ZONE + 1)).toBe(0);
    expect(computeAutoScrollDelta(rect, rect.bottom - AUTO_SCROLL_EDGE_ZONE - 1)).toBe(0);
  });

  test('max negative speed at the top edge', () => {
    expect(computeAutoScrollDelta(rect, rect.top)).toBe(-AUTO_SCROLL_MAX_SPEED);
    // Past the edge (above the container) stays clamped.
    expect(computeAutoScrollDelta(rect, rect.top - 100)).toBe(-AUTO_SCROLL_MAX_SPEED);
  });

  test('max positive speed at the bottom edge', () => {
    expect(computeAutoScrollDelta(rect, rect.bottom)).toBe(AUTO_SCROLL_MAX_SPEED);
    expect(computeAutoScrollDelta(rect, rect.bottom + 100)).toBe(AUTO_SCROLL_MAX_SPEED);
  });

  test('ramps linearly within the edge zone', () => {
    // 20px into a 40px zone → half speed.
    const half = AUTO_SCROLL_MAX_SPEED / 2;
    expect(computeAutoScrollDelta(rect, rect.top + 20)).toBeCloseTo(-half, 5);
    expect(computeAutoScrollDelta(rect, rect.bottom - 20)).toBeCloseTo(half, 5);
  });

  test('constants match the historical React/Vue values', () => {
    expect(AUTO_SCROLL_EDGE_ZONE).toBe(40);
    expect(AUTO_SCROLL_MAX_SPEED).toBe(12);
  });
});
