import { describe, expect, test } from 'bun:test';
import {
  applyFootnotePresentation,
  calculateFootnoteReservedHeights,
  collectFootnoteRefs,
  FOOTNOTE_SEPARATOR_HEIGHT,
  mapFootnotesToPages,
} from '../footnoteLayout';
import type { FootnoteRefLocation } from '../footnoteLayout';
import type {
  FlowBlock,
  ParagraphBlock,
  ParagraphFragment,
  Page,
  TableBlock,
  TableFragment,
  TextBoxBlock,
  TextRun,
} from '../../layout-engine/types';

function paragraphWithFootnote(id: string, footnoteId: number, pmStart: number): ParagraphBlock {
  return {
    kind: 'paragraph',
    id,
    runs: [
      {
        kind: 'text',
        text: 'x',
        footnoteRefId: footnoteId,
        pmStart,
      },
    ],
  };
}

describe('footnote layout reservation', () => {
  test('adds the shared separator height to each page reservation', () => {
    const reserved = calculateFootnoteReservedHeights(
      new Map([
        [1, [10, 11]],
        [3, [12]],
      ]),
      new Map([
        [10, { height: 14 }],
        [11, { height: 18 }],
        [12, { height: 9 }],
      ])
    );

    expect(reserved.get(1)).toBe(14 + 18 + FOOTNOTE_SEPARATOR_HEIGHT);
    expect(reserved.get(3)).toBe(9 + FOOTNOTE_SEPARATOR_HEIGHT);
  });
});

describe('applyFootnotePresentation', () => {
  test('the synthetic marker run inherits the footnote text font', () => {
    // Regression: the prepended number run carried no fontFamily, so the
    // painter fell back to the inherited container default and the footnote
    // number rendered in a different font than the note text. The marker must
    // match the note's font (Word renders the number in the FootnoteText face;
    // the FootnoteReference char style only adds superscript, not a face).
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'fn1',
        runs: [{ kind: 'text', text: 'See note.', fontFamily: 'Cambria', fontSize: 10 }],
      },
    ];

    const out = applyFootnotePresentation(blocks, 3);
    const marker = (out[0] as ParagraphBlock).runs[0] as TextRun;

    expect(marker.text).toBe('3  ');
    expect(marker.superscript).toBe(true);
    expect(marker.fontFamily).toBe('Cambria');
  });

  test('leaves the marker font unset when the note text has no explicit font', () => {
    // Both marker and note text then inherit the same container font, so they
    // still match; we must not invent a divergent family.
    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'fn1', runs: [{ kind: 'text', text: 'See note.' }] },
    ];

    const out = applyFootnotePresentation(blocks, 1);
    const marker = (out[0] as ParagraphBlock).runs[0] as TextRun;

    expect(marker.fontFamily).toBeUndefined();
  });
});

