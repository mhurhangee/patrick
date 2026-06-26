import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import { parseDocx } from '../parser';
import { repackDocx } from '../rezip';
import { getEmbeddedFontFaces } from '../../utils/embeddedFonts';
import { deobfuscateFont } from '../../utils/fontDeobfuscation';

const GUID = '{001B70DC-AA60-4AD5-90EC-18A0948E1EAE}';

// A 48-byte stand-in font: TrueType sfnt signature + filler. We obfuscate it so
// the parse path has to de-obfuscate to recover the recognizable header.
function makeFont(): Uint8Array {
  const font = new Uint8Array(48);
  font.set([0x00, 0x01, 0x00, 0x00], 0);
  for (let i = 4; i < 48; i++) font[i] = (i * 17 + 5) & 0xff;
  return font;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
</Types>`;

const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:rFonts w:ascii="My Brand Sans" w:hAnsi="My Brand Sans"/></w:rPr><w:t>Hello</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const FONT_TABLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
         xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:font w:name="My Brand Sans">
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
    <w:embedRegular r:id="rId1" w:fontKey="${GUID}" w:subsetted="true"/>
  </w:font>
</w:fonts>`;

const FONT_TABLE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font1.odttf"/>
</Relationships>`;

async function buildDocx(obfuscatedFont: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', PACKAGE_RELS);
  zip.file('word/document.xml', DOCUMENT_XML);
  zip.file('word/fontTable.xml', FONT_TABLE_XML);
  zip.file('word/_rels/fontTable.xml.rels', FONT_TABLE_RELS);
  zip.file('word/fonts/font1.odttf', obfuscatedFont);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('Embedded fonts — parse + de-obfuscation through parseDocx', () => {
  const font = makeFont();
  const obfuscated = deobfuscateFont(new Uint8Array(font).buffer as ArrayBuffer, GUID);

  test('parseDocx populates pkg.fontTable with the embedded face', async () => {
    const buffer = await buildDocx(obfuscated);
    const doc = await parseDocx(buffer);

    const table = doc.package.fontTable;
    expect(table).toBeDefined();
    const brand = table!.fonts.find((f) => f.name === 'My Brand Sans');
    expect(brand).toBeDefined();
    expect(brand!.embedRegular).toEqual({
      relId: 'rId1',
      fontKey: GUID,
      subsetted: true,
    });
  });

  test('the embedded face de-obfuscates back to a valid sfnt font', async () => {
    const buffer = await buildDocx(obfuscated);
    const doc = await parseDocx(buffer);

    // Reconstruct the raw font map + rels the loader sees at runtime.
    const rawFonts = new Map<string, ArrayBuffer>([['word/fonts/font1.odttf', obfuscated]]);
    const faces = getEmbeddedFontFaces(doc.package.fontTable, rawFonts, FONT_TABLE_RELS);

    expect(faces).toHaveLength(1);
    expect(faces[0].family).toBe('My Brand Sans');
    expect(faces[0].weight).toBe('normal');
    // The de-obfuscated bytes match the original font (TrueType signature).
    expect(Array.from(new Uint8Array(faces[0].data))).toEqual(Array.from(font));
  });

  test('round-trip preserves the embedded font binary untouched', async () => {
    const buffer = await buildDocx(obfuscated);
    const doc = await parseDocx(buffer);
    const repacked = await repackDocx(doc, { updateModifiedDate: false });

    const outZip = await JSZip.loadAsync(repacked);
    const out = outZip.file('word/fonts/font1.odttf');
    expect(out).not.toBeNull();
    const outBytes = new Uint8Array(await out!.async('arraybuffer'));
    // Still obfuscated, byte-identical to what we packed.
    expect(Array.from(outBytes)).toEqual(Array.from(new Uint8Array(obfuscated)));
  });
});
