/**
 * Issue #777 — anchored-image line alignment. An anchored image uses its own
 * `wp:positionH` alignment, defaulting to LEFT (Word's default) rather than
 * inheriting the paragraph's `jc`. Inline images follow the paragraph.
 */

import { describe, expect, test } from 'bun:test';
import { resolveImageLineAlign } from './line';
import type { ImageRun } from '../../layout-engine/types';

function img(horizontal?: { align?: string }): ImageRun {
  return {
    kind: 'image',
    src: '',
    width: 10,
    height: 10,
    position: horizontal ? { horizontal } : undefined,
  } as ImageRun;
}

describe('resolveImageLineAlign (#777)', () => {
  test('anchored image keeps its explicit alignment', () => {
    expect(resolveImageLineAlign(img({ align: 'left' }), 'center')).toBe('left');
    expect(resolveImageLineAlign(img({ align: 'right' }), 'center')).toBe('right');
    expect(resolveImageLineAlign(img({ align: 'center' }), 'left')).toBe('center');
  });

  test('anchored image with NO alignment defaults to left, NOT the paragraph jc', () => {
    // The bug: a left-anchored logo in a centered paragraph rendered centered.
    expect(resolveImageLineAlign(img({}), 'center')).toBe('left');
    expect(resolveImageLineAlign(img({}), 'right')).toBe('left');
  });

  test('inline image (no anchor) follows the paragraph alignment', () => {
    expect(resolveImageLineAlign(img(undefined), 'center')).toBe('center');
    expect(resolveImageLineAlign(img(undefined), undefined)).toBeUndefined();
  });
});
