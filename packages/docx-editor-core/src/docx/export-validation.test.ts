import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { executeInsertTable } from '../agent/executor/structureCommands';
import type { Table } from '../types/document';
import { createEmptyDocument } from '../utils/createDocument';
import { createDocx } from './rezip';

function textRun(text: string) {
  return { type: 'run' as const, content: [{ type: 'text' as const, text }] };
}

async function documentXmlOf(buffer: ArrayBuffer): Promise<{ doc: string; rels: string }> {
  const zip = await JSZip.loadAsync(buffer);
  return {
    doc: await zip.file('word/document.xml')!.async('text'),
    rels: await zip.file('word/_rels/document.xml.rels')!.async('text'),
  };
}

describe('DOCX export validation', () => {
  test('a new external hyperlink gets a relationship and a resolving r:id', async () => {
    const doc = createEmptyDocument();
    doc.package.document.content = [
      {
        type: 'paragraph',
        content: [
          textRun('Visit '),
          {
            type: 'hyperlink',
            href: 'https://example.com?a=1&b=2',
            children: [textRun('example')],
          },
        ],
      },
    ];

    const { doc: documentXml, rels } = await documentXmlOf(await createDocx(doc));

    const rId = documentXml.match(/<w:hyperlink [^>]*r:id="([^"]+)"/)?.[1];
    expect(rId).toBeDefined();
    expect(rels).toContain(`Id="${rId}"`);
    expect(rels).toContain('Target="https://example.com?a=1&amp;b=2"');
    expect(rels).toContain('TargetMode="External"');
  });

  test('a stale hyperlink with no href and an unresolvable rId is unwrapped to its runs', async () => {
    const doc = createEmptyDocument();
    doc.package.document.content = [
      {
        type: 'paragraph',
        content: [{ type: 'hyperlink', rId: 'rIdGhost', children: [textRun('stale')] }],
      },
    ];

    const { doc: documentXml } = await documentXmlOf(await createDocx(doc));

    expect(documentXml).not.toContain('rIdGhost');
    expect(documentXml).not.toContain('<w:hyperlink');
    expect(documentXml).toContain('stale'); // run text survives
  });

  test('a targetless hyperlink that still carries a tooltip keeps its wrapper', async () => {
    const doc = createEmptyDocument();
    doc.package.document.content = [
      {
        type: 'paragraph',
        content: [{ type: 'hyperlink', tooltip: 'hint', children: [textRun('kept')] }],
      },
    ];

    const { doc: documentXml } = await documentXmlOf(await createDocx(doc));

    expect(documentXml).toContain('<w:hyperlink w:tooltip="hint">');
    expect(documentXml).toContain('kept');
  });

  test('a bare table serializes with a valid w:tblGrid', async () => {
    const doc = createEmptyDocument();
    doc.package.document.content = [
      {
        type: 'table',
        rows: [
          {
            type: 'tableRow',
            cells: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [textRun('A')] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [textRun('B')] }] },
            ],
          },
        ],
      },
    ];

    const { doc: documentXml } = await documentXmlOf(await createDocx(doc));

    expect(documentXml).toContain(
      '<w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid>'
    );
  });

  test('a merged first-row header does not undersize the grid', async () => {
    const doc = createEmptyDocument();
    doc.package.document.content = [
      {
        type: 'table',
        rows: [
          {
            type: 'tableRow',
            cells: [
              {
                type: 'tableCell',
                formatting: { gridSpan: 3 },
                content: [{ type: 'paragraph', content: [textRun('Header')] }],
              },
            ],
          },
          {
            type: 'tableRow',
            cells: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [textRun('A')] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [textRun('B')] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [textRun('C')] }] },
            ],
          },
        ],
      },
    ];

    const { doc: documentXml } = await documentXmlOf(await createDocx(doc));

    const gridColCount = (documentXml.match(/<w:gridCol /g) ?? []).length;
    expect(gridColCount).toBe(3); // not 1 (the first row's single merged cell)
  });

  test('body-row widths drive the grid, not a merged spanning header', async () => {
    const doc = createEmptyDocument();
    doc.package.document.content = [
      {
        type: 'table',
        rows: [
          {
            type: 'tableRow',
            cells: [
              {
                type: 'tableCell',
                formatting: { gridSpan: 3, width: { value: 9000, type: 'dxa' } },
                content: [{ type: 'paragraph', content: [textRun('Header')] }],
              },
            ],
          },
          {
            type: 'tableRow',
            cells: [
              {
                type: 'tableCell',
                formatting: { width: { value: 2000, type: 'dxa' } },
                content: [{ type: 'paragraph', content: [textRun('1')] }],
              },
              {
                type: 'tableCell',
                formatting: { width: { value: 2000, type: 'dxa' } },
                content: [{ type: 'paragraph', content: [textRun('2')] }],
              },
              {
                type: 'tableCell',
                formatting: { width: { value: 2000, type: 'dxa' } },
                content: [{ type: 'paragraph', content: [textRun('3')] }],
              },
            ],
          },
        ],
      },
    ];

    const { doc: documentXml } = await documentXmlOf(await createDocx(doc));

    // Grid mirrors the 3 body columns (2000 each), not the header split (3000 each).
    expect(documentXml).toContain(
      '<w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>'
    );
  });

  test('agent-inserted tables carry explicit export widths', () => {
    const doc = createEmptyDocument();
    const edited = executeInsertTable(doc, {
      type: 'insertTable',
      position: { paragraphIndex: 0, offset: 0 },
      rows: 2,
      columns: 3,
      data: [
        ['A', 'B', 'C'],
        ['D', 'E', 'F'],
      ],
    });

    const table = edited.package.document.content.find((b) => b.type === 'table') as Table;
    expect(table.formatting?.width).toEqual({ value: 9360, type: 'dxa' });
    expect(table.formatting?.layout).toBe('fixed');
    expect(table.columnWidths).toEqual([3120, 3120, 3120]);
    expect(table.rows[0].cells.map((c) => c.formatting?.width?.value)).toEqual([3120, 3120, 3120]);
  });
});
