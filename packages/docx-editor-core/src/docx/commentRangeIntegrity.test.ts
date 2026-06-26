import { describe, test, expect } from 'bun:test';
import type { Document, HeaderFooter, Paragraph } from '../types/document';
import { removeOrphanCommentRanges } from './commentRangeIntegrity';

function para(...content: Paragraph['content']): Paragraph {
  return { type: 'paragraph', content };
}

function rangeStart(id: number) {
  return { type: 'commentRangeStart' as const, id };
}
function rangeEnd(id: number) {
  return { type: 'commentRangeEnd' as const, id };
}
function run(text: string) {
  return { type: 'run' as const, content: [{ type: 'text' as const, text }] };
}

function commentIdsOf(p: Paragraph): number[] {
  return p.content
    .filter((i) => i.type === 'commentRangeStart' || i.type === 'commentRangeEnd')
    .map((i) => (i as { id: number }).id);
}

describe('removeOrphanCommentRanges', () => {
  test('keeps ranges with a matching comment, drops orphans, across all parts', () => {
    const bodyPara = para(
      rangeStart(1),
      run('known'),
      rangeEnd(1),
      rangeStart(9),
      run('orphan'),
      rangeEnd(9)
    );
    const cellPara = para(rangeStart(2), run('cell'), rangeEnd(2), rangeStart(8), rangeEnd(8));
    const headerPara = para(rangeStart(7), run('hdr'), rangeEnd(7));
    const footnotePara = para(rangeStart(3), run('note'), rangeEnd(3), rangeStart(6), rangeEnd(6));

    const header: HeaderFooter = { type: 'header', hdrFtrType: 'default', content: [headerPara] };

    const doc: Document = {
      package: {
        document: {
          comments: [
            { id: 1, author: 'a', content: [] },
            { id: 2, author: 'a', content: [] },
            { id: 3, author: 'a', content: [] },
          ],
          content: [
            bodyPara,
            {
              type: 'table',
              rows: [{ type: 'tableRow', cells: [{ type: 'tableCell', content: [cellPara] }] }],
            },
          ],
        },
        headers: new Map([['rId1', header]]),
        footnotes: [{ type: 'footnote', id: 1, content: [footnotePara] }],
      },
    };

    removeOrphanCommentRanges(doc);

    expect(commentIdsOf(bodyPara)).toEqual([1, 1]); // 9 dropped
    expect(commentIdsOf(cellPara)).toEqual([2, 2]); // 8 dropped
    expect(commentIdsOf(headerPara)).toEqual([]); // 7 dropped (no comment 7)
    expect(commentIdsOf(footnotePara)).toEqual([3, 3]); // 6 dropped
    // Text runs are untouched.
    expect(bodyPara.content.some((i) => i.type === 'run')).toBe(true);
  });

  test('drops every range when there are no comments at all', () => {
    const p = para(rangeStart(5), run('x'), rangeEnd(5));
    const doc: Document = {
      package: { document: { content: [p] } },
    };

    removeOrphanCommentRanges(doc);

    expect(commentIdsOf(p)).toEqual([]);
    expect(p.content).toHaveLength(1); // run survives
  });
});
