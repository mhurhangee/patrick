/**
 * Integration: a table's `w:bidiVisual` flag reaches the layout block the
 * painter consumes.
 *
 *   Document (table.formatting.bidi)
 *     → toProseDoc   (PM table node attrs.bidi)
 *     → toFlowBlocks (TableBlock.bidi)
 *
 * The painter mirror keys off `TableBlock.bidi`; without this wiring the flag
 * is parsed and round-tripped but never reaches the renderer (issue #734).
 */

import { describe, test, expect } from 'bun:test';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from '../toFlowBlocks';
import type { Document, Table, TableCell } from '../../types/document';

function makeTable(bidi?: boolean): Table {
  const cell = (): TableCell => ({
    type: 'tableCell',
    content: [{ type: 'paragraph', content: [] }],
  });
  return {
    type: 'table',
    formatting: bidi ? { bidi: true } : undefined,
    rows: [{ type: 'tableRow', cells: [cell(), cell()] }],
  };
}

function tableBlockFrom(table: Table) {
  const doc: Document = { package: { document: { content: [table] } } };
  const pmDoc = toProseDoc(doc);
  const blocks = toFlowBlocks(pmDoc, {});
  return blocks.find((b) => b.kind === 'table');
}

describe('toFlowBlocks — table bidi (w:bidiVisual) reaches the painter input', () => {
  test('bidi table → TableBlock.bidi === true', () => {
    const block = tableBlockFrom(makeTable(true));
    expect(block).toBeTruthy();
    expect(block?.bidi).toBe(true);
  });

  test('non-bidi table → TableBlock.bidi is falsy', () => {
    const block = tableBlockFrom(makeTable(false));
    expect(block).toBeTruthy();
    expect(block?.bidi).toBeFalsy();
  });
});
