/**
 * Agent-facing applyFormatting / setParagraphStyle. The functions mutate via
 * `view.dispatch`, so tests use a mutable view stub (state replaced on each
 * dispatch) rather than mounting a real EditorView.
 *
 * The "resolver reconciliation" test asserts the injected-resolver seam
 * behaves identically whether the resolver is built fresh (Vue) or reused from
 * a cache (React): both are `createStyleResolver(sameStyles)`.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Transaction } from 'prosemirror-state';

import { singletonManager } from '../schema';
import { createStyleResolver } from '../styles';
import type { StyleDefinitions } from '../../types/document';
import { applyFormatting, setParagraphStyle, insertBreak } from '../applyFormatting';
import { fromProseDoc } from '../conversion/fromProseDoc';
import { serializeDocumentBody } from '../../docx/serializer/documentSerializer';

const schema = singletonManager.getSchema();

function para(paraId: string, text: string) {
  return schema.nodes.paragraph.create({ paraId }, schema.text(text));
}

/** Mutable view stub: dispatch applies the transaction onto the held state. */
function makeView(...paras: ReturnType<typeof para>[]): EditorView & { state: EditorState } {
  const doc = schema.nodes.doc.create(null, paras);
  const view = {
    state: EditorState.create({ schema, doc }),
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr);
    },
  };
  return view as unknown as EditorView & { state: EditorState };
}

/** Does the range [from,to) carry a mark of the given name anywhere? */
function hasMark(state: EditorState, markName: string): boolean {
  let found = false;
  state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === markName)) found = true;
  });
  return found;
}

describe('applyFormatting', () => {
  test('applies bold across the paragraph text', () => {
    const view = makeView(para('AAA', 'hello world'));
    const ok = applyFormatting(view, { paraId: 'AAA', marks: { bold: true } });
    expect(ok).toBe(true);
    expect(hasMark(view.state, 'bold')).toBe(true);
  });

  test('applies a mark to a located search substring only', () => {
    const view = makeView(para('AAA', 'hello world'));
    applyFormatting(view, { paraId: 'AAA', search: 'world', marks: { italic: true } });
    // 'hello ' should not be italic, 'world' should.
    let italicText = '';
    view.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'italic')) italicText += node.text;
    });
    expect(italicText).toBe('world');
  });

  test('returns false for an unresolvable paraId', () => {
    const view = makeView(para('AAA', 'hello'));
    expect(applyFormatting(view, { paraId: 'ZZZ', marks: { bold: true } })).toBe(false);
  });

  test('returns false when search is not found, without dispatching', () => {
    const view = makeView(para('AAA', 'hello'));
    const before = view.state;
    expect(applyFormatting(view, { paraId: 'AAA', search: 'absent', marks: { bold: true } })).toBe(
      false
    );
    expect(view.state).toBe(before);
  });

  test('fontSize maps points to half-points', () => {
    const view = makeView(para('AAA', 'hello'));
    applyFormatting(view, { paraId: 'AAA', marks: { fontSize: 12 } });
    let size: number | undefined;
    view.state.doc.descendants((node) => {
      const m = node.marks?.find((mk) => mk.type.name === 'fontSize');
      if (m) size = m.attrs.size as number;
    });
    expect(size).toBe(24); // 12pt → 24 half-points
  });
});

describe('setParagraphStyle', () => {
  const styles: StyleDefinitions = {
    styles: [
      { styleId: 'Normal', type: 'paragraph', name: 'Normal', default: true },
      { styleId: 'Heading1', type: 'paragraph', name: 'Heading 1' },
    ],
  };

  test('rejects an unknown styleId when a resolver is present', () => {
    const view = makeView(para('AAA', 'hello'));
    const resolver = createStyleResolver(styles);
    expect(
      setParagraphStyle(
        view,
        { paraId: 'AAA', styleId: 'NoSuchStyle' },
        { styleResolver: resolver }
      )
    ).toBe(false);
  });

  test('applies a known style and returns true', () => {
    const view = makeView(para('AAA', 'hello'));
    const resolver = createStyleResolver(styles);
    const ok = setParagraphStyle(
      view,
      { paraId: 'AAA', styleId: 'Heading1' },
      { styleResolver: resolver }
    );
    expect(ok).toBe(true);
    expect(view.state.doc.firstChild?.attrs.styleId).toBe('Heading1');
  });

  test('returns false for an unresolvable paraId', () => {
    const view = makeView(para('AAA', 'hello'));
    expect(
      setParagraphStyle(
        view,
        { paraId: 'ZZZ', styleId: 'Heading1' },
        { styleResolver: createStyleResolver(styles) }
      )
    ).toBe(false);
  });

  test('resolver reconciliation: cached (React) vs fresh (Vue) resolver agree', () => {
    // React reuses one resolver across calls; Vue builds a new one each call.
    // Both are createStyleResolver(sameStyles), so the applied doc must match.
    const cached = createStyleResolver(styles);
    const viewReact = makeView(para('AAA', 'hello world'));
    setParagraphStyle(viewReact, { paraId: 'AAA', styleId: 'Heading1' }, { styleResolver: cached });

    const viewVue = makeView(para('AAA', 'hello world'));
    setParagraphStyle(
      viewVue,
      { paraId: 'AAA', styleId: 'Heading1' },
      { styleResolver: createStyleResolver(styles) }
    );

    expect(viewReact.state.doc.toJSON()).toEqual(viewVue.state.doc.toJSON());
  });
});

