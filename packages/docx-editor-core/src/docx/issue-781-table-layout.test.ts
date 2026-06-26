/**
 * Issue #781 — table column widths not respected on export.
 *
 * Word treats `w:tblGrid`/`w:tcW` as preferred widths under the default
 * autofit layout and recomputes columns to fit content. A table the user has
 * given explicit column widths (by inserting one, or by dragging a column
 * boundary) must serialize with `<w:tblLayout w:type="fixed"/>` so Word honors
 * those widths. Imported tables keep their original layout.
 */

import { describe, expect, test } from 'bun:test';
import type { Document, Table } from '../types/document';
import { toProseDoc } from '../prosemirror/conversion/toProseDoc';
import { fromProseDoc } from '../prosemirror/conversion/fromProseDoc';
import { serializeTable } from './serializer/tableSerializer';

function makeDoc(table: Table): Document {
  return { package: { document: { content: [table] } } };
}

function firstTable(doc: Document): Table {
  return doc.package!.document!.content!.find((b) => b.type === 'table') as Table;
}

function cell(text: string, width?: number): Table['rows'][number]['cells'][number] {
  return {
    type: 'tableCell',
    formatting: width != null ? { width: { value: width, type: 'dxa' } } : undefined,
    content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text }] }] }],
  };
}

function twoColTable(layout?: 'fixed' | 'autofit'): Table {
  return {
    type: 'table',
    columnWidths: [4680, 4680],
    formatting: { width: { value: 9360, type: 'dxa' }, ...(layout ? { layout } : {}) },
    rows: [{ type: 'tableRow', cells: [cell('A', 4680), cell('B', 4680)] }],
  };
}

/** Edit a PM doc's first table: resize column 0 → [2340, 7020]. */
function resizeFirstColumn(pmDoc: ReturnType<typeof toProseDoc>) {
  const json = pmDoc.toJSON() as any;
  const find = (n: any): any =>
    n.type === 'table' ? n : ((n.content ?? []).map(find).find(Boolean) ?? null);
  const t = find(json);
  t.attrs.columnWidths = [2340, 7020];
  t.attrs.tableLayout = 'fixed';
  let col = 0;
  for (const c of t.content[0].content) {
    c.attrs.width = col === 0 ? 2340 : 7020;
    c.attrs.widthType = 'dxa';
    col++;
  }
  return pmDoc.type.schema.nodeFromJSON(json);
}

const layoutOf = (xml: string) => xml.match(/<w:tblLayout w:type="(\w+)"\/>/)?.[1] ?? null;
const gridOf = (xml: string) =>
  [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));

describe('issue #781 — fixed layout for explicit column widths', () => {
  test('a newly inserted-style table exports with fixed layout', () => {
    // No source formatting.layout; PM marks created tables fixed.
    const pmDoc = toProseDoc(makeDoc(twoColTable()));
    // Created tables come from the insert command with tableLayout:'fixed';
    // emulate that here by setting it on the converted node.
    const json = pmDoc.toJSON() as any;
    const find = (n: any): any =>
      n.type === 'table' ? n : ((n.content ?? []).map(find).find(Boolean) ?? null);
    find(json).attrs.tableLayout = 'fixed';
    const node = pmDoc.type.schema.nodeFromJSON(json);

    const xml = serializeTable(firstTable(fromProseDoc(node)));
    expect(layoutOf(xml)).toBe('fixed');
  });

  test('resizing a column switches the table to fixed layout and keeps widths', () => {
    const pmDoc = toProseDoc(makeDoc(twoColTable()));
    const resized = resizeFirstColumn(pmDoc);
    const xml = serializeTable(firstTable(fromProseDoc(resized)));

    expect(layoutOf(xml)).toBe('fixed');
    expect(gridOf(xml)).toEqual([2340, 7020]);
  });

  test('widths and fixed layout survive a repeated save (re-convert)', () => {
    const pmDoc = toProseDoc(makeDoc(twoColTable()));
    const resized = resizeFirstColumn(pmDoc);
    const doc1 = fromProseDoc(resized);

    // Second save cycle: Document → PM → Document → serialize.
    const doc2 = fromProseDoc(toProseDoc(doc1));
    const xml = serializeTable(firstTable(doc2));

    expect(layoutOf(xml)).toBe('fixed');
    expect(gridOf(xml)).toEqual([2340, 7020]);
  });

  test('an imported autofit table is not forced to fixed', () => {
    const pmDoc = toProseDoc(makeDoc(twoColTable('autofit')));
    const xml = serializeTable(firstTable(fromProseDoc(pmDoc)));
    expect(layoutOf(xml)).toBe('autofit');
  });

  test('an imported table with no explicit layout stays autofit-default (no tblLayout)', () => {
    const pmDoc = toProseDoc(makeDoc(twoColTable()));
    const xml = serializeTable(firstTable(fromProseDoc(pmDoc)));
    expect(layoutOf(xml)).toBeNull();
  });

  test('tblLayout is emitted in CT_TblPrBase sequence order (shd < tblLayout < tblCellMar)', () => {
    // A fixed table that also carries shading and default cell margins — the
    // combination that exposed the schema-ordering bug.
    const table: Table = {
      type: 'table',
      columnWidths: [4680, 4680],
      formatting: {
        width: { value: 9360, type: 'dxa' },
        layout: 'fixed',
        shading: { fill: { rgb: 'D9D9D9' } },
        cellMargins: { top: { value: 80, type: 'dxa' }, left: { value: 120, type: 'dxa' } },
      },
      rows: [{ type: 'tableRow', cells: [cell('A', 4680), cell('B', 4680)] }],
    };
    const xml = serializeTable(firstTable(fromProseDoc(toProseDoc(makeDoc(table)))));
    const idx = (tag: string) => xml.indexOf(tag);
    expect(idx('<w:shd')).toBeGreaterThanOrEqual(0);
    expect(idx('<w:tblLayout')).toBeGreaterThanOrEqual(0);
    expect(idx('<w:tblCellMar')).toBeGreaterThanOrEqual(0);
    expect(idx('<w:shd')).toBeLessThan(idx('<w:tblLayout'));
    expect(idx('<w:tblLayout')).toBeLessThan(idx('<w:tblCellMar'));
  });
});
