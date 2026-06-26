/**
 * Agent insertTable respects the document's default table style.
 *
 * The agent edits the Document model directly; setting `styleId` (+ a default
 * `look`) is declarative — the same `convertTable` cascade bakes it on render
 * and the serializer emits `<w:tblStyle>`. With no usable default style the
 * table carries no styleId (inheriting the type-default style on render),
 * preserving prior agent behavior.
 */

import { describe, test, expect } from 'bun:test';
import { executeInsertTable } from '../executor/structureCommands';
import { createEmptyDocument } from '../../utils/createDocument';
import type { Document, Style, Table } from '../../types/document';
import type { InsertTableCommand } from '../../types/agentApi';

const BRANDED: Style = {
  styleId: 'Branded',
  type: 'table',
  name: 'Branded',
  tblPr: { borders: { top: { style: 'single', size: 8, color: { rgb: 'FF0000' } } } },
};

function docWith(styles: Style[], defaultTableStyle?: string): Document {
  const doc = createEmptyDocument();
  doc.package.styles = { ...(doc.package.styles ?? {}), styles };
  doc.package.settings = {
    ...(doc.package.settings ?? { defaultTabStop: 720 }),
    ...(defaultTableStyle ? { defaultTableStyle } : {}),
  };
  return doc;
}

const insertCmd: InsertTableCommand = {
  type: 'insertTable',
  position: { paragraphIndex: 0, offset: 0 },
  rows: 2,
  columns: 2,
};

function firstTable(doc: Document): Table {
  const table = doc.package.document.content.find((b) => b.type === 'table');
  if (!table) throw new Error('no table inserted');
  return table as Table;
}

describe('agent executeInsertTable — default table style', () => {
  test('sets styleId + look from settings w:defaultTableStyle', () => {
    const doc = docWith([BRANDED], 'Branded');
    const table = firstTable(executeInsertTable(doc, insertCmd));
    expect(table.formatting?.styleId).toBe('Branded');
    expect(table.formatting?.look).toMatchObject({ firstRow: true, noVBand: true });
  });

  test('sets styleId from the type-default table style when settings has none', () => {
    const doc = docWith([{ ...BRANDED, default: true }]);
    const table = firstTable(executeInsertTable(doc, insertCmd));
    expect(table.formatting?.styleId).toBe('Branded');
  });

  test('leaves styleId unset when no usable default style exists', () => {
    const doc = docWith([]);
    const table = firstTable(executeInsertTable(doc, insertCmd));
    expect(table.formatting?.styleId).toBeUndefined();
    // Still a fixed grid, as before.
    expect(table.formatting?.layout).toBe('fixed');
  });

  test('does not adopt the TableNormal base style', () => {
    const doc = docWith([
      { styleId: 'TableNormal', type: 'table', name: 'Normal Table', default: true },
    ]);
    const table = firstTable(executeInsertTable(doc, insertCmd));
    expect(table.formatting?.styleId).toBeUndefined();
  });
});
