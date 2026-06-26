/**
 * Issue #805 — the PM save path drops `vMerge` continuation cells / markers on
 * round-trip.
 *
 * Save flow under test (React DocxEditor `save()`):
 *
 *     PM state  ->  fromProseDoc()  ->  Document  ->  serializeTable()  ->  XML
 *
 * The headless `repackDocx()` path keeps vertically-merged tables intact;
 * ONLY this PM round-trip is affected. The crux is how ProseMirror models a
 * vertical merge: a `w:vMerge="restart"` cell becomes the merge origin and the
 * `w:vMerge="continue"` cells below it are NOT separate nodes — the origin
 * carries `rowspan`. `fromProseDoc/tables.ts` reconstructs the continuation
 * cells from that `rowspan`.
 *
 * But when the PM table instead holds the continuation cells as *real* nodes
 * (`rowspan: 1`, the merge info living only in `_originalFormatting.vMerge`),
 * `convertPMTable` derives vMerge/gridSpan purely from `rowspan`/`colspan` and
 * never consults `_originalFormatting.vMerge`. The result:
 *   - the `vMerge="restart"` origin (rowspan 1) loses its `restart` marker,
 *   - each continuation cell loses its `continue` marker,
 *   - so Word reads N independent cells where the source had a merge, visible
 *     cells shift, and the same-row `gridSpan` cell no longer lines up.
 *
 * Fixture (from the issue) — 3 visible columns, declared 3-col grid:
 *   Row 0: [Vert-A (vMerge=restart), B1, C1]
 *   Row 1: [vMergeContinue, E1, E2+F2 (gridSpan=2)]
 *   Row 2: [vMergeContinue, B3, C3]
 */

import { describe, test, expect } from 'bun:test';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { splitCell as pmSplitCell } from 'prosemirror-tables';
import { schema } from '../../prosemirror/schema';
import { fromProseDoc } from '../../prosemirror/conversion/fromProseDoc';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { serializeTable } from '../serializer/tableSerializer';
import type { Document, Table, TableCellFormatting } from '../../types/document';

/**
 * Build a PM `tableCell` JSON node that holds vMerge/gridSpan info the way an
 * un-collapsed (continuation-cell-present) table does: PM `rowspan`/`colspan`
 * are the structural truth, and `_originalFormatting` carries the OOXML merge
 * markers parsed from the source DOCX.
 */
function cellNode(
  text: string,
  opts: { colspan?: number; rowspan?: number; original?: TableCellFormatting } = {}
) {
  return {
    type: 'tableCell',
    attrs: {
      colspan: opts.colspan ?? 1,
      rowspan: opts.rowspan ?? 1,
      _originalFormatting: opts.original ?? null,
    },
    content: [
      {
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : [],
      },
    ],
  };
}

function rowNode(cells: ReturnType<typeof cellNode>[]) {
  return { type: 'tableRow', attrs: {}, content: cells };
}

/**
 * The issue fixture, expressed as a PM doc whose vMerge continuation cells are
 * present as standalone `rowspan: 1` nodes (merge markers only in
 * `_originalFormatting`). This is the representation the PM round-trip drops.
 */
function fixturePmDoc() {
  const json = {
    type: 'doc',
    content: [
      {
        type: 'table',
        attrs: { columnWidths: [2000, 2000, 2000] },
        content: [
          rowNode([
            cellNode('Vert-A', { original: { vMerge: 'restart' } }),
            cellNode('B1'),
            cellNode('C1'),
          ]),
          rowNode([
            cellNode('', { original: { vMerge: 'continue' } }),
            cellNode('E1'),
            cellNode('E2+F2', { colspan: 2, original: { gridSpan: 2 } }),
          ]),
          rowNode([
            cellNode('', { original: { vMerge: 'continue' } }),
            cellNode('B3'),
            cellNode('C3'),
          ]),
        ],
      },
    ],
  };
  return schema.nodeFromJSON(json);
}

function firstTable(doc: Document): Table {
  const table = doc.package.document.content?.find((b) => b.type === 'table');
  if (!table || table.type !== 'table') throw new Error('expected a table block');
  return table;
}

function cellText(cell: Table['rows'][number]['cells'][number]): string {
  const para = cell.content[0];
  if (!para || para.type !== 'paragraph') return '';
  const run = para.content?.[0];
  if (!run || run.type !== 'run') return '';
  const t = run.content?.[0];
  return t && t.type === 'text' ? t.text : '';
}

