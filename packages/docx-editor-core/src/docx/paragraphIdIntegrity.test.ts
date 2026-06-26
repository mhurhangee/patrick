import { describe, test, expect } from 'bun:test';
import type { Document, Paragraph } from '../types/document';
import { dedupeParagraphIds } from './paragraphIdIntegrity';
import { isValidLongHexId } from '../utils/hexId';

function para(paraId: string | undefined, text: string): Paragraph {
  return {
    type: 'paragraph',
    paraId,
    content: [{ type: 'run', content: [{ type: 'text', text }] }],
  };
}

describe('dedupeParagraphIds', () => {
  test('regenerates duplicate paraIds, keeps the first and uniques', () => {
    const p1 = para('0000ABCD', 'a');
    const p2 = para('0000ABCD', 'b'); // duplicate
    const p3 = para('11112222', 'c'); // unique
    const p4 = para(undefined, 'd'); // no id

    const doc: Document = { package: { document: { content: [p1, p2, p3, p4] } } };
    dedupeParagraphIds(doc);

    expect(p1.paraId).toBe('0000ABCD'); // first occurrence kept
    expect(p2.paraId).not.toBe('0000ABCD'); // duplicate regenerated
    expect(isValidLongHexId(p2.paraId)).toBe(true);
    expect(p3.paraId).toBe('11112222');
    expect(p4.paraId).toBeUndefined();

    const ids = [p1, p2, p3].map((p) => p.paraId);
    expect(new Set(ids).size).toBe(3); // all unique now
  });

  test('dedupes across body and header/footnote stories', () => {
    const body = para('4ACE0001', 'body');
    const headerPara = para('4ACE0001', 'header'); // dupes body
    const notePara = para('4ACE0001', 'note'); // dupes body

    const doc: Document = {
      package: {
        document: { content: [body] },
        headers: new Map([
          ['rId1', { type: 'header', hdrFtrType: 'default', content: [headerPara] }],
        ]),
        footnotes: [{ type: 'footnote', id: 1, content: [notePara] }],
      },
    };
    dedupeParagraphIds(doc);

    const ids = [body.paraId, headerPara.paraId, notePara.paraId];
    expect(new Set(ids).size).toBe(3);
    ids.forEach((id) => expect(isValidLongHexId(id)).toBe(true));
  });
});
