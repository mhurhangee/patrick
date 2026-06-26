/**
 * The suggesting-mode catch-all (`appendTransaction`) must mark text inserted
 * by paths WITHOUT a dedicated handler — paste, drop, programmatic inserts —
 * as a tracked insertion.
 *
 * Regression guard: this uses the REAL editor schema, where a leaf text node's
 * own `markSet` is empty (`text.allowsMarkType(insertion) === false`) even
 * though the paragraph permits the mark. A guard that checks `allowsMarkType`
 * alone (dropping the `isText` short-circuit) silently stops tracking pasted
 * text — and the minimal schema in `index.test.ts` cannot catch it.
 */

import { describe, test, expect } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import { schema } from '../../schema';
import { createSuggestionModePlugin } from './index';

describe('suggesting-mode catch-all marks programmatic text insertions', () => {
  test('a plain insertText transaction (paste-like) gets the insertion mark', () => {
    const plugin = createSuggestionModePlugin(true, 'Jane');
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('hi')])]);
    let state = EditorState.create({ doc, plugins: [plugin] });

    // Simulate a paste: insert text via a plain transaction, NOT
    // applySuggestionInsert (which would mark it explicitly).
    state = state.apply(state.tr.insertText('XY', 3));

    let insertedMarked = false;
    state.doc.descendants((node) => {
      if (node.isText && node.text === 'XY') {
        insertedMarked = node.marks.some((m) => m.type.name === 'insertion');
      }
    });
    expect(insertedMarked, 'pasted text must be marked as a tracked insertion').toBe(true);
  });
});
