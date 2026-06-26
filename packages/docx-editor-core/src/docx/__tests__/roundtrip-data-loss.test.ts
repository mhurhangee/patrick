import { describe, expect, test } from 'bun:test';
import { parseDocumentBody } from '../documentParser';
import { serializeDocumentBody } from '../serializer/documentSerializer';
import type { Paragraph, Table } from '../../types/document';

// Companion to issue #680: an audit of parse↔serialize symmetry surfaced more
// fields the parser read into the model but the serializer never wrote back, so
// a headless parseDocx → repackDocx silently dropped them. These cover the
// confirmed cases.

function wrapBody(inner: string): string {
  return `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${inner}</w:body></w:document>`;
}

function roundtrip(inner: string) {
  const body = parseDocumentBody(wrapBody(inner));
  const xml = serializeDocumentBody(body);
  return { xml, reparsed: parseDocumentBody(wrapBody(xml)) };
}

describe('round-trip data loss sweep', () => {
  // An explicit `w:val="0"` cancels a value inherited from the style. Emitting
  // nothing for `false` re-inherits the style value on the next open.
  describe('explicit-false formatting overrides survive', () => {
    test('run character toggles (strike, smallCaps, rtl) keep their explicit false', () => {
      const { xml, reparsed } = roundtrip(
        '<w:p><w:r><w:rPr><w:strike w:val="0"/><w:smallCaps w:val="0"/><w:rtl w:val="0"/></w:rPr><w:t>x</w:t></w:r></w:p>'
      );
      expect(xml).toContain('<w:strike w:val="0"/>');
      expect(xml).toContain('<w:smallCaps w:val="0"/>');
      expect(xml).toContain('<w:rtl w:val="0"/>');

      const run = (reparsed.content[0] as Paragraph).content[0];
      if (run.type !== 'run') throw new Error(`expected run, got ${run.type}`);
      expect(run.formatting?.strike).toBe(false);
      expect(run.formatting?.smallCaps).toBe(false);
      expect(run.formatting?.rtl).toBe(false);
    });

    test('paragraph pagination flags (keepNext) keep their explicit false', () => {
      const { xml, reparsed } = roundtrip(
        '<w:p><w:pPr><w:keepNext w:val="0"/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>'
      );
      expect(xml).toContain('<w:keepNext w:val="0"/>');
      expect((reparsed.content[0] as Paragraph).formatting?.keepNext).toBe(false);
    });

    test('explicit true still emits the bare element (no regression)', () => {
      const { xml } = roundtrip(
        '<w:p><w:pPr><w:keepNext/></w:pPr><w:r><w:rPr><w:strike/></w:rPr><w:t>x</w:t></w:r></w:p>'
      );
      expect(xml).toContain('<w:keepNext/>');
      expect(xml).toContain('<w:strike/>');
      expect(xml).not.toContain('<w:keepNext w:val="0"/>');
    });

    test('absent flag stays absent', () => {
      const { xml } = roundtrip('<w:p><w:r><w:t>x</w:t></w:r></w:p>');
      expect(xml).not.toContain('<w:strike');
      expect(xml).not.toContain('<w:keepNext');
    });
  });

  // Row-level cnfStyle carries table-style context (header row / banding) that
  // Word resolves from the table style. The cell path already serialized it;
  // the row path dropped it.
  test('table row conditional format (w:trPr/w:cnfStyle) survives', () => {
    const inner =
      '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>' +
      '<w:tr><w:trPr><w:cnfStyle w:val="100000000000"/></w:trPr>' +
      '<w:tc><w:p><w:r><w:t>h</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    const { xml, reparsed } = roundtrip(inner);

    expect(xml).toContain('<w:cnfStyle w:val="100000000000"/>');
    const table = reparsed.content[0] as Table;
    expect(table.rows[0].formatting?.conditionalFormat?.firstRow).toBe(true);
  });
});
