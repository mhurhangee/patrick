import { describe, test, expect } from 'bun:test';
import { parseDocumentBody } from '../documentParser';
import { serializeDocumentBody } from '../serializer/documentSerializer';
import { parseHeaderFooter } from '../headerFooterParser';
import { serializeHeaderFooter } from '../serializer/headerFooterSerializer';
import type { BlockSdt, DocumentBody } from '../../types/document';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const W15 = 'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"';

function body(inner: string): DocumentBody {
  return parseDocumentBody(`<w:document ${W} ${W15}><w:body>${inner}</w:body></w:document>`);
}

function firstBlockSdt(doc: DocumentBody): BlockSdt {
  const block = doc.content[0];
  if (block?.type !== 'blockSdt') {
    throw new Error(`Expected first block to be blockSdt, got ${block?.type}`);
  }
  return block;
}

/**
 * Round-trip tests for block-level SDTs (#622). The parser must stop
 * flattening `w:sdt` and emit a `BlockSdt`; the serializer must replay the
 * captured `w:sdtPr`/`w:sdtEndPr` verbatim so content controls survive a
 * load → save cycle losslessly.
 */
describe('block SDT parsing', () => {
  test('a block SDT wrapping a paragraph is preserved (not flattened)', () => {
    const doc = body(`
      <w:sdt>
        <w:sdtPr><w:alias w:val="intro"/><w:tag w:val="intro-tag"/></w:sdtPr>
        <w:sdtContent>
          <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
        </w:sdtContent>
      </w:sdt>
    `);

    expect(doc.content).toHaveLength(1);
    const sdt = firstBlockSdt(doc);
    expect(sdt.content).toHaveLength(1);
    expect(sdt.content[0].type).toBe('paragraph');
    expect(sdt.properties.alias).toBe('intro');
    expect(sdt.properties.tag).toBe('intro-tag');
  });

  test('a block SDT wrapping a table is preserved', () => {
    const doc = body(`
      <w:sdt>
        <w:sdtPr><w:tag w:val="grid"/></w:sdtPr>
        <w:sdtContent>
          <w:tbl>
            <w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc></w:tr>
          </w:tbl>
        </w:sdtContent>
      </w:sdt>
    `);

    const sdt = firstBlockSdt(doc);
    expect(sdt.content[0].type).toBe('table');
  });

  test('a block SDT wrapping multiple children keeps document order', () => {
    const doc = body(`
      <w:sdt>
        <w:sdtPr><w:tag w:val="multi"/></w:sdtPr>
        <w:sdtContent>
          <w:p><w:r><w:t>one</w:t></w:r></w:p>
          <w:p><w:r><w:t>two</w:t></w:r></w:p>
          <w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        </w:sdtContent>
      </w:sdt>
    `);

    const sdt = firstBlockSdt(doc);
    expect(sdt.content.map((c) => c.type)).toEqual(['paragraph', 'paragraph', 'table']);
  });

  test('a nested block SDT is preserved', () => {
    const doc = body(`
      <w:sdt>
        <w:sdtPr><w:tag w:val="outer"/></w:sdtPr>
        <w:sdtContent>
          <w:sdt>
            <w:sdtPr><w:tag w:val="inner"/></w:sdtPr>
            <w:sdtContent><w:p><w:r><w:t>deep</w:t></w:r></w:p></w:sdtContent>
          </w:sdt>
        </w:sdtContent>
      </w:sdt>
    `);

    const outer = firstBlockSdt(doc);
    expect(outer.properties.tag).toBe('outer');
    expect(outer.content[0].type).toBe('blockSdt');
    const inner = outer.content[0] as BlockSdt;
    expect(inner.properties.tag).toBe('inner');
    expect(inner.content[0].type).toBe('paragraph');
  });

  test('an empty / contentless SDT does not throw and yields an empty wrapper', () => {
    const doc = body(`<w:sdt><w:sdtPr><w:tag w:val="empty"/></w:sdtPr></w:sdt>`);
    const sdt = firstBlockSdt(doc);
    expect(sdt.content).toHaveLength(0);
    expect(sdt.properties.tag).toBe('empty');
  });

  test('projects id, lock, placeholder, and defaults type to richText', () => {
    const doc = body(`
      <w:sdt>
        <w:sdtPr>
          <w:id w:val="123456"/>
          <w:alias w:val="A"/>
          <w:tag w:val="T"/>
          <w:lock w:val="sdtContentLocked"/>
          <w:placeholder><w:docPart w:val="MyPlaceholder"/></w:placeholder>
        </w:sdtPr>
        <w:sdtContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:sdtContent>
      </w:sdt>
    `);
    const { properties } = firstBlockSdt(doc);
    expect(properties.id).toBe(123456);
    expect(properties.lock).toBe('sdtContentLocked');
    expect(properties.placeholder).toBe('MyPlaceholder');
    expect(properties.sdtType).toBe('richText');
  });

  test('present-but-unmodeled type marker maps honestly (not richText)', () => {
    const doc = body(`
      <w:sdt>
        <w:sdtPr><w:tag w:val="biblio"/><w:bibliography/></w:sdtPr>
        <w:sdtContent><w:p><w:r><w:t>cite</w:t></w:r></w:p></w:sdtContent>
      </w:sdt>
    `);
    expect(firstBlockSdt(doc).properties.sdtType).toBe('bibliography');
  });
});

