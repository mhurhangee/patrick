/**
 * Issue #947 — DOCX export drops explicit per-cell `nil` `<w:tcBorders>`.
 *
 * A common form/layout pattern: the table sets a default grid
 * (`<w:tblBorders>` with `insideH`/`insideV` = `single`) and then HIDES that
 * grid on individual cells via explicit `<w:tcBorders>` whose sides are
 * `<... w:val="nil"/>`. The editor renders these cells borderless (correct),
 * but the serializer treated an explicit `nil` border the same as "no border
 * specified" and emitted nothing. With the table default still `single`, every
 * hidden cell re-inherited the grid on reload.
 *
 * Save flow under test (React DocxEditor `save()`):
 *
 *     PM state  ->  fromProseDoc()  ->  Document  ->  serializeTable()  ->  XML
 *
 * The same drop-`nil` bug was copy-pasted across all three border serializers
 * (table `w:tcBorders`/`w:tblBorders`, paragraph `w:pBdr`, page `w:pgBorders`),
 * now unified in `serializeBorder`. Explicit `nil` (and `none`, the editor's
 * "remove border" intent) must survive serialization as `<w:side w:val="nil"/>`
 * so the override actually overrides.
 */

import { describe, test, expect } from 'bun:test';
import { schema } from '../../prosemirror/schema';
import { fromProseDoc } from '../../prosemirror/conversion/fromProseDoc';
import { serializeTable, serializeTableCell } from '../serializer/tableSerializer';
import { serializeBorder } from '../serializer/borderSerializer';
import { serializeParagraphBorders } from '../serializer/paragraphSerializer/properties';
import { serializeSectionProperties } from '../serializer/sectionPropertiesSerializer';
import type { Document, Table, TableBorders, TableCellFormatting } from '../../types/document';

const NIL_SIDES: TableBorders = {
  top: { style: 'nil' },
  left: { style: 'nil' },
  bottom: { style: 'nil' },
  right: { style: 'nil' },
};

function cellNode(text: string, original?: TableCellFormatting) {
  return {
    type: 'tableCell',
    attrs: { colspan: 1, rowspan: 1, _originalFormatting: original ?? null },
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  };
}

function firstTable(doc: Document): Table {
  const table = doc.package.document.content?.find((b) => b.type === 'table');
  if (!table || table.type !== 'table') throw new Error('expected a table block');
  return table;
}

describe('serializeBorder — explicit nil/none override an inherited border (#947)', () => {
  test('nil emits the side with just w:val (no sz/color)', () => {
    expect(serializeBorder({ style: 'nil' }, 'top')).toBe('<w:top w:val="nil"/>');
  });

  test('none (editor "remove border") emits the side, not empty', () => {
    expect(serializeBorder({ style: 'none' }, 'left')).toBe('<w:left w:val="none"/>');
  });

  test('undefined border stays empty (nothing was specified)', () => {
    expect(serializeBorder(undefined, 'top')).toBe('');
  });

  test('happy path: a real border still serializes size and color', () => {
    const xml = serializeBorder({ style: 'single', size: 4, color: { rgb: 'FF0000' } }, 'bottom');
    expect(xml).toContain('w:val="single"');
    expect(xml).toContain('w:sz="4"');
    expect(xml).toContain('w:color="FF0000"');
  });

  test('file-derived style/color are XML-escaped (no attribute breakout)', () => {
    // The parser casts w:val/w:color without validating the enum, so a crafted
    // DOCX can carry markup here. It must not break out of the attribute.
    const xml = serializeBorder(
      {
        style: 'single"/><w:inject ' as never,
        color: { rgb: 'a"b' },
      },
      'top'
    );
    expect(xml).not.toContain('"/><w:inject');
    expect(xml).toContain('&quot;');
    expect(xml).not.toContain('w:color="a"b"');
  });
});

