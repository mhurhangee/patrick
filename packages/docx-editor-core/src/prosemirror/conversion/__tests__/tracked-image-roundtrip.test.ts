/**
 * A picture inserted/deleted under track changes must round-trip as a genuine
 * tracked change: `fromProseDoc` wraps a mark-carrying image in an
 * `<w:ins>`/`<w:del>` (Insertion/Deletion) instead of dropping the mark, and
 * `toProseDoc` re-applies the mark onto the image node on load.
 *
 * Background: "all elements (images etc.) should be tracked change."
 */

import { describe, test, expect } from 'bun:test';
import { schema } from '../../schema';
import { fromProseDoc } from '../fromProseDoc';
import { toProseDoc } from '../toProseDoc';
import type { Paragraph } from '../../../types/document';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function markedImageDoc(markName: 'insertion' | 'deletion', revisionId: number) {
  const mark = schema.marks[markName].create({
    revisionId,
    author: 'Jane',
    date: '2026-05-30T00:00:00Z',
  });
  const image = schema.nodes.image.create({ src: PNG, width: 80, height: 60 });
  const markedImage = image.mark(mark.addToSet(image.marks));
  const paragraph = schema.nodes.paragraph.create({}, [markedImage]);
  return schema.nodes.doc.create({}, [paragraph]);
}

describe('tracked image round-trips through fromProseDoc/toProseDoc', () => {
  test('inserted image serializes inside an <w:ins> wrapper and reloads marked', () => {
    const doc = markedImageDoc('insertion', 200);

    // Forward: the image lands inside an Insertion, not a dropped/empty run.
    const pkg = fromProseDoc(doc);
    const para = pkg.package?.document?.content?.[0] as Paragraph | undefined;
    const ins = para?.content.find((c) => (c as { type?: string }).type === 'insertion') as
      | { info: { id: number }; content: Array<{ content?: Array<{ type?: string }> }> }
      | undefined;
    expect(ins, 'image must serialize inside an <w:ins> wrapper').toBeTruthy();
    expect(ins?.info.id).toBe(200);
    const wrapsImage = ins?.content?.[0]?.content?.some((x) => x.type === 'drawing');
    expect(wrapsImage, 'the insertion wraps the image drawing').toBe(true);

    // Reverse: toProseDoc re-applies the insertion mark onto the image node.
    const doc2 = toProseDoc(pkg);
    let markedImages = 0;
    doc2.descendants((node) => {
      if (node.type.name === 'image' && node.marks.some((m) => m.type.name === 'insertion')) {
        markedImages += 1;
      }
    });
    expect(markedImages, 'reloaded image carries the insertion mark').toBe(1);
  });

  test('tracked TEXT still round-trips (regression: do not gate marking on allowsMarkType alone)', () => {
    // A leaf text node's own markSet is empty, so `text.allowsMarkType(insertion)`
    // is false even though the paragraph permits the mark. toProseDoc must keep
    // the `isText` short-circuit or tracked text loads/round-trips as plain text.
    const mark = schema.marks.insertion.create({
      revisionId: 300,
      author: 'Jane',
      date: '2026-05-30T00:00:00Z',
    });
    const paragraph = schema.nodes.paragraph.create({}, [schema.text('added', [mark])]);
    const doc = schema.nodes.doc.create({}, [paragraph]);

    const pkg = fromProseDoc(doc);
    const doc2 = toProseDoc(pkg);
    let markedText = 0;
    doc2.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'insertion')) markedText += 1;
    });
    expect(markedText, 'reloaded text keeps its insertion mark').toBe(1);
  });

  test('deleted image serializes inside a <w:del> wrapper and reloads marked', () => {
    const doc = markedImageDoc('deletion', 201);
    const pkg = fromProseDoc(doc);
    const para = pkg.package?.document?.content?.[0] as Paragraph | undefined;
    const del = para?.content.find((c) => (c as { type?: string }).type === 'deletion');
    expect(del, 'image must serialize inside a <w:del> wrapper').toBeTruthy();

    const doc2 = toProseDoc(pkg);
    let markedImages = 0;
    doc2.descendants((node) => {
      if (node.type.name === 'image' && node.marks.some((m) => m.type.name === 'deletion')) {
        markedImages += 1;
      }
    });
    expect(markedImages, 'reloaded image carries the deletion mark').toBe(1);
  });
});
