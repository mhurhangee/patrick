/**
 * Zero-dimension handling in section geometry (hardening after #740).
 *
 * Every `w:pgMar` distance is an OFFSET, so an explicit `0` must be honored —
 * full-bleed body margins (`w:top="0"`) and a header/footer pinned to the page
 * edge (`w:header="0"`, the #740 trigger). A truthy guard mapped 0 → the
 * default, over-reserving space (and, for the header, pushing content onto a
 * second page). Page SIZE is the deliberate contrast: a `0` there is malformed
 * and correctly falls back to Letter rather than rendering a zero-area page.
 */

import { describe, expect, test } from 'bun:test';
import {
  getMargins,
  getPageSize,
  twipsToPxOr,
  DEFAULT_HF_DISTANCE_PX,
  DEFAULT_BODY_MARGIN_PX,
  DEFAULT_PAGE_WIDTH_PX,
} from '../sectionGeometry';
import type { SectionProperties } from '../../types/document';

const base: SectionProperties = {
  marginTop: 813,
  marginRight: 1134,
  marginBottom: 1134,
  marginLeft: 1134,
};

describe('getMargins header/footer distance (#740)', () => {
  test('honors an explicit header/footer distance of 0 (not the default)', () => {
    const m = getMargins({ ...base, headerDistance: 0, footerDistance: 0 });
    expect(m.header).toBe(0);
    expect(m.footer).toBe(0);
  });

  test('falls back to the 0.5in default only when the distance is absent', () => {
    const m = getMargins(base);
    expect(m.header).toBe(DEFAULT_HF_DISTANCE_PX);
    expect(m.footer).toBe(DEFAULT_HF_DISTANCE_PX);
  });

  test('converts a non-zero distance from twips to px', () => {
    const m = getMargins({ ...base, headerDistance: 720, footerDistance: 720 });
    expect(m.header).toBe(48); // 720 twips = 0.5in = 48px
    expect(m.footer).toBe(48);
  });
});

describe('getMargins body margins honor an explicit 0 (full-bleed)', () => {
  test('an explicit 0 body margin stays 0, not the 1in default', () => {
    const m = getMargins({
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
    });
    expect([m.top, m.right, m.bottom, m.left]).toEqual([0, 0, 0, 0]);
  });

  test('an absent body margin falls back to the 1in default', () => {
    const m = getMargins(null);
    expect([m.top, m.right, m.bottom, m.left]).toEqual([
      DEFAULT_BODY_MARGIN_PX,
      DEFAULT_BODY_MARGIN_PX,
      DEFAULT_BODY_MARGIN_PX,
      DEFAULT_BODY_MARGIN_PX,
    ]);
  });
});

describe('getPageSize keeps a SIZE defensive — 0 is malformed, falls back', () => {
  test('a 0 / absent page size defaults to Letter rather than a zero-area page', () => {
    expect(getPageSize({ pageWidth: 0, pageHeight: 0 }).w).toBe(DEFAULT_PAGE_WIDTH_PX);
    expect(getPageSize(null).w).toBe(DEFAULT_PAGE_WIDTH_PX);
  });
});

describe('twipsToPxOr — nullish guard for offset dimensions', () => {
  test('honors 0, converts non-zero, defaults only on null/undefined', () => {
    expect(twipsToPxOr(0, 96)).toBe(0);
    expect(twipsToPxOr(1440, 96)).toBe(96); // 1in
    expect(twipsToPxOr(undefined, 96)).toBe(96);
    expect(twipsToPxOr(null, 96)).toBe(96);
  });
});
