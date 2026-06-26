import { describe, expect, test } from 'bun:test';
import { clampFloatingWrapMargins } from '../measureParagraph';

describe('clampFloatingWrapMargins', () => {
  test('zeros margins that exceed content width (full-width float bug)', () => {
    expect(clampFloatingWrapMargins(698, 0, 671)).toEqual({ leftMargin: 0, rightMargin: 0 });
  });

  test('preserves valid side margins', () => {
    expect(clampFloatingWrapMargins(200, 0, 671)).toEqual({ leftMargin: 200, rightMargin: 0 });
    expect(clampFloatingWrapMargins(0, 150, 671)).toEqual({ leftMargin: 0, rightMargin: 150 });
  });

  test('zeros when combined margins cover the line', () => {
    expect(clampFloatingWrapMargins(400, 300, 671)).toEqual({ leftMargin: 0, rightMargin: 0 });
  });
});
