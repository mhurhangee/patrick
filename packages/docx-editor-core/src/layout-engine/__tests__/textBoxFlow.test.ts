import { describe, expect, test } from 'bun:test';
import {
  floatingTextBoxReservesBand,
  floatingTextBoxWrapsText,
  isFloatingTextBoxBlock,
} from '../textBoxFlow';

describe('isFloatingTextBoxBlock', () => {
  test('square wrap is floating and wraps text on its side', () => {
    const box = { displayMode: 'block' as const, wrapType: 'square' as const };
    expect(isFloatingTextBoxBlock(box)).toBe(true);
    expect(floatingTextBoxWrapsText(box)).toBe(true);
    expect(floatingTextBoxReservesBand(box)).toBe(false);
  });

  test('topAndBottom is floating, reserves a full-width band, no side wrap', () => {
    // A banner pinned to the page top: positioned (floats) but text only
    // flows above and below it, never beside it.
    const box = { displayMode: 'block' as const, wrapType: 'topAndBottom' as const };
    expect(isFloatingTextBoxBlock(box)).toBe(true);
    expect(floatingTextBoxReservesBand(box)).toBe(true);
    expect(floatingTextBoxWrapsText(box)).toBe(false);
  });

  test('inline block text box is not floating', () => {
    const box = { displayMode: 'block' as const, wrapType: 'inline' as const };
    expect(isFloatingTextBoxBlock(box)).toBe(false);
    expect(floatingTextBoxReservesBand(box)).toBe(false);
  });

  test('explicit float display mode floats regardless of wrap type', () => {
    const box = { displayMode: 'float' as const, wrapType: 'inline' as const };
    expect(isFloatingTextBoxBlock(box)).toBe(true);
  });
});