describe('block SDT serialization round-trip', () => {
  function roundtrip(inner: string): string {
    return serializeDocumentBody(body(inner));
  }

  test('preserves the wrapper, alias, tag and id on save', () => {
    const out = roundtrip(`
      <w:sdt>
        <w:sdtPr><w:id w:val="42"/><w:alias w:val="title"/><w:tag w:val="title-tag"/></w:sdtPr>
        <w:sdtContent><w:p><w:r><w:t>Body</w:t></w:r></w:p></w:sdtContent>
      </w:sdt>
    `);
    expect(out).toContain('<w:sdt>');
    expect(out).toContain('<w:sdtContent>');
    expect(out).toContain('w:val="title-tag"');
    expect(out).toContain('w:val="42"');
    expect(out).toContain('Body');
  });

  test('unmodeled sdtPr features (w:dataBinding) survive byte-faithfully', () => {
    const out = roundtrip(`
      <w:sdt>
        <w:sdtPr>
          <w:alias w:val="bound"/>
          <w:dataBinding w:xpath="/ns0:root/ns0:f" w:storeItemID="{GUID}"/>
          <w:text/>
        </w:sdtPr>
        <w:sdtContent><w:p><w:r><w:t>v</w:t></w:r></w:p></w:sdtContent>
      </w:sdt>
    `);
    expect(out).toContain('w:dataBinding');
    expect(out).toContain('w:xpath="/ns0:root/ns0:f"');
    expect(out).toContain('w:storeItemID="{GUID}"');
  });

  test('preserves sdtPr child ordering and emits exactly one of each managed element', () => {
    const out = roundtrip(`
      <w:sdt>
        <w:sdtPr>
          <w:alias w:val="A"/>
          <w:tag w:val="T"/>
          <w:lock w:val="sdtContentLocked"/>
          <w:dataBinding w:xpath="/a" w:storeItemID="{G}"/>
          <w:comboBox><w:listItem w:displayText="One" w:value="1"/></w:comboBox>
        </w:sdtPr>
        <w:sdtContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:sdtContent>
      </w:sdt>
    `);
    // verbatim replay → exactly one lock, dataBinding before the type marker
    expect((out.match(/<w:lock /g) ?? []).length).toBe(1);
    expect(out.indexOf('w:dataBinding')).toBeLessThan(out.indexOf('w:comboBox'));
  });

  test('dropDownList items and lastValue round-trip', () => {
    const out = roundtrip(`
      <w:sdt>
        <w:sdtPr>
          <w:tag w:val="dd"/>
          <w:dropDownList w:lastValue="2">
            <w:listItem w:displayText="One" w:value="1"/>
            <w:listItem w:displayText="Two" w:value="2"/>
          </w:dropDownList>
        </w:sdtPr>
        <w:sdtContent><w:p><w:r><w:t>Two</w:t></w:r></w:p></w:sdtContent>
      </w:sdt>
    `);
    expect(out).toContain('w:lastValue="2"');
    expect(out).toContain('w:displayText="One"');
    expect(out).toContain('w:displayText="Two"');
  });

  test('w:sdtEndPr is preserved', () => {
    const out = roundtrip(`
      <w:sdt>
        <w:sdtPr><w:tag w:val="ep"/></w:sdtPr>
        <w:sdtEndPr><w:rPr><w:b/></w:rPr></w:sdtEndPr>
        <w:sdtContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:sdtContent>
      </w:sdt>
    `);
    expect(out).toContain('w:sdtEndPr');
  });

  test('an unmodeled type marker is not replaced by w:richText', () => {
    const out = roundtrip(`
      <w:sdt>
        <w:sdtPr><w:tag w:val="g"/><w:group/></w:sdtPr>
        <w:sdtContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:sdtContent>
      </w:sdt>
    `);
    expect(out).toContain('<w:group/>');
    expect(out).not.toContain('<w:richText/>');
  });

  test('a nested block SDT round-trips both wrappers', () => {
    const out = roundtrip(`
      <w:sdt>
        <w:sdtPr><w:tag w:val="outer"/></w:sdtPr>
        <w:sdtContent>
          <w:sdt>
            <w:sdtPr><w:tag w:val="inner"/></w:sdtPr>
            <w:sdtContent><w:p><w:r><w:t>deep</w:t></w:r></w:p></w:sdtContent>
          </w:sdt>
        </w:sdtContent>
      </w:sdt>
    `);
    expect((out.match(/<w:sdt>/g) ?? []).length).toBe(2);
    expect(out).toContain('w:val="outer"');
    expect(out).toContain('w:val="inner"');
    expect(out).toContain('deep');
  });

  test('bookmarks inside sdtContent survive the round trip', () => {
    const out = roundtrip(`
      <w:sdt>
        <w:sdtPr><w:tag w:val="bm"/></w:sdtPr>
        <w:sdtContent>
          <w:p>
            <w:bookmarkStart w:id="1" w:name="anchor"/>
            <w:r><w:t>marked</w:t></w:r>
            <w:bookmarkEnd w:id="1"/>
          </w:p>
        </w:sdtContent>
      </w:sdt>
    `);
    expect(out).toContain('w:bookmarkStart');
    expect(out).toContain('w:name="anchor"');
    expect(out).toContain('w:bookmarkEnd');
  });
});

describe('block SDT in header round-trip (namespace interop)', () => {
  // A w15:-namespaced control surviving via verbatim passthrough is only
  // valid if the header part declares the w15 namespace at its root.
  // Guards against a Word "unreadable content" repair prompt.
  test('w15:repeatingSection in a header sdtPr round-trips with its namespace declared', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:hdr ${W} ${W15}>
        <w:sdt>
          <w:sdtPr>
            <w:tag w:val="repeat"/>
            <w:id w:val="99"/>
            <w15:repeatingSection/>
          </w:sdtPr>
          <w:sdtContent>
            <w:p><w:r><w:t>row</w:t></w:r></w:p>
          </w:sdtContent>
        </w:sdt>
      </w:hdr>`;

    const hf = parseHeaderFooter(xml, /* isHeader */ true);
    expect(hf.content[0]?.type).toBe('blockSdt');

    const out = serializeHeaderFooter(hf);
    // The unmodeled w15 marker survives...
    expect(out).toContain('w15:repeatingSection');
    // ...and the header root declares the w15 namespace it depends on.
    expect(out).toContain('xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"');
    expect(out).toContain('w:val="repeat"');
    expect(out).toContain('row');
  });
});