describe('insertBreak', () => {
  test('page break inserts a single pageBreak node after the target paragraph', () => {
    const view = makeView(para('AAA', 'first'), para('BBB', 'second'));
    const ok = insertBreak(view, { paraId: 'AAA', type: 'page' });
    expect(ok).toBe(true);
    const kinds = view.state.doc.content.content.map((n) => n.type.name);
    // pageBreak sits between the two existing paragraphs — no spurious empty
    // paragraph (matches the headless reviewer-bridge shape).
    expect(kinds).toEqual(['paragraph', 'pageBreak', 'paragraph']);
    expect(view.state.doc.firstChild?.textContent).toBe('first');
    expect(view.state.doc.lastChild?.textContent).toBe('second');
  });

  test('sectionNextPage marks the target paragraph without adding a block', () => {
    const view = makeView(para('AAA', 'first'), para('BBB', 'second'));
    const ok = insertBreak(view, { paraId: 'AAA', type: 'sectionNextPage' });
    expect(ok).toBe(true);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.firstChild?.attrs.sectionBreakType).toBe('nextPage');
    expect(view.state.doc.firstChild?.textContent).toBe('first');
  });

  test('sectionContinuous marks the target paragraph without adding a block', () => {
    const view = makeView(para('AAA', 'first'), para('BBB', 'second'));
    const ok = insertBreak(view, { paraId: 'AAA', type: 'sectionContinuous' });
    expect(ok).toBe(true);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.firstChild?.attrs.sectionBreakType).toBe('continuous');
  });

  test('returns false for an unresolvable paraId, without dispatching', () => {
    const view = makeView(para('AAA', 'hello'));
    const before = view.state;
    expect(insertBreak(view, { paraId: 'ZZZ', type: 'page' })).toBe(false);
    expect(view.state).toBe(before);
  });

  test('refuses to break a paragraph nested in a table cell, without dispatching', () => {
    // A page-break node is invalid in a cell's schema and a sectPr nested in a
    // w:tc is invalid OOXML — so a cell-targeted break must be a no-op (matching
    // the headless reviewer bridge, which only addresses top-level paragraphs).
    const cellPara = schema.nodes.paragraph.create({ paraId: 'CELL' }, schema.text('in cell'));
    const cell = schema.nodes.tableCell.create(null, cellPara);
    const table = schema.nodes.table.create(null, schema.nodes.tableRow.create(null, cell));
    const doc = schema.nodes.doc.create(null, [para('AAA', 'body'), table]);
    const view = {
      state: EditorState.create({ schema, doc }),
      dispatch(tr: Transaction) {
        (view as { state: EditorState }).state = view.state.apply(tr);
      },
    } as unknown as EditorView & { state: EditorState };
    const before = view.state;

    expect(insertBreak(view, { paraId: 'CELL', type: 'page' })).toBe(false);
    expect(insertBreak(view, { paraId: 'CELL', type: 'sectionNextPage' })).toBe(false);
    expect(view.state).toBe(before);
  });
});

// End-to-end: an agent-inserted break must survive PM -> fromProseDoc ->
// serializer as valid OOXML, not just produce the right PM state.
describe('insertBreak round-trips to OOXML', () => {
  test('sectionNextPage emits a w:pPr/w:sectPr on the target paragraph', () => {
    const view = makeView(para('AAA', 'first'), para('BBB', 'second'));
    expect(insertBreak(view, { paraId: 'AAA', type: 'sectionNextPage' })).toBe(true);

    const xml = serializeDocumentBody(fromProseDoc(view.state.doc).package.document);
    // The section break lives inside the first paragraph's pPr, before its run.
    expect(xml).toMatch(
      /<w:p\b[^>]*><w:pPr><w:sectPr>.*?<w:type w:val="nextPage"\/>.*?<\/w:sectPr><\/w:pPr>/s
    );
    expect(xml).toContain('<w:t>first</w:t>');
    expect(xml).toContain('<w:t>second</w:t>');
  });

  test('sectionContinuous emits w:type val="continuous"', () => {
    const view = makeView(para('AAA', 'first'), para('BBB', 'second'));
    expect(insertBreak(view, { paraId: 'AAA', type: 'sectionContinuous' })).toBe(true);

    const xml = serializeDocumentBody(fromProseDoc(view.state.doc).package.document);
    expect(xml).toMatch(/<w:sectPr>.*?<w:type w:val="continuous"\/>.*?<\/w:sectPr>/s);
  });

  test('page break emits a w:br page run between the paragraphs', () => {
    const view = makeView(para('AAA', 'first'), para('BBB', 'second'));
    expect(insertBreak(view, { paraId: 'AAA', type: 'page' })).toBe(true);

    const xml = serializeDocumentBody(fromProseDoc(view.state.doc).package.document);
    expect(xml).toContain('<w:br w:type="page"/>');
    // No stray section break for a plain page break.
    expect(xml).not.toContain('<w:sectPr>');
  });
});
