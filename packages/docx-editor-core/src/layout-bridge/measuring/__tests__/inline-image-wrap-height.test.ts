import { describe, test, expect } from 'bun:test';

// bun:test has no DOM; give measureTextWidth a deterministic canvas stub
// (8px per character) before the lazy getCanvasContext() first runs.
// getFontMetrics falls back to ratio-based metrics on its own.
if (typeof document === 'undefined') {
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({
      getContext: () => ({
        font: '',
        measureText: (text: string) => ({ width: text.length * 8 }),
      }),
    }),
  };
}

import { measureParagraph } from '../measureParagraph';

/**
 * Issue #766 — an inline image that wraps to the next line must carry its
 * height to the line it lands on, not the line it wrapped away from.
 * Pre-fix, the image footprint was recorded on the current line BEFORE the
 * wrap check, so the previous text line inflated to image height while the
 * image's own line stayed at text height — the image overflowed it and
 * every following line painted on top of the image.
 */

function measure(runs: unknown[], width = 600) {
  return measureParagraph(
    {
      kind: 'paragraph',
      id: 'p1',
      pmStart: 0,
      pmEnd: 100,
      runs,
      attrs: {
        spacing: { line: 1.5, lineUnit: 'multiplier', lineRule: 'auto' },
      },
    } as never,
    width
  );
}

describe('inline image line-height attribution across wraps (#766)', () => {
  test('image that wraps grows its own line, not the previous one', () => {
    const result = measure([
      { kind: 'text', text: 'Test sentence with AppBody-', fontSize: 12, fontFamily: 'Arial' },
      { kind: 'image', width: 527, height: 151 },
      { kind: 'text', text: 'Description', fontSize: 12, fontFamily: 'Arial' },
    ]);
    if (result.kind !== 'paragraph') throw new Error('expected paragraph measure');

    // Text + 527px image exceed 600px → the image wraps to line 1.
    expect(result.lines.length).toBeGreaterThanOrEqual(2);

    const [textLine, imageLine] = result.lines;
    // The text line keeps its font-based height (12pt × 1.5 ≈ 27px).
    expect(textLine.lineHeight).toBeLessThan(60);
    // The line the image landed on reserves at least the image height.
    expect(imageLine.lineHeight).toBeGreaterThanOrEqual(151);
  });

  test('image that fits inline grows the shared line', () => {
    const result = measure([
      { kind: 'text', text: 'Logo:', fontSize: 12, fontFamily: 'Arial' },
      { kind: 'image', width: 100, height: 151 },
    ]);
    if (result.kind !== 'paragraph') throw new Error('expected paragraph measure');

    expect(result.lines.length).toBe(1);
    expect(result.lines[0].lineHeight).toBeGreaterThanOrEqual(151);
  });

  test('image wider than the column reserves the scaled-down height, not the declared one', () => {
    // The painter fits an inline image to the column with `max-width: 100%`, so
    // an 800×492 image in a 600px column renders at 600×369. The line must
    // reserve ~369px, not the declared 492px — otherwise a tall gap opens below
    // the image (the Vue insert path inserts at up to 800px wide).
    const result = measure([{ kind: 'image', width: 800, height: 492 }], 600);
    if (result.kind !== 'paragraph') throw new Error('expected paragraph measure');

    // The image lands on its own line; assert against the tallest line.
    const h = Math.max(...result.lines.map((l) => l.lineHeight));
    // Scaled height ≈ 492 × (600 / 800) = 369, plus a few px of leading.
    expect(h).toBeGreaterThanOrEqual(368);
    expect(h).toBeLessThan(420); // pre-fix this was ~492 + leading
  });
});
