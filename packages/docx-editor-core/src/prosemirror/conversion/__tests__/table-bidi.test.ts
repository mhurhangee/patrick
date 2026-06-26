import { afterAll, beforeAll, describe, test, expect } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { DOMSerializer } from 'prosemirror-model';
import { toProseDoc } from '../toProseDoc';
import { fromProseDoc } from '../fromProseDoc';
import { schema } from '../../schema';
import type { Document, Table, TableRow, TableCell } from '../../../types/document';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function makeCell(): TableCell {
  return {
    type: 'tableCell',
    content: [{ type: 'paragraph', content: [] }],
  };
}

function makeTable(cells: TableCell[], bidi?: boolean): Table {
  const row: TableRow = { type: 'tableRow', cells };
  return {
    type: 'table',
    formatting: bidi ? { bidi: true } : undefined,
    rows: [row],
  };
}

function makeDocument(table: Table): Document {
  return {
    package: {
      document: { content: [table] },
    },
  };
}

describe('toProseDoc and fromProseDoc - RTL Table support (bidiVisual)', () => {
  test('table with bidi formatting maps to PM node with bidi: true', () => {
    const table = makeTable([makeCell()], true);
    const doc = makeDocument(table);
    const pmDoc = toProseDoc(doc);

    let tableNode: any = null;
    pmDoc.descendants((node) => {
      if (node.type.name === 'table') {
        tableNode = node;
      }
    });

    expect(tableNode).toBeTruthy();
    expect(tableNode.attrs.bidi).toBe(true);
  });

  test('PM table with bidi: true renders with dir="rtl" and direction: rtl style', () => {
    const tableNode = schema.nodes.table.create(
      { bidi: true },
      schema.nodes.tableRow.create(
        {},
        schema.nodes.tableCell.create({}, schema.nodes.paragraph.create())
      )
    );

    const dom = DOMSerializer.fromSchema(schema).serializeNode(tableNode) as HTMLElement;

    expect(dom.getAttribute('dir')).toBe('rtl');
    expect(dom.getAttribute('data-bidi')).toBe('true');
    expect(dom.getAttribute('style')).toContain('direction: rtl');
  });

  test('PM table with bidi: true round-trips back to Table model with bidi: true formatting', () => {
    const table = makeTable([makeCell()], true);
    const doc = makeDocument(table);
    const pmDoc = toProseDoc(doc);
    const outDoc = fromProseDoc(pmDoc, doc);

    const outTable = outDoc.package.document.content[0] as Table;
    expect(outTable.formatting?.bidi).toBe(true);
  });

  test('parseDOM reads bidi attribute from dir="rtl" or data-bidi="true" element', () => {
    const dom1 = document.createElement('table');
    dom1.setAttribute('dir', 'rtl');

    const dom2 = document.createElement('table');
    dom2.setAttribute('data-bidi', 'true');

    const spec1 = schema.nodes.table.spec;
    const attrs1 = spec1.parseDOM?.[0]?.getAttrs?.(dom1) as any;
    const attrs2 = spec1.parseDOM?.[0]?.getAttrs?.(dom2) as any;

    expect(attrs1?.bidi).toBe(true);
    expect(attrs2?.bidi).toBe(true);
  });
});
