/**
 * Unit tests for extendMarginsForHeaderFooter (issue #705).
 *
 * The body-margin push must be driven by the header/footer's IN-FLOW band
 * height (`flowHeight`), not its float-inclusive `visualBottom`/`height`. A
 * page/margin-anchored letterhead in a header has a huge `visualBottom` but a
 * tiny `flowHeight`; counting `visualBottom` drove the effective top margin
 * past the page and the paginator hard-threw, blanking the document.
 */

import { describe, test, expect } from 'bun:test';
import { extendMarginsForHeaderFooter } from '../headerFooterMargins';
import type { PageMargins } from '../../layout-engine/types';
import type { HeaderFooterContent } from '../../layout-painter/renderPage';

// A4 in px (16838 twips tall), with the margins from the #705 repro doc.
const PAGE = { w: 794, h: 1123 };
const MARGINS: PageMargins = {
  top: 187,
  right: 57,
  bottom: 113,
  left: 94,
  header: 47,
  footer: 47,
};

function hf(partial: Partial<HeaderFooterContent>): HeaderFooterContent {
  return {
    blocks: [],
    measures: [],
    height: 0,
    ...partial,
  };
}

describe('extendMarginsForHeaderFooter', () => {
  test('no header/footer content → margins returned unchanged', () => {
    const { margins, finalMargins } = extendMarginsForHeaderFooter({
      pageSize: PAGE,
      margins: MARGINS,
      finalMargins: MARGINS,
    });
    expect(margins).toBe(MARGINS);
    expect(finalMargins).toBe(MARGINS);
  });

  test('#705 — page-anchored letterhead (tiny flowHeight, huge visualBottom) does NOT push the body', () => {
    // A full-page letterhead anchored in the first-page header: visualBottom
    // ~1760px (paints down the page) but only ~30px of actual in-flow text.
    const letterheadHeader = hf({ flowHeight: 30, height: 1760, visualBottom: 1760 });
    const { margins } = extendMarginsForHeaderFooter({
      pageSize: PAGE,
      margins: MARGINS,
      finalMargins: MARGINS,
      headers: [letterheadHeader],
    });
    // flowHeight 30 < availableHeaderSpace (187-47=140) → no extension, no clamp.
    expect(margins.top).toBe(MARGINS.top);
    // Content area stays healthy (this is the case that used to throw).
    expect(PAGE.h - margins.top - margins.bottom).toBeGreaterThan(0);
  });

  test('genuinely tall in-flow header pushes the body top down (flowHeight drives it)', () => {
    const tallHeader = hf({ flowHeight: 300, height: 300 });
    const { margins } = extendMarginsForHeaderFooter({
      pageSize: PAGE,
      margins: MARGINS,
      finalMargins: MARGINS,
      headers: [tallHeader],
    });
    // top = max(187, headerDistance 47 + flowHeight 300) = 347.
    expect(margins.top).toBe(347);
  });

  test('falls back to `height` when `flowHeight` is undefined', () => {
    const legacyHeader = hf({ height: 300 });
    const { margins } = extendMarginsForHeaderFooter({
      pageSize: PAGE,
      margins: MARGINS,
      finalMargins: MARGINS,
      headers: [legacyHeader],
    });
    expect(margins.top).toBe(347);
  });

  test('footer band pushes the bottom margin up', () => {
    const tallFooter = hf({ flowHeight: 200 });
    const { margins } = extendMarginsForHeaderFooter({
      pageSize: PAGE,
      margins: MARGINS,
      finalMargins: MARGINS,
      footers: [tallFooter],
    });
    // bottom = max(113, footerDistance 47 + flowHeight 200) = 247.
    expect(margins.bottom).toBe(247);
  });

  test('the max band across header variants (default + first-page) wins', () => {
    const { margins } = extendMarginsForHeaderFooter({
      pageSize: PAGE,
      margins: MARGINS,
      finalMargins: MARGINS,
      headers: [hf({ flowHeight: 120 }), hf({ flowHeight: 320 })],
    });
    expect(margins.top).toBe(47 + 320);
  });

  test('clamp: an absurd in-flow header degrades to a thin content band instead of throwing', () => {
    const warnings: string[] = [];
    const { margins } = extendMarginsForHeaderFooter({
      pageSize: PAGE,
      margins: MARGINS,
      finalMargins: MARGINS,
      headers: [hf({ flowHeight: 5000 })],
      warn: (m) => warnings.push(m),
    });
    const content = PAGE.h - margins.top - margins.bottom;
    expect(content).toBeGreaterThan(0); // never <= 0 → paginator never throws
    expect(margins.top + margins.bottom).toBeLessThanOrEqual(PAGE.h);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('clamping margins');
  });

  test('per-sectionBreak margins are extended in place', () => {
    const bodyBlocks = [
      {
        kind: 'sectionBreak' as const,
        margins: { top: 187, right: 57, bottom: 113, left: 94, header: 47, footer: 47 },
      },
    ];
    extendMarginsForHeaderFooter({
      pageSize: PAGE,
      margins: MARGINS,
      finalMargins: MARGINS,
      bodyBlocks: bodyBlocks as never,
      headers: [hf({ flowHeight: 300 })],
    });
    expect(bodyBlocks[0].margins.top).toBe(347);
  });
});
