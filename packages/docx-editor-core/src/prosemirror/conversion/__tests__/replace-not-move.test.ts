/**
 * Regression for the move-pair misclassification bug discovered during
 * the issue #614 coalescing work.
 *
 * `w:id` is not guaranteed unique per ECMA-376, so an insertion and a
 * deletion happening to share an id (from the suggestion-mode replace
 * flow, from a parsed doc, from any source) must NOT cause the
 * serializer to flip them into `<w:moveFrom>`/`<w:moveTo>`. The
 * mark-level `isMovePair` attr (set only by the parser when reading
 * `<w:moveFrom>`/`<w:moveTo>`) is the single source of truth.
 */

import { describe, test, expect } from 'bun:test';
import { schema } from '../../schema';
import { fromProseDoc } from '../fromProseDoc';
import type { Paragraph } from '../../../types/document';

function runTypesIn(paragraph: Paragraph): string[] {
  return paragraph.content
    .map((c) => (c as { type?: string }).type)
    .filter((t): t is string => typeof t === 'string');
}

describe('fromProseDoc: replace produces ins/del, not move (regression for #614)', () => {
  test('adjacent deletion + insertion with DIFFERENT revisionIds emit as insertion / deletion', () => {
    const insertionMark = schema.marks.insertion.create({
      revisionId: 100,
      author: 'Jane',
      date: '2026-05-28T00:00:00Z',
    });
    const deletionMark = schema.marks.deletion.create({
      revisionId: 101, // DIFFERENT id — sidebar groups by (author, date)
      author: 'Jane',
      date: '2026-05-28T00:00:00Z',
    });

    const deletedText = schema.text('old', [deletionMark]);
    const insertedText = schema.text('new', [insertionMark]);
    const paragraph = schema.nodes.paragraph.create({}, [deletedText, insertedText]);
    const doc = schema.nodes.doc.create({}, [paragraph]);

    const result = fromProseDoc(doc);
    const para = result.package?.document?.content?.[0] as Paragraph | undefined;
    expect(para).toBeTruthy();
    expect(para?.type).toBe('paragraph');

    const types = runTypesIn(para as Paragraph);
    expect(types).toContain('insertion');
    expect(types).toContain('deletion');
    expect(types).not.toContain('moveFrom');
    expect(types).not.toContain('moveTo');
  });

  test('adjacent deletion + insertion with SAME revisionId still emit as ins/del (id collision is not a move signal)', () => {
    const sharedId = 200;
    const insertionMark = schema.marks.insertion.create({
      revisionId: sharedId,
      author: 'Jane',
      date: '2026-05-28T00:00:00Z',
    });
    const deletionMark = schema.marks.deletion.create({
      revisionId: sharedId,
      author: 'Jane',
      date: '2026-05-28T00:00:00Z',
    });

    const deletedText = schema.text('old', [deletionMark]);
    const insertedText = schema.text('new', [insertionMark]);
    const paragraph = schema.nodes.paragraph.create({}, [deletedText, insertedText]);
    const doc = schema.nodes.doc.create({}, [paragraph]);

    const result = fromProseDoc(doc);
    const para = result.package?.document?.content?.[0] as Paragraph | undefined;
    const types = runTypesIn(para as Paragraph);
    expect(types).toContain('insertion');
    expect(types).toContain('deletion');
    expect(types).not.toContain('moveFrom');
    expect(types).not.toContain('moveTo');
  });

  test('marks with isMovePair=true emit as moveFrom/moveTo (parser-driven move pairs round-trip)', () => {
    const movePairId = 300;
    const insertionMark = schema.marks.insertion.create({
      revisionId: movePairId,
      author: 'Jane',
      date: '2026-05-28T00:00:00Z',
      isMovePair: true,
    });
    const deletionMark = schema.marks.deletion.create({
      revisionId: movePairId,
      author: 'Jane',
      date: '2026-05-28T00:00:00Z',
      isMovePair: true,
    });

    const deletedText = schema.text('old', [deletionMark]);
    const insertedText = schema.text('new', [insertionMark]);
    const paragraph = schema.nodes.paragraph.create({}, [deletedText, insertedText]);
    const doc = schema.nodes.doc.create({}, [paragraph]);

    const result = fromProseDoc(doc);
    const para = result.package?.document?.content?.[0] as Paragraph | undefined;
    const types = runTypesIn(para as Paragraph);
    expect(types).toContain('moveFrom');
    expect(types).toContain('moveTo');
    expect(types).not.toContain('insertion');
    expect(types).not.toContain('deletion');
  });
});
