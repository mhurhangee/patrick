import { describe, expect, test } from 'bun:test';
import { resolveAnchoredObjectPosition, type PageGeometry } from '../anchoredObjectPosition';

const geometry: PageGeometry = {
  pageWidth: 600,
  pageHeight: 800,
  marginLeft: 50,
  marginTop: 50,
  contentWidth: 500,
  contentHeight: 700,
};

describe('resolveAnchoredObjectPosition', () => {
  test('resolves page-relative center alignment into content coordinates', () => {
    expect(
      resolveAnchoredObjectPosition(
        {
          width: 100,
          height: 40,
          position: {
            horizontal: { relativeTo: 'page', align: 'center' },
            vertical: { relativeTo: 'page', align: 'center' },
          },
        },
        120,
        geometry.contentWidth,
        geometry
      )
    ).toEqual({ x: 200, y: 330, side: 'left' });
  });

  test('applies EMU offsets from the selected anchor bands', () => {
    expect(
      resolveAnchoredObjectPosition(
        {
          width: 100,
          height: 40,
          position: {
            horizontal: { relativeTo: 'column', posOffset: 914400 },
            vertical: { relativeTo: 'paragraph', posOffset: 914400 },
          },
        },
        120,
        geometry.contentWidth,
        geometry
      )
    ).toEqual({ x: 96, y: 216, side: 'left' });
  });

  test('falls back to cssFloat when no explicit horizontal anchor exists', () => {
    expect(
      resolveAnchoredObjectPosition(
        {
          width: 100,
          height: 40,
          cssFloat: 'right',
        },
        120,
        geometry.contentWidth,
        geometry
      )
    ).toEqual({ x: 400, y: 120, side: 'right' });
  });
});
