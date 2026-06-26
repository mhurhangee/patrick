import { describe, test, expect } from 'bun:test';
import { getEmbeddedFontFaces } from '../embeddedFonts';
import { deobfuscateFont } from '../fontDeobfuscation';
import type { FontTable } from '../../types/styles';

const GUID = '{001B70DC-AA60-4AD5-90EC-18A0948E1EAE}';

// A 40-byte "font": recognizable de-obfuscated header + tail. We obfuscate it
// so the loader has to reverse the XOR to recover these exact bytes.
function makeRealFont(): Uint8Array {
  const font = new Uint8Array(40);
  font.set([0x00, 0x01, 0x00, 0x00], 0); // TrueType sfnt version
  for (let i = 4; i < 40; i++) font[i] = (i * 13 + 7) & 0xff;
  return font;
}

function obfuscate(font: Uint8Array, guid: string): ArrayBuffer {
  // deobfuscateFont is its own inverse, so we reuse it to produce obfuscated bytes.
  return deobfuscateFont(new Uint8Array(font).buffer as ArrayBuffer, guid);
}

const RELS_XML = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font1.odttf"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font2.odttf"/>
</Relationships>`;

describe('getEmbeddedFontFaces', () => {
  const realFont = makeRealFont();

  function buildInputs() {
    const table: FontTable = {
      fonts: [
        { name: 'Plain' }, // no embeds
        {
          name: 'My Brand Sans',
          embedRegular: { relId: 'rId1', fontKey: GUID, subsetted: true },
          embedBold: { relId: 'rId2', fontKey: GUID },
        },
      ],
    };
    const rawFonts = new Map<string, ArrayBuffer>([
      ['word/fonts/font1.odttf', obfuscate(realFont, GUID)],
      ['word/fonts/font2.odttf', obfuscate(realFont, GUID)],
    ]);
    return { table, rawFonts };
  }

  test('returns one face per embed, de-obfuscated to the real font bytes', () => {
    const { table, rawFonts } = buildInputs();
    const faces = getEmbeddedFontFaces(table, rawFonts, RELS_XML);

    expect(faces).toHaveLength(2);
    for (const face of faces) {
      expect(face.family).toBe('My Brand Sans');
      expect(Array.from(new Uint8Array(face.data).slice(0, 4))).toEqual([0x00, 0x01, 0x00, 0x00]);
    }
  });

  test('maps embed kind to weight/style', () => {
    const { table, rawFonts } = buildInputs();
    const faces = getEmbeddedFontFaces(table, rawFonts, RELS_XML);
    const regular = faces.find((f) => f.weight === 'normal' && f.style === 'normal');
    const bold = faces.find((f) => f.weight === 'bold' && f.style === 'normal');
    expect(regular).toBeDefined();
    expect(bold).toBeDefined();
  });

  test('skips fonts with no embedded faces', () => {
    const { table, rawFonts } = buildInputs();
    const faces = getEmbeddedFontFaces(table, rawFonts, RELS_XML);
    expect(faces.some((f) => f.family === 'Plain')).toBe(false);
  });

  test('skips an embed whose relationship target is missing from the package', () => {
    const table: FontTable = {
      fonts: [{ name: 'Ghost', embedRegular: { relId: 'rIdX', fontKey: GUID } }],
    };
    const faces = getEmbeddedFontFaces(table, new Map(), RELS_XML);
    expect(faces).toEqual([]);
  });

  test('resolves font file paths case-insensitively', () => {
    const table: FontTable = {
      fonts: [{ name: 'Case', embedRegular: { relId: 'rId1', fontKey: GUID } }],
    };
    const rawFonts = new Map<string, ArrayBuffer>([
      ['word/Fonts/Font1.ODTTF', obfuscate(realFont, GUID)],
    ]);
    const faces = getEmbeddedFontFaces(table, rawFonts, RELS_XML);
    expect(faces).toHaveLength(1);
  });

  test('returns empty when no font table', () => {
    expect(getEmbeddedFontFaces(undefined, new Map(), RELS_XML)).toEqual([]);
    expect(getEmbeddedFontFaces({ fonts: [] }, new Map(), null)).toEqual([]);
  });
});
