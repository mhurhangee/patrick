import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { parseDocx } from '../parser';
import { repackDocx } from '../rezip';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { fromProseDoc } from '../../prosemirror/conversion/fromProseDoc';
import { serializeDocument } from '../serializer/documentSerializer';
import type { Paragraph } from '../../types/document';

// Issue #804: a 2-section document — section 1 carried on a paragraph's
// `w:pPr/w:sectPr`, section 2 in the body-level `w:sectPr` — must keep BOTH
// sections through a headless `repackDocx` roundtrip AND through the React
// save() flow (which runs the document model through toProseDoc -> fromProseDoc
// before serializing).
//
// NOTE: #804 is a duplicate of #680, fixed in commit cb5f622c (#683). This
// suite is a cross-path regression guard that exercises BOTH save paths end to
// end (the existing section-break-roundtrip.test.ts only covers the
// parseDocumentBody/serializeDocumentBody helpers, not repackDocx or the PM
// conversion). It passes on current main; it would fail if the paragraph-level
// sectPr emission regressed.

const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
    <w:p><w:r><w:t>Second section</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

async function buildTwoSectionDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels')!.file('.rels', RELS);
  zip.folder('word')!.file('document.xml', DOC_XML);
  return zip.generateAsync({ type: 'arraybuffer' });
}

async function readDocumentXml(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/document.xml')!.async('text');
}

function countSectPr(xml: string): number {
  // Matches both `<w:sectPr>` and `<w:sectPr ...>` but not a bare prefix.
  return (xml.match(/<w:sectPr[ >]/g) ?? []).length;
}

describe('issue #804: inline (paragraph-level) sectPr survives save', () => {
  test('parser retains the paragraph-level w:pPr/w:sectPr', async () => {
    const doc = await parseDocx(await buildTwoSectionDocx());
    const firstPara = doc.package.document.content[0] as Paragraph;
    expect(firstPara.type).toBe('paragraph');
    expect(firstPara.sectionProperties).toBeDefined();
    expect(firstPara.sectionProperties?.pageWidth).toBe(12240);
    expect(firstPara.sectionProperties?.sectionStart).toBe('nextPage');
    expect(doc.package.document.finalSectionProperties?.orientation).toBe('landscape');
  });

  test('repackDocx (headless) keeps both sections', async () => {
    const doc = await parseDocx(await buildTwoSectionDocx());
    const repacked = await repackDocx(doc);
    const xml = await readDocumentXml(repacked);

    // Both sections survive: one inside the paragraph, one final on the body.
    expect(countSectPr(xml)).toBe(2);
    // The inline sectPr lives inside the paragraph's pPr, before run content.
    expect(xml).toMatch(/<w:p><w:pPr><w:sectPr>.*?<\/w:sectPr><\/w:pPr><w:r>/s);
    expect(xml).toContain('<w:pgSz w:w="12240" w:h="15840"/>');
    expect(xml).toContain('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>');
  });

  test('React save() / PM path (toProseDoc -> fromProseDoc -> serialize) keeps both sections', async () => {
    const doc = await parseDocx(await buildTwoSectionDocx());

    // This is what the editor save() flow does: round-trips the model through
    // the ProseMirror document before serializing.
    const pmDoc = toProseDoc(doc);
    const backToModel = fromProseDoc(pmDoc, doc);

    const firstPara = backToModel.package.document.content[0] as Paragraph;
    expect(firstPara.sectionProperties).toBeDefined();
    expect(firstPara.sectionProperties?.pageWidth).toBe(12240);
    expect(backToModel.package.document.finalSectionProperties?.orientation).toBe('landscape');

    const xml = serializeDocument(backToModel);
    expect(countSectPr(xml)).toBe(2);
    expect(xml).toMatch(/<w:pPr><w:sectPr>.*?<\/w:sectPr><\/w:pPr>/s);
  });
});
