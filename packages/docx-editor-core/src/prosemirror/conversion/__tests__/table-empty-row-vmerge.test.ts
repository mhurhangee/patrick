import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Node as PMNode } from 'prosemirror-model';
import { parseDocx } from '../../../docx/parser';
import type { Document, Table, TableCell } from '../../../types/document';
import { toProseDoc } from '../toProseDoc';

const FIXTURE = resolve(process.cwd(), 'e2e/fixtures/empty-table-row-vmerge.docx');

function makeCell(text: string, formatting?: TableCell['formatting']): TableCell {
  return {
    type: 'tableCell',
    formatting,
    content: [
      {
        type: 'paragraph',
        content: text ? [{ type: 'run', content: [{ type: 'text', text }] }] : [],
      },
    ],
  };
}

function makeDocument(table: Table): Document {
  return {
    package: {
      document: { content: [table] },
    },
  };
}

function firstTable(pmDoc: PMNode): PMNode {
  let table: PMNode | undefined;
  pmDoc.descendants((node) => {
    if (node.type.name === 'table') {
      table = node;
      return false;
    }
    return true;
  });
  if (!table) throw new Error('Expected converted document to contain a table');
  return table;
}

describe('toProseDoc table vMerge continuation rows', () => {
  test('degrades a fully covered continuation row to valid standalone cells', () => {
    const doc = makeDocument({
      type: 'table',
      columnWidths: [2400, 2400],
      rows: [
        {
          type: 'tableRow',
          cells: [
            makeCell('Merge start A', { vMerge: 'restart' }),
            makeCell('Merge start B', { vMerge: 'restart' }),
          ],
        },
        {
          type: 'tableRow',
          cells: [makeCell('', { vMerge: 'continue' }), makeCell('', { vMerge: 'continue' })],
        },
      ],
    });

    const table = firstTable(toProseDoc(doc));
    const firstRow = table.child(0);
    const continuationRow = table.child(1);

    expect(firstRow.childCount).toBe(2);
    expect(continuationRow.childCount).toBe(2);
    expect(firstRow.child(0).attrs.rowspan).toBe(1);
    expect(firstRow.child(1).attrs.rowspan).toBe(1);
    expect(continuationRow.child(0).attrs.rowspan).toBe(1);
    expect(continuationRow.child(1).attrs.rowspan).toBe(1);
  });

  test('preserves ordinary partial vertical merges', () => {
    const doc = makeDocument({
      type: 'table',
      columnWidths: [2400, 2400],
      rows: [
        {
          type: 'tableRow',
          cells: [makeCell('Merged left', { vMerge: 'restart' }), makeCell('Right 1')],
        },
        {
          type: 'tableRow',
          cells: [makeCell('', { vMerge: 'continue' }), makeCell('Right 2')],
        },
      ],
    });

    const table = firstTable(toProseDoc(doc));

    expect(table.child(0).childCount).toBe(2);
    expect(table.child(0).child(0).attrs.rowspan).toBe(2);
    expect(table.child(1).childCount).toBe(1);
    expect(table.child(1).child(0).textContent).toContain('Right 2');
  });

  test('adds a fallback cell for literal empty DOCX rows', () => {
    const doc = makeDocument({
      type: 'table',
      columnWidths: [2400, 2400],
      rows: [
        {
          type: 'tableRow',
          cells: [makeCell('A'), makeCell('B')],
        },
        {
          type: 'tableRow',
          cells: [],
        },
      ],
    });

    const table = firstTable(toProseDoc(doc));
    const emptyRow = table.child(1);

    expect(emptyRow.childCount).toBe(1);
    expect(emptyRow.child(0).attrs.colspan).toBe(2);
  });

  test('loads the synthetic fixture without producing an empty tableRow', async () => {
    const buffer = readFileSync(FIXTURE);
    const parsed = await parseDocx(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );

    const table = firstTable(toProseDoc(parsed, { styles: parsed.package.styles }));
    const rowCellCounts: number[] = [];
    table.forEach((row) => rowCellCounts.push(row.childCount));

    expect(rowCellCounts).toEqual([2, 2, 2]);
  });
});
