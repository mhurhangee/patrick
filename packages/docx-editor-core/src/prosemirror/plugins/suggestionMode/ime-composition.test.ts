/**
 * IME composition handling in suggesting mode.
 *
 * Regression coverage for Japanese / CJK input garbling: while an IME
 * composition is in flight the plugin must NOT mark the composed text (the
 * `appendTransaction` catch-all is suppressed), and the committed text must be
 * marked as a tracked insertion once, on compositionend. See the
 * `createSuggestionModePlugin` IME comments and eigenpal/docx-editor#676.
 *
 * The composition handling lives in view-level DOM handlers, so these tests
 * drive `props.handleDOMEvents` against a minimal mock view whose `dispatch`
 * runs the real `EditorState.apply` pipeline (so the plugin's
 * `appendTransaction` runs exactly as it would in the browser).
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { createSuggestionModePlugin, suggestionModeKey } from './index';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    insertion: {
      attrs: { revisionId: { default: 0 }, author: { default: '' }, date: { default: '' } },
      toDOM: () => ['ins', 0],
    },
    deletion: {
      attrs: { revisionId: { default: 0 }, author: { default: '' }, date: { default: '' } },
      toDOM: () => ['del', 0],
    },
  },
});

/**
 * Minimal stand-in for an EditorView. `dispatch` runs the real
 * `EditorState.apply` so the plugin's `appendTransaction` (the catch-all) runs.
 */
function makeMockView(state: EditorState) {
  const view = {
    state,
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr);
    },
  };
  return view;
}

function insertionText(state: EditorState): string[] {
  const out: string[] = [];
  state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === 'insertion')) out.push(node.text!);
  });
  return out;
}

/** Build an active suggesting-mode editor with the cursor at the end of `text`. */
function setup(text: string) {
  const plugin = createSuggestionModePlugin(true, 'TestUser');
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);
  const state = EditorState.create({ doc, plugins: [plugin] });
  const view = makeMockView(
    state.apply(state.tr.setSelection(TextSelection.create(state.doc, text.length + 1)))
  );
  const domEvents = plugin.props.handleDOMEvents as Record<
    string,
    (view: unknown, event?: unknown) => boolean
  >;
  return { plugin, view, domEvents };
}

describe('SuggestionMode IME composition', () => {
  test('composed text is NOT marked while a composition is in flight', () => {
    const { view, domEvents } = setup('Hello');

    domEvents.compositionstart(view);
    // PM commits composed text as a plain (non-suggestion) transaction.
    view.dispatch(view.state.tr.insertText('日本語', 6, 6));

    // The catch-all must stay out of the way mid-composition.
    expect(insertionText(view.state)).toEqual([]);
    expect(view.state.doc.textContent).toBe('Hello日本語');
  });

  test('compositionend marks the committed range as a tracked insertion', async () => {
    const { view, domEvents } = setup('Hello');

    domEvents.compositionstart(view);
    view.dispatch(view.state.tr.insertText('日本語', 6, 6));
    domEvents.compositionend(view);
    // Marking is deferred one microtask so it lands after the composition settles.
    await Promise.resolve();
    await Promise.resolve();

    expect(insertionText(view.state)).toEqual(['日本語']);
    // The caret stays collapsed right after the committed text (not before it).
    expect(view.state.selection.empty).toBe(true);
    expect(view.state.selection.from).toBe(9); // 'Hello'(5) + '日本語'(3) + 1 doc offset
  });

  test('handleTextInput does NOT re-insert composed text while composing', () => {
    // PM commits composed text from the DOM and then calls handleTextInput with
    // it. Re-inserting there duplicates the text (the reported garbling), so the
    // handler must decline while a composition is in flight.
    const { plugin, view, domEvents } = setup('Hello');
    const handleTextInput = plugin.props.handleTextInput as (
      v: unknown,
      from: number,
      to: number,
      text: string
    ) => boolean;

    domEvents.compositionstart(view);
    const handled = handleTextInput(view, 6, 6, 'あ');

    expect(handled).toBe(false);
    expect(view.state.doc.textContent).toBe('Hello'); // nothing re-inserted
  });

  test('handleTextInput still tracks plain input when not composing', () => {
    const { plugin, view } = setup('Hello');
    const handleTextInput = plugin.props.handleTextInput as (
      v: unknown,
      from: number,
      to: number,
      text: string
    ) => boolean;

    const handled = handleTextInput(view, 6, 6, 'Z');

    expect(handled).toBe(true);
    expect(view.state.doc.textContent).toBe('HelloZ');
    expect(insertionText(view.state)).toContain('Z');
  });

  test('composed text is left unmarked if suggesting mode is toggled off before compositionend settles', async () => {
    const { view, domEvents } = setup('Hello');

    domEvents.compositionstart(view);
    view.dispatch(view.state.tr.insertText('日本語', 6, 6));
    // Toggle suggesting mode OFF before the deferred marking runs.
    view.dispatch(view.state.tr.setMeta(suggestionModeKey, { active: false }));
    domEvents.compositionend(view);
    await Promise.resolve();
    await Promise.resolve();

    // Tracking is off now, so the composed text must NOT be marked.
    expect(insertionText(view.state)).toEqual([]);
    expect(view.state.doc.textContent).toBe('Hello日本語');
  });

  test('the catch-all resumes for non-composition input after composing ends', async () => {
    const { view, domEvents } = setup('Hello');

    domEvents.compositionstart(view);
    view.dispatch(view.state.tr.insertText('あ', 6, 6));
    domEvents.compositionend(view);
    await Promise.resolve();
    await Promise.resolve();

    // A later plain insertion (paste-like), away from the composed run so it
    // can't merely inherit the adjacent mark, is tracked by the catch-all.
    view.dispatch(view.state.tr.insertText('X', 1, 1));
    expect(insertionText(view.state)).toContain('X');
  });
});
