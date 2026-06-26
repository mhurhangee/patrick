/**
 * The instance-scoped comment/revision ID allocator and its seed helper.
 * Pins the canonical (React) monotonic-no-reuse scheme, per-instance isolation,
 * and the seed-above-max-of-(comments + revision marks) behavior.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { singletonManager } from '../schema';
import {
  createCommentIdAllocator,
  seedCommentAllocator,
  PENDING_COMMENT_ID,
} from '../commentIdAllocator';
import { applyProposedChange } from '../commentOps';
import type { Comment } from '../../types/content';

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

describe('createCommentIdAllocator', () => {
  test('is monotonic and does not reuse IDs after a delete', () => {
    const a = createCommentIdAllocator();
    expect(a.next()).toBe(1);
    expect(a.next()).toBe(2);
    expect(a.next()).toBe(3);
    // Simulate deleting comment 3, then adding again — must NOT reuse 3.
    a.seedAbove(2);
    expect(a.next()).toBe(4);
  });

  test('two allocators are independent (per-instance isolation)', () => {
    const a = createCommentIdAllocator();
    const b = createCommentIdAllocator();
    expect(a.next()).toBe(1);
    expect(a.next()).toBe(2);
    expect(b.next()).toBe(1);
  });

  test('seedAbove raises the counter above existing IDs, never lowers', () => {
    const a = createCommentIdAllocator();
    a.seedAbove(10);
    expect(a.next()).toBe(11);
    a.seedAbove(5); // lower than current — no-op
    expect(a.next()).toBe(12);
  });

  test('PENDING_COMMENT_ID sentinel is negative', () => {
    expect(PENDING_COMMENT_ID).toBe(-1);
  });
});

describe('seedCommentAllocator', () => {
  test('seeds above the max of comment IDs and revision marks', () => {
    const view = makeView(para('AAA', 'hello world'));
    const setup = createCommentIdAllocator();
    setup.seedAbove(40); // next revisionId will be 41
    applyProposedChange(
      view,
      { paraId: 'AAA', search: 'world', replaceWith: '', author: 'Al' },
      setup
    );

    const comments: Comment[] = [{ id: 7, author: 'x', date: '', content: [] }];
    const a = createCommentIdAllocator();
    seedCommentAllocator(a, comments, view);
    // max(comment id 7, revision id 41) = 41 → next is 42.
    expect(a.next()).toBe(42);
  });

  test('no comments and no marks leaves the allocator at 1', () => {
    const view = makeView(para('AAA', 'plain'));
    const a = createCommentIdAllocator();
    seedCommentAllocator(a, [], view);
    expect(a.next()).toBe(1);
  });

  test('null view seeds from comments only', () => {
    const a = createCommentIdAllocator();
    seedCommentAllocator(a, [{ id: 9, author: 'x', date: '', content: [] }], null);
    expect(a.next()).toBe(10);
  });
});