describe('issue #947 — explicit nil borders survive across all border families', () => {
  test('table cell: all-nil tcBorders are emitted (not dropped)', () => {
    const xml = serializeTableCell({
      type: 'tableCell',
      formatting: { borders: NIL_SIDES },
      content: [{ type: 'paragraph', content: [] }],
    });

    expect(xml).toContain('<w:tcBorders>');
    expect(xml).toContain('<w:top w:val="nil"/>');
    expect(xml).toContain('<w:left w:val="nil"/>');
    expect(xml).toContain('<w:bottom w:val="nil"/>');
    expect(xml).toContain('<w:right w:val="nil"/>');
  });

  test('table cell: a mixed override (one nil side, rest single) keeps the nil', () => {
    const xml = serializeTableCell({
      type: 'tableCell',
      formatting: {
        borders: {
          top: { style: 'single', size: 4 },
          bottom: { style: 'nil' },
        },
      },
      content: [{ type: 'paragraph', content: [] }],
    });
    expect(xml).toContain('<w:top w:val="single"');
    expect(xml).toContain('<w:bottom w:val="nil"/>');
  });

  test('paragraph: a nil w:pBdr side survives (overrides a styled border)', () => {
    const xml = serializeParagraphBorders({ bottom: { style: 'nil' } });
    expect(xml).toContain('<w:pBdr>');
    expect(xml).toContain('<w:bottom w:val="nil"/>');
  });

  test('paragraph: an all-nil w:pBdr still emits the container (not omitted)', () => {
    const xml = serializeParagraphBorders({
      top: { style: 'nil' },
      bottom: { style: 'nil' },
      left: { style: 'nil' },
      right: { style: 'nil' },
    });
    expect(xml).toContain('<w:pBdr>');
    expect(xml).toContain('<w:top w:val="nil"/>');
  });

  test('page: a nil w:pgBorders side survives', () => {
    const xml = serializeSectionProperties({
      pageBorders: {
        top: { style: 'nil' },
        bottom: { style: 'single', size: 4 },
      },
    } as Parameters<typeof serializeSectionProperties>[0]);
    expect(xml).toContain('<w:pgBorders');
    expect(xml).toContain('<w:top w:val="nil"/>');
  });

  test('page: an all-nil w:pgBorders still emits the container', () => {
    const xml = serializeSectionProperties({
      pageBorders: {
        top: { style: 'nil' },
        left: { style: 'nil' },
        bottom: { style: 'nil' },
        right: { style: 'nil' },
      },
    } as Parameters<typeof serializeSectionProperties>[0]);
    expect(xml).toContain('<w:pgBorders');
    expect(xml).toContain('<w:bottom w:val="nil"/>');
  });

  test('no borders set emits no container element (empty guard intact)', () => {
    const cellXml = serializeTableCell({
      type: 'tableCell',
      formatting: {},
      content: [{ type: 'paragraph', content: [] }],
    });
    expect(cellXml).not.toContain('<w:tcBorders');
    expect(serializeParagraphBorders(undefined)).toBe('');
    expect(serializeParagraphBorders({})).toBe('');
  });

  test('PM save path keeps a cell’s nil grid-hiding override (the #947 form)', () => {
    // Table default: grid on. One cell hides it with all-nil tcBorders.
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'table',
          attrs: {
            columnWidths: [2000, 2000],
            _originalFormatting: {
              borders: {
                top: { style: 'single', size: 4 },
                left: { style: 'single', size: 4 },
                bottom: { style: 'single', size: 4 },
                right: { style: 'single', size: 4 },
                insideH: { style: 'single', size: 4 },
                insideV: { style: 'single', size: 4 },
              },
            },
          },
          content: [
            {
              type: 'tableRow',
              attrs: {},
              content: [cellNode('hidden', { borders: NIL_SIDES }), cellNode('plain')],
            },
          ],
        },
      ],
    });

    const xml = serializeTable(firstTable(fromProseDoc(doc)));

    // Table default grid is still present...
    expect(xml).toContain('<w:tblBorders>');
    expect(xml).toContain('<w:insideH w:val="single"');
    // ...and the per-cell nil override survived, so the cell stays borderless
    // on reload instead of re-inheriting the single grid.
    expect(xml).toContain('<w:tcBorders>');
    expect(xml).toContain('<w:top w:val="nil"/>');
    expect(xml).toContain('<w:bottom w:val="nil"/>');
  });
});
