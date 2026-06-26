/**
 * Regression for #738 — paragraphs opened WITHOUT `w14:paraId` had no id until
 * the first edit, because the ParaIdAllocator plugin only runs on doc-changing
 * transactions and none fires on `EditorState.create`. `ensureParaIdsInState`
 * is applied to the initial editor state so every paragraph has a unique id at
 * load (block ids / agent scope work before any edit).
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import { singletonManager } from '../schema';
import { ensureParaIdsInState } from '../extensions/features/ParaIdAllocatorExtension';

const schema = singletonManager.getSchema();

function stateOf(...paras: ReturnType<typeof schema.nodes.paragraph.create>[]) {
  return EditorState.create({ schema, doc: schema.nodes.doc.create(null, paras) });
}

function paraIds(state: EditorState): (string | null)[] {
  const ids: (string | null)[] = [];
  state.doc.descendants((node) => {
    if (node.type.name === 'paragraph') ids.push((node.attrs.paraId as string | null) ?? null);
  });
  return ids;
}

describe('ensureParaIdsInState (#738)', () => {
  test('assigns a unique paraId to every paragraph that lacks one', () => {
    const before = stateOf(
      schema.nodes.paragraph.create(null, schema.text('one')),
      schema.nodes.paragraph.create(null, schema.text('two')),
      schema.nodes.paragraph.create(null, schema.text('three'))
    );
    expect(paraIds(before)).toEqual([null, null, null]);

    const after = ensureParaIdsInState(before);
    const ids = paraIds(after);
    expect(ids.every((id) => typeof id === 'string' && /^[0-9A-F]{8}$/.test(id!))).toBe(true);
    expect(new Set(ids).size).toBe(3); // all unique
  });

  test('keeps existing ids and only fills the gaps', () => {
    const before = stateOf(
      schema.nodes.paragraph.create({ paraId: 'AAAA0001' }, schema.text('keep')),
      schema.nodes.paragraph.create(null, schema.text('fill'))
    );
    const ids = paraIds(ensureParaIdsInState(before));
    expect(ids[0]).toBe('AAAA0001');
    expect(ids[1]).not.toBeNull();
    expect(ids[1]).not.toBe('AAAA0001');
  });

  test('reassigns a duplicate id so paragraph ids stay unique', () => {
    const before = stateOf(
      schema.nodes.paragraph.create({ paraId: 'DUP00001' }, schema.text('a')),
      schema.nodes.paragraph.create({ paraId: 'DUP00001' }, schema.text('b'))
    );
    const ids = paraIds(ensureParaIdsInState(before));
    expect(ids[0]).toBe('DUP00001');
    expect(ids[1]).not.toBe('DUP00001');
    expect(new Set(ids).size).toBe(2);
  });

  test('is idempotent — a fully-allocated state returns unchanged', () => {
    const allocated = ensureParaIdsInState(
      stateOf(schema.nodes.paragraph.create(null, schema.text('x')))
    );
    expect(ensureParaIdsInState(allocated)).toBe(allocated); // same object, no work
  });

  test('reaches paragraphs nested inside table cells', () => {
    const cell = schema.nodes.tableCell.create(
      null,
      schema.nodes.paragraph.create(null, schema.text('in cell'))
    );
    const table = schema.nodes.table.create(null, schema.nodes.tableRow.create(null, cell));
    const before = stateOf(schema.nodes.paragraph.create(null, schema.text('body')), table);

    const ids = paraIds(ensureParaIdsInState(before)); // collects body + the in-cell paragraph
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => typeof id === 'string' && /^[0-9A-F]{8}$/.test(id!))).toBe(true);
    expect(new Set(ids).size).toBe(2); // unique across the table boundary
  });
});