describe('collectFootnoteRefs', () => {
  test('collects refs from top-level paragraphs', () => {
    const blocks: FlowBlock[] = [
      paragraphWithFootnote('p1', 1, 10),
      paragraphWithFootnote('p2', 2, 20),
    ];

    expect(collectFootnoteRefs(blocks)).toEqual([
      { footnoteId: 1, pmPos: 10 },
      { footnoteId: 2, pmPos: 20 },
    ]);
  });

  test('recurses into table cells so cell-authored refs reach the page-reservation pass', () => {
    // Regression: previously the collector iterated only top-level blocks and
    // skipped `kind: "table"` entirely, so any footnote authored inside a
    // table cell never made it into pageFootnoteMap. The body still rendered
    // the in-line ref marker, but the per-page footnote area dropped the
    // entry — leaving readers with a dangling superscript number.
    const table: TableBlock = {
      kind: 'table',
      id: 't1',
      rows: [
        {
          id: 'r1',
          cells: [
            {
              id: 'c1',
              blocks: [paragraphWithFootnote('cell-p1', 7, 100)],
            },
            {
              id: 'c2',
              blocks: [
                {
                  kind: 'table',
                  id: 't-nested',
                  rows: [
                    {
                      id: 'r-nested',
                      cells: [
                        {
                          id: 'c-nested',
                          blocks: [paragraphWithFootnote('nested-p', 8, 200)],
                        },
                      ],
                    },
                  ],
                } as TableBlock,
              ],
            },
          ],
        },
      ],
    };

    const blocks: FlowBlock[] = [
      paragraphWithFootnote('body-p', 1, 10),
      table,
      paragraphWithFootnote('trailing-p', 2, 300),
    ];

    expect(collectFootnoteRefs(blocks)).toEqual([
      { footnoteId: 1, pmPos: 10 },
      // In-table refs carry the outermost table id + row index so a split
      // table can distribute its footnotes per page. The nested-table ref (8)
      // keeps the OUTER table's context (t1, row 0), not the inner table's.
      { footnoteId: 7, pmPos: 100, tableBlockId: 't1', rowIndex: 0 },
      { footnoteId: 8, pmPos: 200, tableBlockId: 't1', rowIndex: 0 },
      { footnoteId: 2, pmPos: 300 },
    ]);
  });

  test('recurses into text-box content blocks', () => {
    const textBox: TextBoxBlock = {
      kind: 'textBox',
      id: 'tb1',
      width: 100,
      content: [paragraphWithFootnote('tb-p', 9, 50)],
    };

    expect(collectFootnoteRefs([textBox])).toEqual([{ footnoteId: 9, pmPos: 50 }]);
  });
});

describe('mapFootnotesToPages', () => {
  test('uses split paragraph fragment ranges instead of the whole paragraph range', () => {
    const pages: Page[] = [
      {
        number: 1,
        fragments: [
          {
            kind: 'paragraph',
            blockId: 'p1',
            x: 0,
            y: 0,
            width: 100,
            height: 40,
            fromLine: 0,
            toLine: 2,
            pmStart: 9,
            pmEnd: 22,
          } as ParagraphFragment,
        ],
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        size: { w: 300, h: 80 },
      },
      {
        number: 2,
        fragments: [
          {
            kind: 'paragraph',
            blockId: 'p1',
            x: 0,
            y: 20,
            width: 100,
            height: 20,
            fromLine: 2,
            toLine: 3,
            pmStart: 22,
            pmEnd: 30,
          } as ParagraphFragment,
        ],
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        size: { w: 300, h: 80 },
      },
    ];

    expect(
      mapFootnotesToPages(pages, [
        { footnoteId: 1, pmPos: 16 },
        { footnoteId: 2, pmPos: 22 },
      ])
    ).toEqual(
      new Map([
        [1, [1]],
        [2, [2]],
      ])
    );
  });

  test('distributes a multi-page table’s footnotes by the page holding each row', () => {
    // Regression: a table split across pages keeps the WHOLE table's pm range
    // on every fragment, so pm-position matching dumped all footnote refs on
    // the first table page. Row-index attribution sends each ref to the page
    // that actually laid out its row. Both fragments below deliberately carry
    // the same pm range (5..80) to prove the fix does not rely on it.
    const tableFragment = (pageRows: [fromRow: number, toRow: number]): TableFragment => ({
      kind: 'table',
      blockId: 't1',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      fromRow: pageRows[0],
      toRow: pageRows[1],
      pmStart: 5,
      pmEnd: 80,
    });

    const pages: Page[] = [
      {
        number: 1,
        fragments: [tableFragment([0, 2])],
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        size: { w: 300, h: 80 },
      },
      {
        number: 2,
        fragments: [tableFragment([2, 4])],
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        size: { w: 300, h: 80 },
      },
    ];

    const refs: FootnoteRefLocation[] = [
      { footnoteId: 1, pmPos: 10, tableBlockId: 't1', rowIndex: 0 },
      { footnoteId: 2, pmPos: 12, tableBlockId: 't1', rowIndex: 1 },
      { footnoteId: 3, pmPos: 40, tableBlockId: 't1', rowIndex: 2 },
      { footnoteId: 4, pmPos: 60, tableBlockId: 't1', rowIndex: 3 },
    ];

    expect(mapFootnotesToPages(pages, refs)).toEqual(
      new Map([
        [1, [1, 2]],
        [2, [3, 4]],
      ])
    );
  });
});
