/**
 * Unit tests for selectionTracker text-formatting extraction.
 *
 * Regression coverage for the bug where non-empty selections returned an
 * empty mark list, leaving the Vue toolbar's Bold / Italic / Underline /
 * Strike buttons unhighlighted on fully formatted selected text.
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { extractSelectionContext } from './selectionTracker';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    bold: { toDOM: () => ['strong', 0] },
    italic: { toDOM: () => ['em', 0] },
    underline: {
      attrs: { style: { default: 'single' }, color: { default: null } },
      toDOM: () => ['u', 0],
    },
    strike: {
      attrs: { double: { default: false } },
      toDOM: () => ['s', 0],
    },
  },
});

// Document positions are 1-indexed relative to the start of the doc:
// the opening paragraph tag occupies position 0, the first character starts at 1.
function paragraphState(parts: Array<{ text: string; marks?: string[] }>): EditorState {
  const nodes = parts.map(({ text, marks = [] }) =>
    schema.text(
      text,
      marks.map((name) => schema.marks[name]!.create())
    )
  );
  const doc = schema.node('doc', null, [schema.node('paragraph', null, nodes)]);
  return EditorState.create({ doc });
}

function selectRange(state: EditorState, from: number, to: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}

describe('extractSelectionContext > textFormatting', () => {
  test('range selection over bold+italic text reports both marks', () => {
    const prefix = 'Plain ';
    const word = 'styled';
    let state = paragraphState([
      { text: prefix },
      { text: word, marks: ['bold', 'italic'] },
      { text: ' plain' },
    ]);
    const from = 1 + prefix.length;
    state = selectRange(state, from, from + word.length);

    const ctx = extractSelectionContext(state);

    expect(ctx.hasSelection).toBe(true);
    expect(ctx.textFormatting.bold).toBe(true);
    expect(ctx.textFormatting.italic).toBe(true);
  });

  test('cursor inside formatted word reports the marks', () => {
    const prefix = 'Plain ';
    let state = paragraphState([
      { text: prefix },
      { text: 'styled', marks: ['bold', 'italic'] },
      { text: ' plain' },
    ]);
    const cursor = 1 + prefix.length + 2; // mid-word
    state = selectRange(state, cursor, cursor);

    const ctx = extractSelectionContext(state);

    expect(ctx.hasSelection).toBe(false);
    expect(ctx.textFormatting.bold).toBe(true);
    expect(ctx.textFormatting.italic).toBe(true);
  });

  test('range selection over plain text reports no marks', () => {
    let state = paragraphState([
      { text: 'Plain ' },
      { text: 'styled', marks: ['bold'] },
      { text: ' regular' },
    ]);
    // Select the trailing " regular" — fully unmarked.
    const tailStart = 1 + 'Plain '.length + 'styled'.length;
    state = selectRange(state, tailStart, tailStart + ' regular'.length);

    const ctx = extractSelectionContext(state);

    expect(ctx.textFormatting.bold).toBeFalsy();
    expect(ctx.textFormatting.italic).toBeFalsy();
  });

  test('range selection over underlined text reports underline', () => {
    const prefix = 'Plain ';
    const word = 'underlined';
    let state = paragraphState([{ text: prefix }, { text: word, marks: ['underline'] }]);
    const from = 1 + prefix.length;
    state = selectRange(state, from, from + word.length);

    const ctx = extractSelectionContext(state);

    expect(ctx.textFormatting.underline).toBeDefined();
    expect(ctx.textFormatting.underline?.style).toBe('single');
  });

  test('range selection over strikethrough text reports strike', () => {
    const prefix = 'Plain ';
    const word = 'struck';
    let state = paragraphState([{ text: prefix }, { text: word, marks: ['strike'] }]);
    const from = 1 + prefix.length;
    state = selectRange(state, from, from + word.length);

    const ctx = extractSelectionContext(state);

    expect(ctx.textFormatting.strike).toBe(true);
  });

  test('range selection starting at a mark boundary still finds the inside marks', () => {
    // This is the regression case: `from` lands exactly at the boundary
    // between unmarked text and marked text, so `$from.marks()` returns the
    // LEFT-side (unmarked) marks. The fix reads marks from the first text
    // node inside the range instead.
    const prefix = 'Plain ';
    const word = 'bold';
    let state = paragraphState([{ text: prefix }, { text: word, marks: ['bold'] }]);
    const from = 1 + prefix.length; // exactly at boundary
    state = selectRange(state, from, from + word.length);

    const ctx = extractSelectionContext(state);

    expect(ctx.textFormatting.bold).toBe(true);
  });
});
