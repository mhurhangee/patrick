/**
 * Issue #811 — HTML-origin paragraphs use `w:beforeAutospacing`/`w:afterAutospacing`
 * (auto spacing). Word ignores any explicit `w:before`/`w:after` on such paragraphs
 * and renders ~14px before/after. The editor previously honored only the explicit
 * value (often a tiny 100-twip = ~6.7px), so imported docs rendered too tight and
 * compressed onto fewer pages than Word.
 *
 * This guards both consumers of the flag:
 *   - paragraphToStyle (the editable ProseMirror DOM margins)
 *   - toFlowBlocks (the layout/pagination measurement)
 */

import { describe, test, expect } from 'bun:test';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from '../toFlowBlocks';
import { paragraphToStyle } from '../../utils/formatToStyle';
import { AUTO_PARAGRAPH_SPACING_PX } from '../../utils/units';
import type { Document, Paragraph } from '../../types/document';

function makeDoc(formatting: Paragraph['formatting']): Document {
  const p: Paragraph = { type: 'paragraph', formatting, content: [] };
  return { package: { document: { content: [p] } } };
}

describe('issue #811 — auto spacing (beforeAutospacing/afterAutospacing)', () => {
  test('paragraphToStyle: auto spacing overrides explicit before/after', () => {
    const style = paragraphToStyle({
      beforeAutospacing: true,
      afterAutospacing: true,
      spaceBefore: 100, // would be ~6.7px; auto must win
      spaceAfter: 100,
    });
    expect(style.marginTop).toBe(`${AUTO_PARAGRAPH_SPACING_PX}px`);
    expect(style.marginBottom).toBe(`${AUTO_PARAGRAPH_SPACING_PX}px`);
  });

  test('paragraphToStyle: explicit spacing still used when no auto flag', () => {
    const style = paragraphToStyle({ spaceBefore: 240 }); // 240 twips = 16px
    expect(style.marginTop).toBe('16px');
  });

  test('toFlowBlocks: auto spacing surfaces as ~14px before/after for pagination', () => {
    const pmDoc = toProseDoc(makeDoc({ beforeAutospacing: true, afterAutospacing: true }));
    const blocks = toFlowBlocks(pmDoc, {});
    const para = blocks.find((b) => b.kind === 'paragraph');
    expect(para?.attrs?.spacing?.before).toBe(AUTO_PARAGRAPH_SPACING_PX);
    expect(para?.attrs?.spacing?.after).toBe(AUTO_PARAGRAPH_SPACING_PX);
  });

  test('toFlowBlocks: explicit before survives when auto flag absent', () => {
    const pmDoc = toProseDoc(makeDoc({ spaceBefore: 240 })); // 240 twips = 16px
    const blocks = toFlowBlocks(pmDoc, {});
    const para = blocks.find((b) => b.kind === 'paragraph');
    expect(para?.attrs?.spacing?.before).toBe(16);
  });
});
