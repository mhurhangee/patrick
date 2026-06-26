import { describe, expect, test } from 'bun:test';
import { calculateResizedImageDimensions } from '../imageCommit';

/**
 * Resize math shared by the React and Vue image overlays (issue #266):
 *  - corner handles keep the image's aspect ratio (Shift frees it)
 *  - edge handles stretch a single dimension, deliberately breaking aspect
 */
describe('calculateResizedImageDimensions', () => {
  const W = 200;
  const H = 100; // 2:1

  test('corner handle preserves aspect ratio', () => {
    const r = calculateResizedImageDimensions('se', 100, 10, W, H, true);
    expect(r.width / r.height).toBeCloseTo(2, 5);
    expect(r.width).toBeGreaterThan(W);
    expect(r.height).toBeGreaterThan(H);
  });

  test('Shift (lockAspect=false) frees a corner to resize freely', () => {
    const r = calculateResizedImageDimensions('se', 100, 0, W, H, false);
    expect(r.width).toBe(300);
    expect(r.height).toBe(100); // height unchanged → aspect broken
  });

  test('east edge stretches width only (breaks aspect)', () => {
    const r = calculateResizedImageDimensions('e', 80, 999, W, H, true);
    expect(r.width).toBe(280);
    expect(r.height).toBe(100); // vertical delta ignored on a horizontal edge
  });

  test('west edge stretches width only, from the opposite side', () => {
    const r = calculateResizedImageDimensions('w', 50, 0, W, H, true);
    expect(r.width).toBe(150); // dragging the left edge right shrinks width
    expect(r.height).toBe(100);
  });

  test('south edge stretches height only (breaks aspect)', () => {
    const r = calculateResizedImageDimensions('s', 999, 60, W, H, true);
    expect(r.width).toBe(200); // horizontal delta ignored on a vertical edge
    expect(r.height).toBe(160);
  });

  test('north edge stretches height only, from the opposite side', () => {
    const r = calculateResizedImageDimensions('n', 0, 40, W, H, true);
    expect(r.width).toBe(200);
    expect(r.height).toBe(60); // dragging the top edge down shrinks height
  });

  test('non-driven axis passes through unclamped (start value)', () => {
    // height starts out of range but the east edge must not touch it
    const r = calculateResizedImageDimensions('e', 50, 0, 200, 5000, true);
    expect(r.height).toBe(5000);
  });

  test('driven axis clamps to the [20, 2000] range', () => {
    expect(calculateResizedImageDimensions('e', -1000, 0, W, H, true).width).toBe(20);
    expect(calculateResizedImageDimensions('e', 5000, 0, W, H, true).width).toBe(2000);
  });
});
