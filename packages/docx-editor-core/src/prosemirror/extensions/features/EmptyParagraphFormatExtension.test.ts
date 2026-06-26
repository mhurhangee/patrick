/**
 * Unit tests for the empty-paragraph formatting fixes.
 *
 * Bug 1: applying a heading to an empty paragraph then typing produced
 *        unstyled text — the style picker's refocus cleared the stored
 *        marks before the first keystroke. EmptyParagraphFormatExtension
 *        re-derives them from the paragraph's `defaultTextFormatting`.
 *
 * Bug 2: pressing Enter at the end of a heading kept the heading style;
 *        it should drop to the style's `w:next` (body text).
 */

import { describe, test, expect } from 'bun:test';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { splitBlock } from 'prosemirror-commands';
import type { Node as PMNode } from 'prosemirror-model';
import { singletonManager } from '../../schema';
import { createStyleResolver } from '../../styles/styleResolver';
import { createDocumentStylesPlugin } from '../../plugins/documentStyles';
import { applyPostSplitInheritance } from './BaseKeymapExtension';
import { createEmptyDocument } from '../../../utils/createDocument';

const schema = singletonManager.getSchema();
const resolver = createStyleResolver(createEmptyDocument().package.styles);

function markNames(marks: readonly { type: { name: string } }[] | null): string[] {
  return (marks ?? []).map((m) => m.type.name);
}

function stateWith(doc: PMNode, withResolver = true): EditorState {
  const plugins = [...singletonManager.getPlugins()];
  if (withResolver) plugins.push(createDocumentStylesPlugin(resolver));
  return EditorState.create({ doc, schema, plugins });
}

describe('EmptyParagraphFormatExtension', () => {
  test('re-derives stored marks from a heading paragraph defaultTextFormatting', () => {
    const heading = schema.node('paragraph', {
      styleId: 'Heading1',
      defaultTextFormatting: {
        fontSize: 40,
        bold: true,
        fontFamily: { ascii: 'Arial', hAnsi: 'Arial' },
      },
    });
    let state = stateWith(schema.node('doc', null, [heading]));

    // A selection change (mimicking the dropdown refocus) clears stored marks;
    // the plugin must put them back so typed text inherits the heading.
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));

    expect(markNames(state.storedMarks)).toContain('bold');
    expect(markNames(state.storedMarks)).toContain('fontSize');
  });

  test('leaves a plain body paragraph mark-free (font/size handled by the painter)', () => {
    const body = schema.node('paragraph', {
      defaultTextFormatting: { fontSize: 22, fontFamily: { ascii: 'Arial', hAnsi: 'Arial' } },
    });
    let state = stateWith(schema.node('doc', null, [body]));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));

    // No bold/color/etc. → no stored marks forced onto ordinary typed text.
    expect(state.storedMarks).toBeNull();
  });
});

describe('applyPostSplitInheritance — next style', () => {
  // Build a heading paragraph with text, split at its end via the same
  // prosemirror-commands `splitBlock` the Enter handler uses (new paragraph
  // gets default attrs, cursor moves into it), then run the shared post-split
  // inheritance with the resolver.
  function splitAtEndOfHeading(): { tr: Transaction; sourcePara: PMNode } {
    const heading = schema.node(
      'paragraph',
      { styleId: 'Heading1', defaultTextFormatting: { fontSize: 40, bold: true } },
      [schema.text('Heading One')]
    );
    let state = stateWith(schema.node('doc', null, [heading]));
    const endOfHeading = state.doc.firstChild!.nodeSize - 1; // end of content
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, endOfHeading)));
    const sourcePara = state.selection.$from.parent;

    let splitTr: Transaction | null = null;
    splitBlock(state, (tr) => {
      splitTr = tr;
    });
    if (!splitTr) throw new Error('splitBlock did not produce a transaction');
    return { tr: splitTr, sourcePara };
  }

  test('Enter after a heading switches the new paragraph to the next style', () => {
    const { tr, sourcePara } = splitAtEndOfHeading();
    applyPostSplitInheritance(tr, sourcePara, [], schema, resolver);

    const newPara = tr.doc.child(1);
    expect(newPara.attrs.styleId).toBe('Normal');
    expect(newPara.attrs.spaceBefore).toBeNull(); // heading spacing dropped
    expect(markNames(tr.storedMarks)).not.toContain('bold');
  });

  test('without a resolver the new paragraph keeps the source style', () => {
    const { tr, sourcePara } = splitAtEndOfHeading();
    applyPostSplitInheritance(tr, sourcePara, [], schema);

    expect(tr.doc.child(1).attrs.styleId).toBe('Heading1');
  });

  test('Enter carries a distinct complex-script font size onto the new paragraph', () => {
    // No resolver, so the next-style early-return is skipped and the
    // mark-inheritance loop runs — the same loop the body-text Enter case
    // (no w:next style) hits in production.
    const { tr, sourcePara } = splitAtEndOfHeading();
    // A run with different Latin (size) and complex-script (sizeCs) sizes.
    const fontSizeMark = schema.marks.fontSize.create({ size: 28, sizeCs: 36 });
    applyPostSplitInheritance(tr, sourcePara, [fontSizeMark], schema);

    const dtf = tr.doc.child(1).attrs.defaultTextFormatting as {
      fontSize?: number;
      fontSizeCs?: number;
    };
    expect(dtf.fontSize).toBe(28);
    // Without carrying fontSizeCs, the next write would re-align sizeCs to 28.
    expect(dtf.fontSizeCs).toBe(36);
  });
});
