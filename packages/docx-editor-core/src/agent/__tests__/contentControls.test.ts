/**
 * Read/discovery API for block-level content controls, exercised against the
 * comprehensive fixture (10 SDT scenarios incl. nesting, table-wrapping,
 * dropdown, lock).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { parseDocx } from '../../docx/parser';
import { createDocx } from '../../docx/rezip';
import {
  findContentControls,
  findContentControl,
  setContentControlContent,
  removeContentControl,
  clearShowingPlaceholderXml,
  ContentControlNotFoundError,
  ContentControlLockedError,
  ContentControlTypeError,
  ContentControlBoundError,
  ContentControlKindError,
} from '../contentControls';
import type { BlockContent, Document } from '../../types/document';

// Relative to this file (cwd-independent — CI runs tests from the repo root).
const FIXTURE = join(import.meta.dir, '../../../../../e2e/fixtures/block-sdt-comprehensive.docx');

async function loadFixture(): Promise<Document> {
  const buf = readFileSync(FIXTURE);
  return parseDocx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe('findContentControls', () => {
  test('discovers every control with its modeled properties', async () => {
    const doc = await loadFixture();
    const controls = findContentControls(doc);

    // 10 declared scenarios; one (#4) nests another, so 11 controls total.
    expect(controls.length).toBe(11);
    const tags = controls.map((c) => c.tag);
    expect(tags).toContain('intro');
    expect(tags).toContain('multi');
    expect(tags).toContain('outer');
    expect(tags).toContain('inner');
  });

  test('filters by tag and reads the control text', async () => {
    const doc = await loadFixture();
    const intro = findContentControl(doc, { tag: 'intro' });
    expect(intro).toBeDefined();
    expect(intro?.alias).toBe('Intro');
    expect(intro?.sdtType).toBe('richText');
    expect(intro?.text).toContain('CONTROL #1');
  });

  test('surfaces lock, dropdown list items, and table-wrapping text', async () => {
    const doc = await loadFixture();
    expect(findContentControl(doc, { tag: 'locked' })?.lock).toBe('sdtContentLocked');
    expect(findContentControl(doc, { tag: 'choice' })?.listItems?.length).toBe(3);
    // #2 wraps a table; its text flattens the cells.
    expect(findContentControl(doc, { tag: 'grid' })?.text).toContain('B2');
  });

  test('reports nesting via path/depth and finds the inner control', async () => {
    const doc = await loadFixture();
    const inner = findContentControl(doc, { tag: 'inner' });
    expect(inner).toBeDefined();
    expect(inner!.depth).toBeGreaterThan(0); // nested below the body root
    expect(inner!.path.length).toBe(inner!.depth + 1);
  });

  test('filter by type narrows to matching controls', async () => {
    const doc = await loadFixture();
    const dropdowns = findContentControls(doc, { type: 'dropDownList' });
    expect(dropdowns.length).toBe(1);
    expect(dropdowns[0].tag).toBe('choice');
  });
});

describe('setContentControlContent', () => {
  test('replaces a control’s text while keeping tag/alias and raw props', async () => {
    const doc = await loadFixture();
    const before = findContentControl(doc, { tag: 'intro' })!;
    const next = setContentControlContent(doc, { tag: 'intro' }, 'Filled by template');

    const after = findContentControl(next, { tag: 'intro' })!;
    expect(after.text).toBe('Filled by template');
    expect(after.alias).toBe('Intro'); // identity preserved
    expect(after.id).toBe(before.id);
    // original untouched (pure function)
    expect(findContentControl(doc, { tag: 'intro' })!.text).toBe(before.text);
  });

  test('refuses a locked control unless forced', async () => {
    const doc = await loadFixture();
    expect(() => setContentControlContent(doc, { tag: 'locked' }, 'x')).toThrow(
      ContentControlLockedError
    );
    const forced = setContentControlContent(doc, { tag: 'locked' }, 'overridden', { force: true });
    expect(findContentControl(forced, { tag: 'locked' })!.text).toBe('overridden');
  });

  test('throws when nothing matches', async () => {
    const doc = await loadFixture();
    expect(() => setContentControlContent(doc, { tag: 'nope' }, 'x')).toThrow(
      ContentControlNotFoundError
    );
  });

  test('edits survive a full save → reparse round-trip', async () => {
    const doc = await loadFixture();
    const edited = setContentControlContent(doc, { tag: 'multi' }, 'New multi body');
    const bytes = await createDocx(edited);
    const reparsed = await parseDocx(bytes);

    const ctrl = findContentControl(reparsed, { tag: 'multi' })!;
    expect(ctrl.text).toBe('New multi body');
    expect(ctrl.alias).toBe('Multi');
    // other controls still present after the round-trip
    expect(findContentControls(reparsed).length).toBeGreaterThanOrEqual(10);
  });
});

describe('removeContentControl', () => {
  test('deletes the control region', async () => {
    const doc = await loadFixture();
    const next = removeContentControl(doc, { tag: 'intro' });
    expect(findContentControl(next, { tag: 'intro' })).toBeUndefined();
    expect(findContentControls(next).length).toBe(findContentControls(doc).length - 1);
  });

  test('keepContent unwraps the control but leaves its blocks', async () => {
    const doc = await loadFixture();
    const introText = findContentControl(doc, { tag: 'intro' })!.text;
    const next = removeContentControl(doc, { tag: 'intro' }, { keepContent: true });
    expect(findContentControl(next, { tag: 'intro' })).toBeUndefined();
    // the text is still in the body (now as a plain paragraph)
    const stillThere = next.package.document.content.some(
      (b) => b.type === 'paragraph' && b.content.some((r) => r.type === 'run')
    );
    expect(stillThere).toBe(true);
    expect(introText.length).toBeGreaterThan(0);
  });

  test('refuses to unwrap a repeating-section control unless forced', async () => {
    const doc = await loadFixture();
    expect(() => removeContentControl(doc, { tag: 'repeat' }, { keepContent: true })).toThrow(
      ContentControlLockedError
    );
    // Plain delete (not unwrap) is allowed.
    expect(
      findContentControl(removeContentControl(doc, { tag: 'repeat' }), { tag: 'repeat' })
    ).toBeUndefined();
  });
});

describe('typed controls + data binding + purity', () => {
  test('refuses free-text replacement of a dropdown control unless forced', async () => {
    const doc = await loadFixture();
    expect(() => setContentControlContent(doc, { tag: 'choice' }, 'Whatever')).toThrow(
      ContentControlTypeError
    );
    const forced = setContentControlContent(doc, { tag: 'choice' }, 'Archived', { force: true });
    expect(findContentControl(forced, { tag: 'choice' })!.text).toBe('Archived');
  });

  test('surfaces dataBinding on a bound control', async () => {
    const doc = await loadFixture();
    const bound = findContentControl(doc, { tag: 'bound' })!;
    expect(bound.dataBinding).toBeDefined();
    expect(bound.dataBinding!.storeItemID).toContain('1B2C3D4E');
  });

  test('block-content input is cloned (caller mutation does not leak)', async () => {
    const doc = await loadFixture();
    const blocks: BlockContent[] = [
      { type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'orig' }] }] },
    ];
    const next = setContentControlContent(doc, { tag: 'intro' }, blocks);
    // mutate the caller's array AFTER the call
    (blocks[0] as { content: { content: { text: string }[] }[] }).content[0].content[0].text =
      'mutated';
    expect(findContentControl(next, { tag: 'intro' })!.text).toBe('orig');
  });
});

describe('clearShowingPlaceholderXml', () => {
  test('strips the showingPlcHdr element, leaves other props', () => {
    const raw = '<w:sdtPr><w:tag w:val="x"/><w:showingPlcHdr/><w:id w:val="1"/></w:sdtPr>';
    const out = clearShowingPlaceholderXml(raw)!;
    expect(out).not.toContain('showingPlcHdr');
    expect(out).toContain('w:tag');
    expect(out).toContain('w:id');
  });

  test('setContentControlContent clears the placeholder flag on a placeholder control', () => {
    const doc: Document = {
      package: {
        document: {
          content: [
            {
              type: 'blockSdt',
              properties: {
                sdtType: 'richText',
                tag: 'ph',
                showingPlaceholder: true,
                rawPropertiesXml: '<w:sdtPr><w:tag w:val="ph"/><w:showingPlcHdr/></w:sdtPr>',
              },
              content: [{ type: 'paragraph', content: [] }],
            },
          ],
        },
      },
    } as unknown as Document;

    const next = setContentControlContent(doc, { tag: 'ph' }, 'Real value');
    const ctrl = next.package.document.content[0];
    expect(ctrl.type).toBe('blockSdt');
    if (ctrl.type === 'blockSdt') {
      expect(ctrl.properties.showingPlaceholder).toBe(false);
      expect(ctrl.properties.rawPropertiesXml).not.toContain('showingPlcHdr');
    }
  });
});

// Build a one-control document for guard tests.
function docWith(props: Record<string, unknown>): Document {
  return {
    package: {
      document: {
        content: [
          {
            type: 'blockSdt',
            properties: props,
            content: [{ type: 'paragraph', content: [] }],
          },
        ],
      },
    },
  } as unknown as Document;
}

function firstControlText(doc: Document): string {
  const c = doc.package.document.content[0];
  if (c.type !== 'blockSdt') return '';
  return c.content
    .filter((b): b is Extract<BlockContent, { type: 'paragraph' }> => b.type === 'paragraph')
    .map((p) =>
      p.content
        .map((r) =>
          r.type === 'run' ? r.content.map((t) => ('text' in t ? t.text : '')).join('') : ''
        )
        .join('')
    )
    .join('\n');
}

describe('round-2 write guards', () => {
  test('refuses writing to a data-bound control unless forced', () => {
    const doc = docWith({
      sdtType: 'richText',
      tag: 'b',
      dataBinding: { xpath: '/root/x', storeItemID: '{X}' },
    });
    expect(() => setContentControlContent(doc, { tag: 'b' }, 'v')).toThrow(
      ContentControlBoundError
    );
    expect(
      firstControlText(setContentControlContent(doc, { tag: 'b' }, 'v', { force: true }))
    ).toBe('v');
  });

  test('plainText fill collapses to a single paragraph', () => {
    const doc = docWith({ sdtType: 'plainText', tag: 'p' });
    const next = setContentControlContent(doc, { tag: 'p' }, 'line1\nline2');
    const c = next.package.document.content[0];
    expect(c.type).toBe('blockSdt');
    if (c.type === 'blockSdt') expect(c.content.length).toBe(1); // not split into 2 paragraphs
  });

  test('refuses free-text replacement of a group control unless forced', () => {
    const doc = docWith({ sdtType: 'group', tag: 'g' });
    expect(() => setContentControlContent(doc, { tag: 'g' }, 'x')).toThrow(ContentControlTypeError);
  });
});

// ---------------------------------------------------------------------------
// Inline content controls — discovery (Workstream A: read traversal).
// Built from minimal literals (cast like docWith above; a full Document is heavy).
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const mkRun = (text: string, formatting?: Record<string, unknown>): any => ({
  type: 'run',
  content: [{ type: 'text', text }],
  ...(formatting ? { formatting } : {}),
});
const mkInlineSdt = (tag: string, text: string, extra: Record<string, unknown> = {}): any => ({
  type: 'inlineSdt',
  properties: { sdtType: 'richText', tag, ...extra },
  content: [mkRun(text)],
});
const mkPara = (...content: any[]): any => ({ type: 'paragraph', content });
const mkBodyDoc = (content: any[]): Document =>
  ({ package: { document: { content } } }) as unknown as Document;
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('inline content controls — discovery', () => {
  test('finds an inline control in a body paragraph with kind/location/text', () => {
    const doc = mkBodyDoc([
      mkPara(mkRun('Dear '), mkInlineSdt('supplier-name', 'ACME Ltd'), mkRun('.')),
    ]);
    const c = findContentControl(doc, { tag: 'supplier-name' })!;
    expect(c).toBeDefined();
    expect(c.kind).toBe('inline');
    expect(c.location).toEqual({ part: 'body' });
    expect(c.text).toBe('ACME Ltd');
    expect(c.depth).toBe(0);
    expect(c.path).toEqual([0]); // block path of the enclosing paragraph
  });

  test('finds an inline control inside a table cell', () => {
    const doc = mkBodyDoc([
      mkPara(mkRun('lead')),
      {
        type: 'table',
        rows: [
          {
            type: 'tableRow',
            cells: [
              { type: 'tableCell', content: [mkPara(mkRun('label'))] },
              { type: 'tableCell', content: [mkPara(mkInlineSdt('start-date', '2026-01-01'))] },
            ],
          },
        ],
      },
    ]);
    const c = findContentControl(doc, { tag: 'start-date' })!;
    expect(c.kind).toBe('inline');
    expect(c.location).toEqual({ part: 'body' });
    expect(c.path).toEqual([1, 0]); // table at body index 1, paragraph 0 in the cell
    expect(c.text).toBe('2026-01-01');
  });

  test('finds an inline control inside a nested table', () => {
    const inner = {
      type: 'table',
      rows: [
        {
          type: 'tableRow',
          cells: [{ type: 'tableCell', content: [mkPara(mkInlineSdt('deep', 'D'))] }],
        },
      ],
    };
    const doc = mkBodyDoc([
      {
        type: 'table',
        rows: [{ type: 'tableRow', cells: [{ type: 'tableCell', content: [inner] }] }],
      },
    ]);
    const c = findContentControl(doc, { tag: 'deep' })!;
    expect(c.kind).toBe('inline');
    expect(c.path).toEqual([0, 0, 0]); // outer table → inner table → paragraph
    expect(c.text).toBe('D');
  });

  test('reports nesting depth = enclosing-control count', () => {
    const doc = mkBodyDoc([
      {
        type: 'blockSdt',
        properties: { sdtType: 'richText', tag: 'outer' },
        content: [mkPara(mkInlineSdt('inner', 'x'))],
      },
    ]);
    const all = findContentControls(doc);
    expect(all.find((c) => c.tag === 'outer')!.depth).toBe(0);
    const inner = all.find((c) => c.tag === 'inner')!;
    expect(inner.depth).toBe(1);
    expect(inner.kind).toBe('inline');
  });

  test('returns block then inline controls in strict document order', () => {
    const doc = mkBodyDoc([
      {
        type: 'blockSdt',
        properties: { sdtType: 'richText', tag: 'b1' },
        content: [mkPara(mkRun('B'))],
      },
      mkPara(mkInlineSdt('i1', 'one'), mkInlineSdt('i2', 'two')),
    ]);
    expect(findContentControls(doc).map((c) => c.tag)).toEqual(['b1', 'i1', 'i2']);
  });

  test('getContentControlText flattens runs, hyperlinks, and nested inline SDTs', () => {
    const doc = mkBodyDoc([
      mkPara({
        type: 'inlineSdt',
        properties: { sdtType: 'richText', tag: 'rich' },
        content: [
          mkRun('A'),
          { type: 'hyperlink', children: [mkRun('B')] },
          mkInlineSdt('nested', 'C'),
        ],
      }),
    ]);
    expect(findContentControl(doc, { tag: 'rich' })!.text).toBe('ABC');
  });

  test('block controls now also carry kind:block and location.body (no regression)', async () => {
    const doc = await loadFixture();
    const controls = findContentControls(doc);
    expect(controls.length).toBe(11); // unchanged
    for (const c of controls) {
      expect(c.kind).toBe('block');
      expect(c.location).toEqual({ part: 'body' });
    }
  });
});

describe('header/footer scope', () => {
  const hfDoc = (): Document =>
    ({
      package: {
        document: { content: [mkPara(mkInlineSdt('body-ctrl', 'b'))] },
        headers: new Map([
          ['rId7', { type: 'header', content: [mkPara(mkInlineSdt('hdr-ctrl', 'H'))] }],
        ]),
        footers: new Map([
          ['rId9', { type: 'footer', content: [mkPara(mkInlineSdt('ftr-ctrl', 'F'))] }],
        ]),
      },
    }) as unknown as Document;

  test('default scope omits header/footer controls', () => {
    expect(findContentControls(hfDoc()).map((c) => c.tag)).toEqual(['body-ctrl']);
  });

  test('includeHeadersFooters discovers header/footer controls with rId location, body first', () => {
    const all = findContentControls(hfDoc(), {}, { includeHeadersFooters: true });
    expect(all.map((c) => c.tag)).toEqual(['body-ctrl', 'hdr-ctrl', 'ftr-ctrl']);
    expect(all.find((c) => c.tag === 'hdr-ctrl')!.location).toEqual({
      part: 'header',
      rId: 'rId7',
    });
    expect(all.find((c) => c.tag === 'ftr-ctrl')!.location).toEqual({
      part: 'footer',
      rId: 'rId9',
    });
  });

  test('includeHeadersFooters on a bare DocumentBody does not throw and returns body only', () => {
    const body = { content: [mkPara(mkInlineSdt('only', 'x'))] } as unknown as Parameters<
      typeof findContentControls
    >[0];
    expect(
      findContentControls(body, {}, { includeHeadersFooters: true }).map((c) => c.tag)
    ).toEqual(['only']);
  });
});

// ---------------------------------------------------------------------------
// Inline content controls — mutation (Workstream B).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const firstBlock = (doc: Document): any => doc.package.document.content[0];

describe('setContentControlContent — inline', () => {
  test('fills an inline control with a single run (not a paragraph), siblings untouched', () => {
    const doc = mkBodyDoc([mkPara(mkRun('Dear '), mkInlineSdt('name', 'OLD'), mkRun('.'))]);
    const next = setContentControlContent(doc, { tag: 'name' }, 'ACME Ltd');
    expect(findContentControl(next, { tag: 'name' })!.text).toBe('ACME Ltd');

    const para = firstBlock(next);
    const sdt = para.content[1];
    expect(sdt.type).toBe('inlineSdt');
    expect(sdt.content).toHaveLength(1);
    expect(sdt.content[0].type).toBe('run');
    expect(sdt.content[0].content[0]).toEqual({ type: 'text', text: 'ACME Ltd' });
    expect(para.content[0].content[0].text).toBe('Dear '); // sibling run before
    expect(para.content[2].content[0].text).toBe('.'); // sibling run after

    // purity — original document unchanged
    expect(findContentControl(doc, { tag: 'name' })!.text).toBe('OLD');
  });

  test('the filled run inherits the placeholder run formatting', () => {
    const doc = mkBodyDoc([
      mkPara({
        type: 'inlineSdt',
        properties: { sdtType: 'richText', tag: 'f' },
        content: [mkRun('x', { highlight: 'yellow', bold: true, italic: true })],
      }),
    ]);
    const sdt = firstBlock(setContentControlContent(doc, { tag: 'f' }, 'V')).content[0];
    expect(sdt.content[0].formatting).toEqual({ highlight: 'yellow', bold: true, italic: true });
  });

  test('preserveSpace is set only when the value has boundary whitespace', () => {
    const d = () => mkBodyDoc([mkPara(mkInlineSdt('s', 'x'))]);
    // sdt → run → text node (where preserveSpace lives)
    const padded = firstBlock(setContentControlContent(d(), { tag: 's' }, ' padded ')).content[0];
    expect(padded.content[0].content[0].preserveSpace).toBe(true);
    const tight = firstBlock(setContentControlContent(d(), { tag: 's' }, 'tight')).content[0];
    expect(tight.content[0].content[0].preserveSpace).toBeUndefined();
  });

  test('plainText fills as one literal run; richText turns \\n into a w:br', () => {
    // plainText → one run whose content is a single literal text node (no break).
    const pt = firstBlock(
      setContentControlContent(
        mkBodyDoc([mkPara(mkInlineSdt('p', 'x', { sdtType: 'plainText' }))]),
        { tag: 'p' },
        'a\nb'
      )
    ).content[0];
    expect(pt.content).toHaveLength(1);
    expect(pt.content[0].content).toEqual([{ type: 'text', text: 'a\nb' }]);

    // richText → one run whose content interleaves text and a w:br.
    const rt = firstBlock(
      setContentControlContent(mkBodyDoc([mkPara(mkInlineSdt('r', 'x'))]), { tag: 'r' }, 'a\nb')
    ).content[0];
    expect(rt.content).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(rt.content[0].content.map((c: any) => c.type)).toEqual(['text', 'break', 'text']);
  });

  test('fills an inline control inside a table cell, leaving sibling cells alone', () => {
    const tableDoc = () =>
      mkBodyDoc([
        {
          type: 'table',
          rows: [
            {
              type: 'tableRow',
              cells: [
                { type: 'tableCell', content: [mkPara(mkRun('label'))] },
                { type: 'tableCell', content: [mkPara(mkInlineSdt('cell-ctrl', 'OLD'))] },
              ],
            },
          ],
        },
      ]);
    const next = setContentControlContent(tableDoc(), { tag: 'cell-ctrl' }, 'VAL');
    expect(findContentControl(next, { tag: 'cell-ctrl' })!.text).toBe('VAL');
    const tbl = firstBlock(next);
    expect(tbl.rows[0].cells[0].content[0].content[0].content[0].text).toBe('label');
  });

  test('rejects block content for an inline control, but flattens a single all-inline paragraph', () => {
    const d = () => mkBodyDoc([mkPara(mkInlineSdt('k', 'x'))]);
    expect(() =>
      setContentControlContent(d(), { tag: 'k' }, [
        { type: 'paragraph', content: [mkRun('a')] },
        { type: 'paragraph', content: [mkRun('b')] },
      ] as never)
    ).toThrow(ContentControlKindError);

    const flat = setContentControlContent(d(), { tag: 'k' }, [
      { type: 'paragraph', content: [mkRun('flat')] },
    ] as never);
    expect(findContentControl(flat, { tag: 'k' })!.text).toBe('flat');
    expect(firstBlock(flat).content[0].content[0].type).toBe('run'); // not a paragraph

    // a paragraph carrying a non-inline marker (comment range) is rejected, not silently dropped
    expect(() =>
      setContentControlContent(d(), { tag: 'k' }, [
        { type: 'paragraph', content: [{ type: 'commentRangeStart', id: '1' }, mkRun('a')] },
      ] as never)
    ).toThrow(ContentControlKindError);
  });

  test('applies the lock/type/data-bound guards to inline controls', () => {
    expect(() =>
      setContentControlContent(
        mkBodyDoc([mkPara(mkInlineSdt('l', 'x', { lock: 'sdtContentLocked' }))]),
        { tag: 'l' },
        'v'
      )
    ).toThrow(ContentControlLockedError);
    expect(() =>
      setContentControlContent(
        mkBodyDoc([mkPara(mkInlineSdt('dd', 'x', { sdtType: 'dropDownList' }))]),
        { tag: 'dd' },
        'v'
      )
    ).toThrow(ContentControlTypeError);
    expect(() =>
      setContentControlContent(
        mkBodyDoc([mkPara(mkInlineSdt('b', 'x', { dataBinding: { xpath: '/x' } }))]),
        { tag: 'b' },
        'v'
      )
    ).toThrow(ContentControlBoundError);
    const forced = setContentControlContent(
      mkBodyDoc([mkPara(mkInlineSdt('dd2', 'x', { sdtType: 'dropDownList' }))]),
      { tag: 'dd2' },
      'v',
      { force: true }
    );
    expect(findContentControl(forced, { tag: 'dd2' })!.text).toBe('v');
  });

  test('clears showingPlcHdr (projection and raw) on an inline placeholder write', () => {
    const phDoc = mkBodyDoc([
      mkPara({
        type: 'inlineSdt',
        properties: {
          sdtType: 'richText',
          tag: 'ph',
          showingPlaceholder: true,
          rawPropertiesXml: '<w:sdtPr><w:tag w:val="ph"/><w:showingPlcHdr/></w:sdtPr>',
        },
        content: [mkRun('Click here')],
      }),
    ]);
    const sdt = firstBlock(setContentControlContent(phDoc, { tag: 'ph' }, 'Filled')).content[0];
    expect(sdt.properties.showingPlaceholder).toBe(false);
    expect(sdt.properties.rawPropertiesXml).not.toContain('showingPlcHdr');
  });

  test('includeHeadersFooters writes an inline control in a header, immutably', () => {
    const hfWrite = (): Document =>
      ({
        package: {
          document: { content: [mkPara(mkRun('body'))] },
          headers: new Map([
            ['rId7', { type: 'header', content: [mkPara(mkInlineSdt('h', 'OLD'))] }],
          ]),
        },
      }) as unknown as Document;

    expect(() => setContentControlContent(hfWrite(), { tag: 'h' }, 'v')).toThrow(
      ContentControlNotFoundError
    );

    const doc0 = hfWrite();
    const next = setContentControlContent(doc0, { tag: 'h' }, 'NEW', {
      includeHeadersFooters: true,
    });
    expect(findContentControl(next, { tag: 'h' }, { includeHeadersFooters: true })!.text).toBe(
      'NEW'
    );
    expect(findContentControl(doc0, { tag: 'h' }, { includeHeadersFooters: true })!.text).toBe(
      'OLD'
    ); // original intact
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((next as any).package.headers).not.toBe((doc0 as any).package.headers);
  });
});

describe('removeContentControl — inline', () => {
  const rmDoc = () => mkBodyDoc([mkPara(mkRun('A '), mkInlineSdt('r', 'KEEP'), mkRun(' B'))]);

  test('keepContent unwraps the runs inline and removes the box', () => {
    const kept = removeContentControl(rmDoc(), { tag: 'r' }, { keepContent: true });
    expect(findContentControl(kept, { tag: 'r' })).toBeUndefined();
    const para = firstBlock(kept);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(para.content.some((n: any) => n.type === 'inlineSdt')).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(para.content.some((n: any) => n.type === 'run' && n.content[0]?.text === 'KEEP')).toBe(
      true
    );
  });

  test('delete removes the control and its content, preserving surrounding runs', () => {
    const del = removeContentControl(rmDoc(), { tag: 'r' });
    const para = firstBlock(del);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(para.content.some((n: any) => n.type === 'inlineSdt')).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(para.content.map((n: any) => n.content?.[0]?.text)).toEqual(['A ', ' B']);
  });
});

// ---------------------------------------------------------------------------
// { all: true } — apply a mutation to every matching control, not just the first.
// ---------------------------------------------------------------------------

describe('setContentControlContent / removeContentControl — { all: true }', () => {
  // Same tag recurring three times: two in the body (one in a table cell), and
  // — for scope — one in a header and one in a footer.
  const repeatedDoc = (extras: Record<string, unknown> = {}): Document =>
    ({
      package: {
        document: {
          content: [
            mkPara(mkRun('Dear '), mkInlineSdt('name', 'OLD', extras), mkRun(',')),
            {
              type: 'table',
              rows: [
                {
                  type: 'tableRow',
                  cells: [{ type: 'tableCell', content: [mkPara(mkInlineSdt('name', 'OLD'))] }],
                },
              ],
            },
          ],
        },
        headers: new Map([
          ['rId7', { type: 'header', content: [mkPara(mkInlineSdt('name', 'OLD'))] }],
        ]),
        footers: new Map([
          ['rId9', { type: 'footer', content: [mkPara(mkInlineSdt('name', 'OLD'))] }],
        ]),
      },
    }) as unknown as Document;

  test('default (first-match) fills only the first; { all } fills every body match', () => {
    const first = setContentControlContent(repeatedDoc(), { tag: 'name' }, 'NEW');
    expect(findContentControls(first, { tag: 'name' }).map((c) => c.text)).toEqual(['NEW', 'OLD']);

    const all = setContentControlContent(repeatedDoc(), { tag: 'name' }, 'NEW', { all: true });
    expect(findContentControls(all, { tag: 'name' }).map((c) => c.text)).toEqual(['NEW', 'NEW']);
  });

  test('{ all } with includeHeadersFooters fills body, header, and footer matches', () => {
    const all = setContentControlContent(repeatedDoc(), { tag: 'name' }, 'NEW', {
      all: true,
      includeHeadersFooters: true,
    });
    expect(
      findContentControls(all, { tag: 'name' }, { includeHeadersFooters: true }).map((c) => c.text)
    ).toEqual(['NEW', 'NEW', 'NEW', 'NEW']);
  });

  test('{ all } is atomic — a locked match aborts the whole write, input untouched', () => {
    const doc = repeatedDoc({ lock: 'contentLocked' }); // the first 'name' is locked
    expect(() => setContentControlContent(doc, { tag: 'name' }, 'NEW', { all: true })).toThrow(
      ContentControlLockedError
    );
    // nothing was written — the original is unchanged
    expect(findContentControls(doc, { tag: 'name' }).map((c) => c.text)).toEqual(['OLD', 'OLD']);
  });

  test('{ all } with force overrides the lock and fills every match', () => {
    const doc = repeatedDoc({ lock: 'contentLocked' });
    const forced = setContentControlContent(doc, { tag: 'name' }, 'NEW', {
      all: true,
      force: true,
    });
    expect(findContentControls(forced, { tag: 'name' }).map((c) => c.text)).toEqual(['NEW', 'NEW']);
  });

  test('{ all } with no match still throws ContentControlNotFoundError', () => {
    expect(() =>
      setContentControlContent(repeatedDoc(), { tag: 'absent' }, 'NEW', { all: true })
    ).toThrow(ContentControlNotFoundError);
  });

  test('removeContentControl { all } removes every matching control', () => {
    const all = removeContentControl(repeatedDoc(), { tag: 'name' }, { all: true });
    expect(findContentControls(all, { tag: 'name' })).toHaveLength(0);
  });
});
