import { describe, test, expect } from 'bun:test';
import { parseFontTable } from '../fontTableParser';

const FONT_TABLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
         xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:font w:name="Calibri">
    <w:charset w:val="00"/>
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
  </w:font>
  <w:font w:name="My Brand Sans">
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
    <w:embedRegular r:id="rId1" w:fontKey="{001B70DC-AA60-4AD5-90EC-18A0948E1EAE}" w:subsetted="true"/>
    <w:embedBold r:id="rId2" w:fontKey="{11223344-5566-7788-99AA-BBCCDDEEFF00}"/>
    <w:embedItalic r:id="rId3" w:fontKey="{22334455-6677-8899-AABB-CCDDEEFF0011}"/>
    <w:embedBoldItalic r:id="rId4" w:fontKey="{33445566-7788-99AA-BBCC-DDEEFF001122}"/>
  </w:font>
</w:fonts>`;

describe('parseFontTable', () => {
  test('parses every font entry with its name', () => {
    const table = parseFontTable(FONT_TABLE_XML);
    expect(table.fonts.map((f) => f.name)).toEqual(['Calibri', 'My Brand Sans']);
  });

  test('captures family and pitch metadata', () => {
    const table = parseFontTable(FONT_TABLE_XML);
    const calibri = table.fonts[0];
    expect(calibri.family).toBe('swiss');
    expect(calibri.pitch).toBe('variable');
  });

  test('captures all four embedded faces with relId, fontKey, subsetted', () => {
    const table = parseFontTable(FONT_TABLE_XML);
    const brand = table.fonts[1];
    expect(brand.embedRegular).toEqual({
      relId: 'rId1',
      fontKey: '{001B70DC-AA60-4AD5-90EC-18A0948E1EAE}',
      subsetted: true,
    });
    expect(brand.embedBold?.relId).toBe('rId2');
    expect(brand.embedItalic?.relId).toBe('rId3');
    expect(brand.embedBoldItalic?.relId).toBe('rId4');
    // subsetted defaults to false/undefined when the attribute is absent.
    expect(brand.embedBold?.subsetted).toBeFalsy();
  });

  test('non-embedded fonts have no embed faces', () => {
    const table = parseFontTable(FONT_TABLE_XML);
    expect(table.fonts[0].embedRegular).toBeUndefined();
  });

  test('returns empty table for empty or null input', () => {
    expect(parseFontTable(null).fonts).toEqual([]);
    expect(parseFontTable('').fonts).toEqual([]);
  });
});
