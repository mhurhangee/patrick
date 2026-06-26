/**
 * Comment + proposeChange PM transaction builders (createComment,
 * addCommentToRange, applyProposedChange). The ID allocator itself is tested in
 * commentIdAllocator.test.ts; here it's used as a fixture.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { singletonManager } from '../schema';
import { createCommentIdAllocator } from '../commentIdAllocator';
import { createComment, addCommentToRange, applyProposedChange } from '../commentOps';

const schema = singletonManager.getSchema();

function para(paraId: string, text: string) {
  return schema.nodes.paragraph.create({ paraId }, schema.text(text));
}

function makeView(...paras: ReturnType<typeof para>[]) {
  const doc = schema.nodes.doc.create(null, paras);
  const view = {
    state: EditorState.create({ schema, doc }),
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr);
    },
  };
  return view as unknown as EditorView & { state: EditorState };
}

function countMark(view: EditorView & { state: EditorState }, markName: string): number {
  let n = 0;
  view.state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === markName)) n++;
  });
  return n;
}

describe('createComment', () => {
  test('allocates an ID and carries parentId', () => {
    const a = createCommentIdAllocator();
    const c1 = createComment(a, 'hi', 'Alice');
    const c2 = createComment(a, 'reply', 'Bob', c1.id);
    expect(c1.id).toBe(1);
    expect(c1.author).toBe('Alice');
    expect(c2.parentId).toBe(c1.id);
    expect(c2.id).toBe(2);
  });
});

describe('addCommentToRange', () => {
  test('adds a comment mark over the paragraph and returns the comment', () => {
    const view = makeView(para('AAA', 'hello world'));
    const a = createCommentIdAllocator();
    const comment = addCommentToRange(view, { paraId: 'AAA', text: 'note', author: 'Al' }, a);
    expect(comment).not.toBeNull();
    expect(comment!.id).toBe(1);
    expect(countMark(view, 'comment')).toBeGreaterThan(0);
  });

  test('narrows to a search substring', () => {
    const view = makeView(para('AAA', 'hello world'));
    const a = createCommentIdAllocator();
    addCommentToRange(view, { paraId: 'AAA', text: 'n', author: 'Al', search: 'world' }, a);
    let marked = '';
    view.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'comment')) marked += node.text;
    });
    expect(marked).toBe('world');
  });

  test('returns null for an unresolvable paraId', () => {
    const view = makeView(para('AAA', 'hello'));
    const a = createCommentIdAllocator();
    expect(addCommentToRange(view, { paraId: 'ZZZ', text: 'x', author: 'Al' }, a)).toBeNull();
  });

  test('returns null on an empty paragraph (no orphan comment)', () => {
    const empty = schema.nodes.paragraph.create({ paraId: 'EMPTY' });
    const view = makeView(empty);
    const a = createCommentIdAllocator();
    // No range to anchor → no comment created, and the allocator is untouched.
    expect(addCommentToRange(view, { paraId: 'EMPTY', text: 'x', author: 'Al' }, a)).toBeNull();
    expect(a.next()).toBe(1);
  });
});

describe('applyProposedChange', () => {
  test('insertion adds an insertion-marked run at paragraph end', () => {
    const view = makeView(para('AAA', 'hello'));
    const a = createCommentIdAllocator();
    const ok = applyProposedChange(
      view,
      { paraId: 'AAA', search: '', replaceWith: ' world', author: 'Al' },
      a
    );
    expect(ok).toBe(true);
    expect(countMark(view, 'insertion')).toBeGreaterThan(0);
  });

  test('deletion marks the searched text', () => {
    const view = makeView(para('AAA', 'hello world'));
    const a = createCommentIdAllocator();
    const ok = applyProposedChange(
      view,
      { paraId: 'AAA', search: 'world', replaceWith: '', author: 'Al' },
      a
    );
    expect(ok).toBe(true);
    expect(countMark(view, 'deletion')).toBeGreaterThan(0);
  });

  test('replace marks deletion and inserts insertion', () => {
    const view = makeView(para('AAA', 'hello world'));
    const a = createCommentIdAllocator();
    const ok = applyProposedChange(
      view,
      { paraId: 'AAA', search: 'world', replaceWith: 'there', author: 'Al' },
      a
    );
    expect(ok).toBe(true);
    expect(countMark(view, 'deletion')).toBeGreaterThan(0);
    expect(countMark(view, 'insertion')).toBeGreaterThan(0);
  });

  test('refuses to layer onto an existing tracked change', () => {
    const view = makeView(para('AAA', 'hello world'));
    const a = createCommentIdAllocator();
    applyProposedChange(view, { paraId: 'AAA', search: 'world', replaceWith: '', author: 'Al' }, a);
    // Second proposal over the same text must be rejected.
    const ok = applyProposedChange(
      view,
      { paraId: 'AAA', search: 'world', replaceWith: 'x', author: 'Al' },
      a
    );
    expect(ok).toBe(false);
  });

  test('empty search and empty replaceWith is a no-op (false)', () => {
    const view = makeView(para('AAA', 'hello'));
    const a = createCommentIdAllocator();
    expect(
      applyProposedChange(view, { paraId: 'AAA', search: '', replaceWith: '', author: 'Al' }, a)
    ).toBe(false);
  });

  test('comments and tracked changes draw from one ID space', () => {
    const view = makeView(para('AAA', 'hello world'), para('BBB', 'foo bar baz'));
    const a = createCommentIdAllocator();
    const c = addCommentToRange(view, { paraId: 'AAA', text: 'n', author: 'Al' }, a);
    applyProposedChange(view, { paraId: 'BBB', search: 'bar', replaceWith: '', author: 'Al' }, a);
    // The revisionId allocated for the tracked change is strictly greater than
    // the comment's id — single shared counter.
    let revisionId = 0;
    view.state.doc.descendants((node) => {
      for (const m of node.marks) {
        if (m.attrs.revisionId != null) revisionId = m.attrs.revisionId as number;
      }
    });
    expect(revisionId).toBeGreaterThan(c!.id);
  });
});
