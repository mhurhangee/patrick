/**
 * Issue #914: a comment range that is interrupted by a tracked-change node
 * lacking the comment mark must still serialize as a SINGLE
 * commentRangeStart/End pair. Closing and reopening the range for the same
 * comment id produces multiple ranges, which Word rejects as unreadable
 * content.
 */

import { describe, expect, test } from 'bun:test';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { singletonManager } from '../../schema';
import { convertPMParagraph } from '../fromProseDoc/paragraph';
import { fromProseDoc } from '../fromProseDoc';
import { createCommentIdAllocator } from '../../commentIdAllocator';
import { addCommentToRange, applyProposedChange } from '../../commentOps';
import { serializeParagraph } from '../../../docx/serializer/paragraphSerializer';
import type { ParagraphContent, Paragraph } from '../../../types/document';

const schema = singletonManager.getSchema();

function countMarker(
  content: ParagraphContent[],
  type: 'commentRangeStart' | 'commentRangeEnd',
  id: number
): number {
  return content.filter((c) => c.type === type && c.id === id).length;
}

function makeView(text: string) {
  const para = schema.nodes.paragraph.create({ paraId: 'AAA' }, schema.text(text));
  const doc = schema.nodes.doc.create(null, [para]);
  const view = {
    state: EditorState.create({ schema, doc }),
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr);
    },
  };
  return view as unknown as EditorView & { state: EditorState };
}

function serializeFirstPara(view: EditorView & { state: EditorState }): string {
  const docModel = fromProseDoc(view.state.doc);
  const firstPara = docModel.package.document.content.find(
    (b): b is Paragraph => b.type === 'paragraph'
  )!;
  return serializeParagraph(firstPara);
}

