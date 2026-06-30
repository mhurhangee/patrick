/**
 * Round-trip coverage for the LIVE accept/reject path — `acceptChangeById` /
 * `rejectChangeById` → `resolveById`. This is the channel the editor's
 * tracked-change cards actually use (by-id, so every coalesced site of a
 * revision clears in one click), and it had no direct behavioral tests.
 *
 * Asserts the core redline contract on inline insertions/deletions:
 *  - accept insertion  → text stays, mark gone
 *  - reject insertion  → text removed
 *  - accept deletion   → text removed
 *  - reject deletion   → text stays, mark gone
 *  - by-id clears EVERY site of a revision (the coalescing contract)
 *  - unknown id is a no-op
 */

import { describe, test, expect } from 'bun:test';
import { Schema, type Node as PMNode, type Mark } from 'prosemirror-model';
import { EditorState, type Command } from 'prosemirror-state';
import { acceptChangeById, rejectChangeById } from './comments';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { pPrIns: { default: null }, pPrDel: { default: null }, pPrChange: { default: null } },
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
  marks: {
    insertion: {
      attrs: { revisionId: { default: 0 }, author: { default: '' }, date: { default: null } },
      toDOM: () => ['ins', 0],
    },
    deletion: {
      attrs: { revisionId: { default: 0 }, author: { default: '' }, date: { default: null } },
      toDOM: () => ['del', 0],
    },
    comment: { attrs: { commentId: { default: 0 } }, toDOM: () => ['span', 0] },
  },
});

const AUTHOR = 'Test Attorney';
const DATE = '2026-06-30T12:00:00.000Z';

/** A text node carrying an `insertion` mark for `revisionId`. */
function ins(text: string, revisionId: number): PMNode {
  return schema.text(text, [schema.marks.insertion.create({ revisionId, author: AUTHOR, date: DATE })]);
}
/** A text node carrying a `deletion` mark for `revisionId`. */
function del(text: string, revisionId: number): PMNode {
  return schema.text(text, [schema.marks.deletion.create({ revisionId, author: AUTHOR, date: DATE })]);
}
/** A single-paragraph doc from the given inline children. */
function docOf(...inline: PMNode[]): EditorState {
  return EditorState.create({ doc: schema.node('doc', null, [schema.node('paragraph', null, inline)]) });
}

/** Run a command, returning the resulting state (unchanged if it didn't dispatch). */
function run(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

/** Concatenated text of the document. */
function text(state: EditorState): string {
  let out = '';
  state.doc.descendants((node) => {
    if (node.isText) out += node.text;
  });
  return out;
}

/** Whether any inline node still carries `markName` with `revisionId`. */
function hasMark(state: EditorState, markName: 'insertion' | 'deletion', revisionId: number): boolean {
  let found = false;
  state.doc.descendants((node) => {
    if (found) return false;
    if (node.marks.some((m: Mark) => m.type.name === markName && m.attrs.revisionId === revisionId)) {
      found = true;
    }
  });
  return found;
}

describe('acceptChangeById / rejectChangeById — inline insertions', () => {
  test('accept keeps the inserted text and drops the mark', () => {
    const before = docOf(schema.text('Hello '), ins('world', 1));
    const after = run(before, acceptChangeById(1));
    expect(text(after)).toBe('Hello world');
    expect(hasMark(after, 'insertion', 1)).toBe(false);
  });

  test('reject removes the inserted text', () => {
    const before = docOf(schema.text('Hello '), ins('world', 1));
    const after = run(before, rejectChangeById(1));
    expect(text(after)).toBe('Hello ');
  });
});

describe('acceptChangeById / rejectChangeById — inline deletions', () => {
  test('accept removes the deleted text', () => {
    const before = docOf(schema.text('Hello '), del('world', 2));
    const after = run(before, acceptChangeById(2));
    expect(text(after)).toBe('Hello ');
  });

  test('reject keeps the text and drops the deletion mark', () => {
    const before = docOf(schema.text('Hello '), del('world', 2));
    const after = run(before, rejectChangeById(2));
    expect(text(after)).toBe('Hello world');
    expect(hasMark(after, 'deletion', 2)).toBe(false);
  });
});

describe('acceptChangeById / rejectChangeById — replacement (deletion + insertion)', () => {
  // A replacement is a deletion of the old text immediately followed by an
  // insertion of the new text, each with its own revisionId. The card resolves
  // BOTH ids; here we resolve them in sequence and assert the net result.
  test('accept keeps the new text, removes the old', () => {
    let s = docOf(schema.text('say '), del('old', 3), ins('new', 4));
    s = run(s, acceptChangeById(3)); // accept deletion → old removed
    s = run(s, acceptChangeById(4)); // accept insertion → new kept
    expect(text(s)).toBe('say new');
    expect(hasMark(s, 'deletion', 3)).toBe(false);
    expect(hasMark(s, 'insertion', 4)).toBe(false);
  });

  test('reject keeps the old text, removes the new', () => {
    let s = docOf(schema.text('say '), del('old', 3), ins('new', 4));
    s = run(s, rejectChangeById(3)); // reject deletion → old kept
    s = run(s, rejectChangeById(4)); // reject insertion → new removed
    expect(text(s)).toBe('say old');
  });
});

describe('by-id clears EVERY site of a revision (coalescing contract)', () => {
  test('accept clears two separate insertion sites sharing one revisionId', () => {
    // The same logical edit can leave multiple inline sites with one id;
    // accepting by id must clear them all in a single transaction.
    const before = docOf(ins('foo', 5), schema.text(' and '), ins('bar', 5));
    const after = run(before, acceptChangeById(5));
    expect(text(after)).toBe('foo and bar');
    expect(hasMark(after, 'insertion', 5)).toBe(false);
  });

  test('reject removes both sites of the shared revisionId', () => {
    const before = docOf(ins('foo', 5), schema.text(' and '), ins('bar', 5));
    const after = run(before, rejectChangeById(5));
    expect(text(after)).toBe(' and ');
  });
});

describe('unknown revision id', () => {
  test('is a no-op (no dispatch, document unchanged)', () => {
    const before = docOf(schema.text('Hello '), ins('world', 1));
    let dispatched = false;
    acceptChangeById(999)(before, () => {
      dispatched = true;
    });
    expect(dispatched).toBe(false);
  });
});