describe('issue #805 — vMerge continuation cells survive the PM save path', () => {
  test('fromProseDoc keeps cell positions, vMerge=continue, and same-row gridSpan', () => {
    const back = fromProseDoc(fixturePmDoc());
    const table = firstTable(back);

    expect(table.rows).toHaveLength(3);

    // Row 0 — three cells, origin carries vMerge=restart.
    const row0 = table.rows[0];
    expect(row0.cells.map(cellText)).toEqual(['Vert-A', 'B1', 'C1']);
    expect(row0.cells[0].formatting?.vMerge).toBe('restart');

    // Row 1 — continuation cell at column 0 (empty), then E1, then the
    // horizontally-merged E2+F2 with gridSpan=2. Nothing must shift left.
    const row1 = table.rows[1];
    expect(row1.cells.map(cellText)).toEqual(['', 'E1', 'E2+F2']);
    expect(row1.cells[0].formatting?.vMerge).toBe('continue');
    expect(row1.cells[2].formatting?.gridSpan).toBe(2);

    // Row 2 — continuation cell at column 0, then B3, C3.
    const row2 = table.rows[2];
    expect(row2.cells.map(cellText)).toEqual(['', 'B3', 'C3']);
    expect(row2.cells[0].formatting?.vMerge).toBe('continue');
  });

  test('serialized XML emits the restart, both continuations, and gridSpan', () => {
    const back = fromProseDoc(fixturePmDoc());
    const xml = serializeTable(firstTable(back));

    const rows = xml.match(/<w:tr>.*?<\/w:tr>/gs) ?? [];
    expect(rows).toHaveLength(3);

    const count = (s: string | undefined, re: RegExp) => (s?.match(re) ?? []).length;

    // Every row keeps all three cells (nothing dropped / shifted).
    for (const tr of rows) {
      expect(count(tr, /<w:tc>/g)).toBe(3);
    }

    // Row 0: one vMerge restart.
    expect(count(rows[0], /<w:vMerge w:val="restart"\/>/g)).toBe(1);

    // Row 1: a bare <w:vMerge/> continuation in column 0 and a gridSpan=2 cell.
    expect(count(rows[1], /<w:vMerge\/>/g)).toBe(1);
    expect(count(rows[1], /<w:gridSpan w:val="2"\/>/g)).toBe(1);

    // Row 2: a bare <w:vMerge/> continuation in column 0.
    expect(count(rows[2], /<w:vMerge\/>/g)).toBe(1);
  });

  // Regression guard: the real prosemirror-tables `splitCell` does NOT null
  // `_originalFormatting`, so after a user splits a merged cell the origin (and
  // the inserted cell) still carry `_originalFormatting.vMerge = 'restart'`.
  // The save path must NOT resurrect that merge — splitting is an explicit
  // un-merge. `normalizeVMergeRuns` drops the now-invalid lone `restart` markers.
  test('splitting a merged cell does not resurrect vMerge on save', () => {
    // Column 0 is a vertical merge across both rows: origin has rowspan:2 and
    // the OOXML restart marker in _originalFormatting; row 1 col 0 is covered
    // (absent, the PM-tables representation of a merge).
    const merged = schema.nodes.tableCell.create(
      { rowspan: 2, _originalFormatting: { vMerge: 'restart' } },
      schema.nodes.paragraph.create(null, schema.text('A'))
    );
    const b1 = schema.nodes.tableCell.create(
      null,
      schema.nodes.paragraph.create(null, schema.text('B1'))
    );
    const d1 = schema.nodes.tableCell.create(
      null,
      schema.nodes.paragraph.create(null, schema.text('D1'))
    );
    const table = schema.nodes.table.create({ columnWidths: [2000, 2000] }, [
      schema.nodes.tableRow.create(null, [merged, b1]),
      schema.nodes.tableRow.create(null, [d1]),
    ]);
    const doc = schema.nodes.doc.create(null, [table]);

    const view = {
      state: EditorState.create({ schema, doc }),
      dispatch(tr: Transaction) {
        view.state = view.state.apply(tr);
      },
    } as unknown as EditorView & { state: EditorState };

    // Put the cursor inside the merged origin cell ("A") and split it.
    const insideMerged = 4; // doc>table(1)>row(2)>cell(3)>para text(4)
    view.state = view.state.apply(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, insideMerged))
    );
    const ok = pmSplitCell(view.state, view.dispatch);
    expect(ok).toBe(true);

    // After the split, no vertical merge should survive the save path.
    const back = fromProseDoc(view.state.doc);
    const t = firstTable(back);
    const allVMerge = t.rows.flatMap((r) => r.cells.map((c) => c.formatting?.vMerge));
    expect(allVMerge.every((v) => v === undefined)).toBe(true);

    const xml = serializeTable(t);
    expect(xml).not.toContain('<w:vMerge');
  });

  // The realistic #805 reproduction from a real document: a vertical merge whose
  // continuation row is FULLY covered (every column is `continue`). toProseDoc's
  // `rowWouldBeEmpty` path can't model that with PM rowspan, so it emits the
  // origin AND the continuation cells as standalone `rowspan:1` nodes. Before the
  // fix, the PM save path dropped every marker and the merge was destroyed.
  test('a fully-covered continuation row (rowWouldBeEmpty) keeps its merge', () => {
    const dcell = (
      text: string,
      vMerge?: 'restart' | 'continue'
    ): Table['rows'][number]['cells'][number] => ({
      type: 'tableCell',
      formatting: vMerge ? { vMerge } : undefined,
      content: [
        {
          type: 'paragraph',
          content: text ? [{ type: 'run', content: [{ type: 'text', text }] }] : [],
        },
      ],
    });
    const srcTable: Table = {
      type: 'table',
      columnWidths: [2000, 2000],
      rows: [
        { type: 'tableRow', cells: [dcell('A', 'restart'), dcell('B', 'restart')] },
        { type: 'tableRow', cells: [dcell('', 'continue'), dcell('', 'continue')] },
      ],
    };
    const srcDoc: Document = { package: { document: { content: [srcTable] } } };

    // Forward to PM then back through the save path.
    const back = fromProseDoc(toProseDoc(srcDoc), srcDoc);
    const xml = serializeTable(firstTable(back));

    expect((xml.match(/<w:vMerge w:val="restart"\/>/g) ?? []).length).toBe(2);
    expect((xml.match(/<w:vMerge\/>/g) ?? []).length).toBe(2);
  });
});
