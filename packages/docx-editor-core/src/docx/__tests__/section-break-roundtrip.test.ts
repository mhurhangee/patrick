import { describe, expect, test } from 'bun:test';
import { parseDocumentBody } from '../documentParser';
import { serializeDocumentBody } from '../serializer/documentSerializer';
import { serializeSectionProperties } from '../serializer/sectionPropertiesSerializer';
import type { Paragraph } from '../../types/document';

// Issue #680: a mid-body section break is stored on a paragraph via
// `w:pPr/w:sectPr`. The parser captured it onto `Paragraph.sectionProperties`,
// but the serializer never wrote it back, so a headless
// parseDocx → repackDocx roundtrip collapsed two sections into the final
// `w:body/w:sectPr` only.

// Two sections: the first ends on a paragraph carrying `w:pPr/w:sectPr`
// (portrait, nextPage), the body's final sectPr describes the second
// (landscape).
const TWO_SECTION_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:sectPr>
          <w:type w:val="nextPage"/>
          <w:pgSz w:w="12240" w:h="15840"/>
          <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
        </w:sectPr>
      </w:pPr>
      <w:r><w:t>First section</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Second section</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

describe('mid-body section break roundtrip (issue #680)', () => {
  test('parser captures a paragraph-level w:pPr/w:sectPr', () => {
    const body = parseDocumentBody(TWO_SECTION_XML);
    const first = body.content[0] as Paragraph;
    expect(first.type).toBe('paragraph');
    expect(first.sectionProperties).toBeDefined();
    expect(first.sectionProperties?.pageWidth).toBe(12240);
    expect(first.sectionProperties?.sectionStart).toBe('nextPage');
    expect(body.finalSectionProperties?.orientation).toBe('landscape');
  });

  test('serializer re-emits the mid-body sectPr inside the paragraph', () => {
    const body = parseDocumentBody(TWO_SECTION_XML);
    const xml = serializeDocumentBody(body);

    // Two sections survive: one on the paragraph, one final on the body.
    expect((xml.match(/<w:sectPr>/g) ?? []).length).toBe(2);
    // The mid-body sectPr lives inside the paragraph's pPr, before content.
    expect(xml).toMatch(/<w:p><w:pPr><w:sectPr>.*?<\/w:sectPr><\/w:pPr><w:r>/s);
    // Both page geometries are preserved.
    expect(xml).toContain('<w:pgSz w:w="12240" w:h="15840"/>');
    expect(xml).toContain('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>');
  });

  test('full parse → serialize → parse preserves two distinct sections', () => {
    const first = parseDocumentBody(TWO_SECTION_XML);
    const reparsed = parseDocumentBody(wrapBody(serializeDocumentBody(first)));

    const firstPara = reparsed.content[0] as Paragraph;
    expect(firstPara.sectionProperties?.pageWidth).toBe(12240);
    expect(firstPara.sectionProperties?.pageHeight).toBe(15840);
    expect(reparsed.finalSectionProperties?.pageWidth).toBe(15840);
    expect(reparsed.finalSectionProperties?.orientation).toBe('landscape');
  });

  // EG_SectPrContents (wml.xsd CT_SectPr) tail order is cols, vAlign, titlePg,
  // bidi, docGrid. A sectPr carrying all of them must serialize in that order
  // or strict OOXML validators reject the file.
  test('sectPr tail elements serialize in schema order', () => {
    const xml = serializeSectionProperties({
      pageWidth: 12240,
      pageHeight: 15840,
      columnCount: 2,
      verticalAlign: 'center',
      titlePg: true,
      bidi: true,
      docGrid: { type: 'lines', linePitch: 360 },
    });

    expect(xml).toMatch(
      /<w:cols\b.*<w:vAlign[^>]*\/>.*<w:titlePg\/>.*<w:bidi\/>.*<w:docGrid[^>]*\/>/s
    );
    // No element appears out of order (docGrid must not precede vAlign/titlePg).
    expect(xml).not.toMatch(/<w:docGrid[^>]*\/>.*<w:(vAlign|titlePg|bidi)/s);
  });
});

// serializeDocumentBody emits body-inner XML (no document/body wrapper);
// re-parsing needs the full document scaffold around it.
function wrapBody(inner: string): string {
  return `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${inner}</w:body></w:document>`;
}
