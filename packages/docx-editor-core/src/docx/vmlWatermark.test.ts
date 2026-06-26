import { describe, test, expect } from 'bun:test';
import type { Document, HeaderFooter, TextWatermark } from '../types/document';
import { parseXml, type XmlElement } from './xmlParser';
import { extractWatermark } from './vmlWatermarkParser';
import { serializeWatermark } from './serializer/vmlWatermarkSerializer';
import { serializeHeaderFooter } from './serializer/headerFooterSerializer';
import { getDocumentWatermark, setDocumentWatermark } from './watermarkApi';

const TEXT_WATERMARK_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <w:p><w:r><w:rPr><w:noProof/></w:rPr><w:pict>
    <v:shape id="PowerPlusWaterMarkObject1" type="#_x0000_t136"
      style="position:absolute;width:415.2pt;height:207.6pt;rotation:315" fillcolor="#c0c0c0" stroked="f">
      <v:fill opacity=".5"/>
      <v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="CONFIDENTIAL"/>
    </v:shape>
  </w:pict></w:r></w:p>
  <w:p><w:r><w:t>Header text</w:t></w:r></w:p>
</w:hdr>`;

function hdrRoot(xml: string): XmlElement {
  const doc = parseXml(xml);
  return doc.elements!.find((e) => e.type === 'element' && e.name?.endsWith('hdr')) as XmlElement;
}

describe('extractWatermark', () => {
  test('parses a diagonal semitransparent text watermark', () => {
    const wm = extractWatermark(hdrRoot(TEXT_WATERMARK_HEADER));
    expect(wm).toBeDefined();
    expect(wm!.kind).toBe('text');
    const t = wm as TextWatermark;
    expect(t.text).toBe('CONFIDENTIAL');
    expect(t.font).toBe('Calibri');
    expect(t.color).toBe('#c0c0c0');
    expect(t.layout).toBe('diagonal');
    expect(t.semitransparent).toBe(true);
  });

  test('horizontal watermark when no rotation', () => {
    const xml = TEXT_WATERMARK_HEADER.replace(';rotation:315', '');
    const wm = extractWatermark(hdrRoot(xml)) as TextWatermark;
    expect(wm.layout).toBe('horizontal');
  });

  test('returns undefined for a header with no watermark', () => {
    const xml = `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Plain</w:t></w:r></w:p></w:hdr>`;
    expect(extractWatermark(hdrRoot(xml))).toBeUndefined();
  });
});

describe('serializeWatermark → extractWatermark round-trip', () => {
  test('text watermark survives a round-trip', () => {
    const original: TextWatermark = {
      kind: 'text',
      text: 'DRAFT',
      font: 'Arial',
      color: '#FF0000',
      semitransparent: false,
      layout: 'horizontal',
    };
    const xml = `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">${serializeWatermark(
      original
    )}</w:hdr>`;
    const parsed = extractWatermark(hdrRoot(xml)) as TextWatermark;
    expect(parsed.text).toBe('DRAFT');
    expect(parsed.font).toBe('Arial');
    expect(parsed.color).toBe('#FF0000');
    expect(parsed.layout).toBe('horizontal');
    expect(parsed.semitransparent).toBe(false);
  });

  test('header serializer prepends the watermark before content', () => {
    const hf: HeaderFooter = {
      type: 'header',
      hdrFtrType: 'default',
      content: [{ type: 'paragraph', content: [] }],
      watermark: {
        kind: 'text',
        text: 'SAMPLE',
        font: 'Calibri',
        color: '#C0C0C0',
        semitransparent: true,
        layout: 'diagonal',
      },
    };
    const xml = serializeHeaderFooter(hf);
    expect(xml).toContain('v:textpath');
    expect(xml).toContain('string="SAMPLE"');
    // Watermark pict precedes the body paragraph.
    expect(xml.indexOf('v:textpath')).toBeLessThan(xml.lastIndexOf('<w:p>'));
  });
});

describe('document watermark API', () => {
  function docWithHeader(): Document {
    const headers = new Map<string, HeaderFooter>([
      ['rId10', { type: 'header', hdrFtrType: 'default', content: [] }],
    ]);
    return {
      package: {
        document: { content: [] },
        headers,
        relationships: new Map(),
      },
    } as unknown as Document;
  }

  test('set then get returns the watermark on all headers', () => {
    const doc = docWithHeader();
    const wm: TextWatermark = {
      kind: 'text',
      text: 'URGENT',
      font: 'Calibri',
      color: '#C0C0C0',
      semitransparent: true,
      layout: 'diagonal',
    };
    const next = setDocumentWatermark(doc, wm);
    expect(getDocumentWatermark(next)).toEqual(wm);
    // Original document is untouched (immutability).
    expect(getDocumentWatermark(doc)).toBeUndefined();
  });

  test('remove clears the watermark', () => {
    const doc = setDocumentWatermark(docWithHeader(), {
      kind: 'text',
      text: 'X',
      font: 'Calibri',
      color: '#000',
      semitransparent: false,
      layout: 'horizontal',
    });
    const cleared = setDocumentWatermark(doc, null);
    expect(getDocumentWatermark(cleared)).toBeUndefined();
  });

  test('creates a default header when the document has none', () => {
    const doc = {
      package: {
        document: { content: [], finalSectionProperties: {} },
        headers: new Map(),
        relationships: new Map(),
      },
    } as unknown as Document;
    const next = setDocumentWatermark(doc, {
      kind: 'text',
      text: 'NEW',
      font: 'Calibri',
      color: '#000',
      semitransparent: false,
      layout: 'horizontal',
    });
    expect(next.package.headers!.size).toBe(1);
    expect(getDocumentWatermark(next)).toBeDefined();
    const sp = next.package.document.finalSectionProperties!;
    expect(sp.headerReferences?.some((r) => r.type === 'default')).toBe(true);
  });
});
