import { describe, expect, test } from 'bun:test';
import { parseDocumentBody } from '../documentParser';
import { serializeDocumentBody } from '../serializer/documentSerializer';
import { serializeSectionProperties } from '../serializer/sectionPropertiesSerializer';

// Word's "Footnote layout → Columns" setting is stored as a w15 extension
// element directly inside w:sectPr: `<w15:footnoteColumns w:val="2"/>`. It is
// independent of the body's w:cols, so a single-column body can still lay its
// footnotes out in multiple columns. docx-editor previously dropped the element
// on both load and save; this guards parse + serialize round-trip fidelity.

const LANDSCAPE_TWO_COL_FOOTNOTES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
  <w:body>
    <w:p><w:r><w:t>Body text</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
      <w:cols w:space="720"/>
      <w15:footnoteColumns w:val="2"/>
    </w:sectPr>
  </w:body>
</w:document>`;

describe('footnote columns round-trip (w15:footnoteColumns)', () => {
  test('parser reads w15:footnoteColumns into SectionProperties', () => {
    const body = parseDocumentBody(LANDSCAPE_TWO_COL_FOOTNOTES);
    expect(body.finalSectionProperties?.orientation).toBe('landscape');
    expect(body.finalSectionProperties?.footnoteColumns).toBe(2);
  });

  test('serializer emits w15:footnoteColumns for a multi-column value', () => {
    const xml = serializeSectionProperties({ pageWidth: 15840, footnoteColumns: 2 });
    expect(xml).toContain('<w15:footnoteColumns w:val="2"/>');
  });

  test('serializer omits footnoteColumns for the default (1) and undefined', () => {
    expect(serializeSectionProperties({ footnoteColumns: 1 })).not.toContain('footnoteColumns');
    expect(serializeSectionProperties({ footnoteColumns: undefined })).not.toContain(
      'footnoteColumns'
    );
  });

  test('w15:footnoteColumns serializes after w:cols and before the schema tail', () => {
    const xml = serializeSectionProperties({
      columnCount: 2,
      footnoteColumns: 2,
      verticalAlign: 'center',
      docGrid: { type: 'lines', linePitch: 360 },
    });
    // Word emits footnoteColumns immediately after cols; it must not precede
    // cols nor follow the EG_SectPrContents tail (vAlign/docGrid).
    expect(xml).toMatch(
      /<w:cols\b[^>]*\/?>.*<w15:footnoteColumns[^>]*\/>.*<w:vAlign[^>]*\/>.*<w:docGrid[^>]*\/>/s
    );
    expect(xml).not.toMatch(/<w15:footnoteColumns[^>]*\/>.*<w:cols\b/s);
  });

  test('full parse → serialize → parse preserves the footnote column count', () => {
    const first = parseDocumentBody(LANDSCAPE_TWO_COL_FOOTNOTES);
    const reparsed = parseDocumentBody(wrapBody(serializeDocumentBody(first)));
    expect(reparsed.finalSectionProperties?.footnoteColumns).toBe(2);
  });
});

// serializeDocumentBody emits body-inner XML (no document/body wrapper);
// re-parsing needs the full document scaffold around it.
function wrapBody(inner: string): string {
  return `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w:body>${inner}</w:body></w:document>`;
}
