import { mapHexToHighlightName } from '@eigenpal/docx-editor-core/utils/highlightColors';
import { describe, expect, test } from 'bun:test';
import { HIGHLIGHT_SWATCHES, STANDARD_SWATCHES } from './shared';

describe('toolbar swatches', () => {
  // Regression guard: a highlight swatch whose hex isn't a known OOXML highlight
  // name serialises as run shading (w:shd), not w:highlight, and can't be cleared
  // after a round-trip. Every highlight swatch must map to a name.
  test('every HIGHLIGHT_SWATCHES hex maps to an OOXML highlight name', () => {
    for (const hex of HIGHLIGHT_SWATCHES) {
      expect(mapHexToHighlightName(hex)).not.toBeNull();
    }
  });

  test('all swatches are bare 6-digit hex (no #)', () => {
    for (const hex of [...STANDARD_SWATCHES, ...HIGHLIGHT_SWATCHES]) {
      expect(hex).toMatch(/^[0-9A-F]{6}$/);
    }
  });
});
