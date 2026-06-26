/**
 * Block-level Structured Document Tag (`w:sdt`) serializer.
 *
 * Round-trips a {@link BlockSdt} by replaying the captured `w:sdtPr` /
 * `w:sdtEndPr` verbatim (preserving the `CT_SdtPr` sequence order and any
 * unmodeled features such as data binding, `w14:`/`w15:` extensions, and
 * `@lastValue`), then serializing the child blocks inside `w:sdtContent`.
 *
 * Serialization is intentionally capture-and-replay, not re-synthesis: the
 * properties block is never edited here, so echoing Word's own bytes is both
 * lossless and guaranteed schema-valid. A block SDT created from code (headless
 * `createContentControl`) carries a synthesized `w:sdtPr` in `rawPropertiesXml`,
 * which this path replays the same way.
 *
 * Shared by the body serializer and the header/footer serializer so block
 * SDTs round-trip identically wherever block content can appear.
 */

import type { BlockContent, BlockSdt } from '../../types/document';

/**
 * Serialize a {@link BlockSdt} to a `<w:sdt>` element.
 *
 * @param block - the block SDT to serialize
 * @param serializeChild - serializer for a single child block (lets the body
 *   and header/footer paths recurse with their own block dispatcher)
 */
export function serializeBlockSdt(
  block: BlockSdt,
  serializeChild: (child: BlockContent) => string
): string {
  const sdtContentXml = block.content.map(serializeChild).join('');
  // Replay the captured properties verbatim. A `BlockSdt` without captured
  // raw can only arise from a source `w:sdt` that had no `w:sdtPr` at all
  // (CT_SdtBlock makes sdtPr optional) — faithfully emit none in that case.
  const sdtPrXml = block.properties.rawPropertiesXml ?? '';
  const sdtEndPrXml = block.properties.rawEndPropertiesXml ?? '';
  return `<w:sdt>${sdtPrXml}${sdtEndPrXml}<w:sdtContent>${sdtContentXml}</w:sdtContent></w:sdt>`;
}