describe('issue #914 — comment range split by tracked change', () => {
  test('comment interrupted by an insertion run emits one range pair', () => {
    const commentId = 17;
    const comment = schema.marks.comment.create({ commentId });
    const insertion = schema.marks.insertion.create({
      revisionId: 18,
      author: 'Al',
      date: '2026-01-01T00:00:00Z',
    });

    // "hello" [comment] | "XXX" [insertion, no comment] | "world" [comment]
    const para = schema.nodes.paragraph.create({ paraId: 'AAA' }, [
      schema.text('hello', [comment]),
      schema.text('XXX', [insertion]),
      schema.text('world', [comment]),
    ]) as PMNode;

    const result = convertPMParagraph(para);

    expect(countMarker(result.content, 'commentRangeStart', commentId)).toBe(1);
    expect(countMarker(result.content, 'commentRangeEnd', commentId)).toBe(1);

    // The single range must span the interrupting insertion: start first,
    // end last, with the tracked-change run sitting inside.
    const types = result.content.map((c) => c.type);
    const startIdx = types.indexOf('commentRangeStart');
    const endIdx = types.indexOf('commentRangeEnd');
    const insIdx = result.content.findIndex((c) => c.type === 'insertion');
    expect(startIdx).toBeLessThan(insIdx);
    expect(insIdx).toBeLessThan(endIdx);
  });

  test('non-interrupted sub-range still wraps only the marked text', () => {
    const commentId = 5;
    const comment = schema.marks.comment.create({ commentId });
    // "hello " | "world" [comment] | " foo"
    const para = schema.nodes.paragraph.create({ paraId: 'AAA' }, [
      schema.text('hello '),
      schema.text('world', [comment]),
      schema.text(' foo'),
    ]) as PMNode;

    const result = convertPMParagraph(para);
    expect(countMarker(result.content, 'commentRangeStart', commentId)).toBe(1);
    expect(countMarker(result.content, 'commentRangeEnd', commentId)).toBe(1);

    // Start lands after the first (unmarked) run, end before the last.
    const startIdx = result.content.findIndex((c) => c.type === 'commentRangeStart');
    const endIdx = result.content.findIndex((c) => c.type === 'commentRangeEnd');
    expect(startIdx).toBe(1);
    expect(endIdx).toBe(3);
  });

  test('nested comments sharing a start boundary serialize well-nested', () => {
    // Outer comment 1 spans all three runs; inner comment 2 spans only the
    // first two. Both first appear on the same child, so the outer must open
    // first and the inner must close first: start1 start2 ... end2 ... end1.
    const outer = schema.marks.comment.create({ commentId: 1 });
    const inner = schema.marks.comment.create({ commentId: 2 });
    const para = schema.nodes.paragraph.create({ paraId: 'AAA' }, [
      schema.text('aa', [outer, inner]),
      schema.text('bb', [outer, inner]),
      schema.text('cc', [outer]),
    ]) as PMNode;

    const result = convertPMParagraph(para);
    expect(countMarker(result.content, 'commentRangeStart', 1)).toBe(1);
    expect(countMarker(result.content, 'commentRangeStart', 2)).toBe(1);
    expect(countMarker(result.content, 'commentRangeEnd', 1)).toBe(1);
    expect(countMarker(result.content, 'commentRangeEnd', 2)).toBe(1);

    const seq = result.content
      .filter((c) => c.type === 'commentRangeStart' || c.type === 'commentRangeEnd')
      .map((c) => `${c.type === 'commentRangeStart' ? 's' : 'e'}${(c as { id: number }).id}`);
    expect(seq).toEqual(['s1', 's2', 'e2', 'e1']);
  });

  test('nested comments sharing an end boundary serialize well-nested', () => {
    // Outer comment 1 spans all three; inner comment 2 spans the last two.
    // Both end on the same final child, so the inner must close first:
    // start1 ... start2 ... end2 end1.
    const outer = schema.marks.comment.create({ commentId: 1 });
    const inner = schema.marks.comment.create({ commentId: 2 });
    const para = schema.nodes.paragraph.create({ paraId: 'AAA' }, [
      schema.text('aa', [outer]),
      schema.text('bb', [outer, inner]),
      schema.text('cc', [outer, inner]),
    ]) as PMNode;

    const result = convertPMParagraph(para);
    const seq = result.content
      .filter((c) => c.type === 'commentRangeStart' || c.type === 'commentRangeEnd')
      .map((c) => `${c.type === 'commentRangeStart' ? 's' : 'e'}${(c as { id: number }).id}`);
    expect(seq).toEqual(['s1', 's2', 'e2', 'e1']);
  });

  // End-to-end through the public comment API: comment a range, then propose a
  // replace inside it. The inserted run carries no comment mark, so the range is
  // interrupted. The serialized document.xml must still have exactly one
  // balanced commentRangeStart/End pair (the user-facing repro for #914).
  test('public API: comment then proposed replace serializes one balanced pair', () => {
    const view = makeView('hello world');
    const alloc = createCommentIdAllocator();
    const comment = addCommentToRange(view, { paraId: 'AAA', text: 'note', author: 'Al' }, alloc);
    expect(comment).not.toBeNull();
    const ok = applyProposedChange(
      view,
      { paraId: 'AAA', search: 'hello', replaceWith: 'HI', author: 'Al' },
      alloc
    );
    expect(ok).toBe(true);

    const xml = serializeFirstPara(view);
    const id = comment!.id;
    const starts = [...xml.matchAll(/<w:commentRangeStart w:id="(\d+)"\/>/g)].map((m) => m[1]);
    const ends = [...xml.matchAll(/<w:commentRangeEnd w:id="(\d+)"\/>/g)].map((m) => m[1]);
    expect(starts).toEqual([String(id)]);
    expect(ends).toEqual([String(id)]);
    // The tracked-change wrapper sits inside the single range.
    expect(xml.indexOf('<w:commentRangeStart')).toBeLessThan(xml.indexOf('<w:ins '));
    expect(xml.indexOf('<w:ins ')).toBeLessThan(xml.indexOf('<w:commentRangeEnd'));
  });
});
