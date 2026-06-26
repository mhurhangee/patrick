/**
 * Typed value setters for content controls: dropdown selection, checkbox
 * toggle, and date — each updates the visible content and patches the raw
 * w:sdtPr state in place.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  setContentControlValue,
  formatSdtDate,
  ContentControlValueError,
} from '../contentControlValues';
import {
  findContentControl,
  ContentControlNotFoundError,
  ContentControlBoundError,
  ContentControlLockedError,
} from '../contentControls';
import { parseDocx } from '../../docx/parser';
import { createDocx } from '../../docx/rezip';
import type { Document, SdtProperties } from '../../types/document';

const WIDGET_FIXTURE = join(import.meta.dir, '../../../../../e2e/fixtures/block-sdt-widgets.docx');

function docWith(props: SdtProperties): Document {
  return {
    package: {
      document: {
        content: [
          { type: 'blockSdt', properties: props, content: [{ type: 'paragraph', content: [] }] },
        ],
      },
    },
  } as unknown as Document;
}

describe('setContentControlValue — dropdown', () => {
  const props: SdtProperties = {
    sdtType: 'dropDownList',
    tag: 'status',
    listItems: [
      { displayText: 'Draft', value: '1' },
      { displayText: 'Final', value: '2' },
    ],
    rawPropertiesXml: '<w:sdtPr><w:tag w:val="status"/><w:dropDownList w:lastValue="1"/></w:sdtPr>',
  };

  test('selects an item by value: sets display text and patches lastValue', () => {
    const next = setContentControlValue(
      docWith(props),
      { tag: 'status' },
      {
        kind: 'dropdown',
        value: '2',
      }
    );
    const ctrl = findContentControl(next, { tag: 'status' })!;
    expect(ctrl.text).toBe('Final');
    const c = next.package.document.content[0];
    if (c.type === 'blockSdt') {
      expect(c.properties.rawPropertiesXml).toContain('w:lastValue="2"');
    }
  });

  test('accepts matching by displayText', () => {
    const next = setContentControlValue(
      docWith(props),
      { tag: 'status' },
      {
        kind: 'dropdown',
        value: 'Draft',
      }
    );
    expect(findContentControl(next, { tag: 'status' })!.text).toBe('Draft');
  });

  test('rejects an unknown value', () => {
    expect(() =>
      setContentControlValue(docWith(props), { tag: 'status' }, { kind: 'dropdown', value: 'X' })
    ).toThrow(ContentControlValueError);
  });

  test('rejects a kind/type mismatch', () => {
    expect(() =>
      setContentControlValue(docWith(props), { tag: 'status' }, { kind: 'checkbox', checked: true })
    ).toThrow(ContentControlValueError);
  });

  test('adds w:lastValue when the dropdown has no stored selection yet', () => {
    // A dropdown that has never been picked has no w:lastValue attribute; the
    // setter must add it so the structured selection persists, not just the text.
    const noLastValue: SdtProperties = {
      sdtType: 'dropDownList',
      tag: 'fresh',
      listItems: [{ displayText: 'Final', value: '2' }],
      rawPropertiesXml: '<w:sdtPr><w:tag w:val="fresh"/><w:dropDownList/></w:sdtPr>',
    };
    const next = setContentControlValue(
      docWith(noLastValue),
      { tag: 'fresh' },
      { kind: 'dropdown', value: '2' }
    );
    const c = next.package.document.content[0];
    expect(c.type).toBe('blockSdt');
    if (c.type === 'blockSdt') {
      expect(c.properties.rawPropertiesXml).toContain('w:lastValue="2"');
    }
  });
});

describe('setContentControlValue — checkbox', () => {
  const props: SdtProperties = {
    sdtType: 'checkbox',
    tag: 'agree',
    checked: false,
    rawPropertiesXml:
      '<w:sdtPr><w:tag w:val="agree"/><w14:checkbox><w14:checked w14:val="0"/>' +
      '<w14:checkedState w14:val="2612" w14:font="MS Gothic"/>' +
      '<w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox></w:sdtPr>',
  };

  test('checking sets checked + the checked glyph + raw val', () => {
    const next = setContentControlValue(
      docWith(props),
      { tag: 'agree' },
      {
        kind: 'checkbox',
        checked: true,
      }
    );
    const c = next.package.document.content[0];
    expect(c.type).toBe('blockSdt');
    if (c.type === 'blockSdt') {
      expect(c.properties.checked).toBe(true);
      expect(c.properties.rawPropertiesXml).toContain('w14:checked w14:val="1"');
      expect(findContentControl(next, { tag: 'agree' })!.text).toBe(String.fromCodePoint(0x2612));
    }
  });

  test('unchecking sets the unchecked glyph', () => {
    const checked = setContentControlValue(
      docWith(props),
      { tag: 'agree' },
      {
        kind: 'checkbox',
        checked: true,
      }
    );
    const next = setContentControlValue(
      checked,
      { tag: 'agree' },
      {
        kind: 'checkbox',
        checked: false,
      }
    );
    expect(findContentControl(next, { tag: 'agree' })!.text).toBe(String.fromCodePoint(0x2610));
    const c = next.package.document.content[0];
    if (c.type === 'blockSdt') expect(c.properties.rawPropertiesXml).toContain('w14:val="0"');
  });
});

describe('setContentControlValue — date', () => {
  const props: SdtProperties = {
    sdtType: 'date',
    tag: 'effective',
    rawPropertiesXml:
      '<w:sdtPr><w:tag w:val="effective"/><w:date w:fullDate="2020-01-01T00:00:00Z">' +
      '<w:dateFormat w:val="MMMM d, yyyy"/></w:date></w:sdtPr>',
  };

  test('sets fullDate and formats the display text', () => {
    const next = setContentControlValue(
      docWith(props),
      { tag: 'effective' },
      {
        kind: 'date',
        date: '2026-06-01',
      }
    );
    const c = next.package.document.content[0];
    expect(c.type).toBe('blockSdt');
    if (c.type === 'blockSdt') {
      expect(c.properties.rawPropertiesXml).toContain('w:fullDate="2026-06-01T00:00:00"');
    }
    expect(findContentControl(next, { tag: 'effective' })!.text).toBe('June 1, 2026');
  });

  test('rejects a malformed date', () => {
    expect(() =>
      setContentControlValue(
        docWith(props),
        { tag: 'effective' },
        {
          kind: 'date',
          date: 'not-a-date',
        }
      )
    ).toThrow(ContentControlValueError);
  });
});

describe('setContentControlValue — general', () => {
  test('throws when nothing matches', () => {
    const doc = docWith({ sdtType: 'checkbox', tag: 'a' });
    expect(() =>
      setContentControlValue(doc, { tag: 'zzz' }, { kind: 'checkbox', checked: true })
    ).toThrow(ContentControlNotFoundError);
  });
});

describe('setContentControlValue — fidelity', () => {
  test('checkbox glyph run carries the symbol font from w14:checkedState', () => {
    const props: SdtProperties = {
      sdtType: 'checkbox',
      tag: 'agree',
      rawPropertiesXml:
        '<w:sdtPr><w14:checkbox><w14:checked w14:val="0"/>' +
        '<w14:checkedState w14:val="2612" w14:font="MS Gothic"/>' +
        '<w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox></w:sdtPr>',
    };
    const next = setContentControlValue(
      docWith(props),
      { tag: 'agree' },
      {
        kind: 'checkbox',
        checked: true,
      }
    );
    const c = next.package.document.content[0];
    if (c.type === 'blockSdt') {
      const run = c.content[0].type === 'paragraph' ? c.content[0].content[0] : undefined;
      expect(run?.type).toBe('run');
      if (run?.type === 'run') expect(run.formatting?.fontFamily?.ascii).toBe('MS Gothic');
    }
  });

  test('clears the placeholder flag when setting a value', () => {
    const props: SdtProperties = {
      sdtType: 'dropDownList',
      tag: 's',
      showingPlaceholder: true,
      listItems: [{ displayText: 'A', value: '1' }],
      rawPropertiesXml: '<w:sdtPr><w:showingPlcHdr/><w:dropDownList w:lastValue=""/></w:sdtPr>',
    };
    const next = setContentControlValue(
      docWith(props),
      { tag: 's' },
      { kind: 'dropdown', value: '1' }
    );
    const c = next.package.document.content[0];
    if (c.type === 'blockSdt') {
      expect(c.properties.showingPlaceholder).toBe(false);
      expect(c.properties.rawPropertiesXml).not.toContain('showingPlcHdr');
    }
  });

  test('escapes special characters in a dropdown value (valid XML)', () => {
    const props: SdtProperties = {
      sdtType: 'dropDownList',
      tag: 's',
      listItems: [{ displayText: 'A & B', value: 'a&b' }],
      rawPropertiesXml: '<w:sdtPr><w:dropDownList w:lastValue="x"/></w:sdtPr>',
    };
    const next = setContentControlValue(
      docWith(props),
      { tag: 's' },
      { kind: 'dropdown', value: 'a&b' }
    );
    const c = next.package.document.content[0];
    if (c.type === 'blockSdt') {
      expect(c.properties.rawPropertiesXml).toContain('w:lastValue="a&amp;b"');
      expect(c.properties.rawPropertiesXml).not.toContain('w:lastValue="a&b"');
    }
  });
});

describe('formatSdtDate', () => {
  test('handles common patterns', () => {
    expect(formatSdtDate('2026-06-01', 'M/d/yyyy')).toBe('6/1/2026');
    expect(formatSdtDate('2026-06-01', 'MM/dd/yyyy')).toBe('06/01/2026');
    expect(formatSdtDate('2026-06-01', 'yyyy-MM-dd')).toBe('2026-06-01');
    expect(formatSdtDate('2026-06-01', 'MMM d, yyyy')).toBe('Jun 1, 2026');
    expect(formatSdtDate('2026-06-01')).toBe('6/1/2026'); // default
  });

  test('does not corrupt month names containing "M" (single-pass)', () => {
    expect(formatSdtDate('2026-03-05', 'MMMM d, yyyy')).toBe('March 5, 2026');
    expect(formatSdtDate('2026-05-09', 'MMMM d, yyyy')).toBe('May 9, 2026');
    expect(formatSdtDate('2026-03-05', 'MMM d')).toBe('Mar 5');
  });
});

describe('setContentControlValue — guards', () => {
  test('refuses a data-bound control unless forced', () => {
    const doc = docWith({
      sdtType: 'checkbox',
      tag: 'b',
      dataBinding: { xpath: '/x', storeItemID: '{X}' },
      rawPropertiesXml:
        '<w:sdtPr><w14:checkbox><w14:checked w14:val="0"/></w14:checkbox></w:sdtPr>',
    });
    expect(() =>
      setContentControlValue(doc, { tag: 'b' }, { kind: 'checkbox', checked: true })
    ).toThrow(ContentControlBoundError);
  });

  test('checkbox with no w14:checked state is rejected', () => {
    const doc = docWith({ sdtType: 'checkbox', tag: 'c', rawPropertiesXml: '<w:sdtPr/>' });
    expect(() =>
      setContentControlValue(doc, { tag: 'c' }, { kind: 'checkbox', checked: true })
    ).toThrow(ContentControlValueError);
  });
});

describe('setContentControlValue — full save → reparse round-trip', () => {
  async function load(): Promise<Document> {
    const buf = readFileSync(WIDGET_FIXTURE);
    return parseDocx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }

  test('dropdown, checkbox, and date values survive serialize→reparse', async () => {
    let doc = await load();
    doc = setContentControlValue(doc, { tag: 'status' }, { kind: 'dropdown', value: '2' });
    doc = setContentControlValue(doc, { tag: 'agree' }, { kind: 'checkbox', checked: true });
    doc = setContentControlValue(doc, { tag: 'effective' }, { kind: 'date', date: '2026-03-05' });

    const reparsed = await parseDocx(await createDocx(doc));
    expect(findContentControl(reparsed, { tag: 'status' })!.text).toBe('Final');
    expect(findContentControl(reparsed, { tag: 'agree' })!.text).toBe(String.fromCodePoint(0x2612));
    expect(findContentControl(reparsed, { tag: 'agree' })!.checked).toBe(true);
    expect(findContentControl(reparsed, { tag: 'effective' })!.text).toBe('March 5, 2026');
  });
});

// ---------------------------------------------------------------------------
// Inline typed controls. Before this work `setContentControlValue` called the
// block-only `applyToFirst`, so it threw ContentControlNotFoundError for every
// inline typed control (incl. those inside table cells). These tests pin the
// fix: it now resolves inline controls and sets BOTH the visible content and
// the structured raw state (w:date/@w:fullDate, dropdown w:lastValue,
// w14:checked), surviving a save/reload round-trip.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const mkInlineSdt = (props: SdtProperties, text = ''): any => ({
  type: 'inlineSdt',
  properties: props,
  content: text ? [{ type: 'run', content: [{ type: 'text', text }] }] : [],
});
const mkPara = (...content: any[]): any => ({ type: 'paragraph', content });
const mkBodyDoc = (content: any[]): Document =>
  ({ package: { document: { content } } }) as unknown as Document;
const cellDoc = (sdt: any): Document =>
  mkBodyDoc([
    {
      type: 'table',
      rows: [
        {
          type: 'tableRow',
          cells: [
            {
              type: 'tableCell',
              content: [mkPara({ type: 'run', content: [{ type: 'text', text: 'Label' }] })],
            },
            { type: 'tableCell', content: [mkPara(sdt)] },
          ],
        },
      ],
    },
  ]);
const inlineProps = (sdt: any) => sdt.properties as SdtProperties;
/** The inline SDT node in the second cell of a {@link cellDoc} result. */
const cellInlineSdt = (doc: Document): any =>
  (doc.package.document.content[0] as any).rows[0].cells[1].content[0].content[0];
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('setContentControlValue — inline controls', () => {
  test('previously threw NotFound for an inline control; now resolves it', () => {
    const doc = mkBodyDoc([
      mkPara(
        { type: 'run', content: [{ type: 'text', text: 'Status: ' }] },
        mkInlineSdt(
          {
            sdtType: 'dropDownList',
            tag: 'status',
            listItems: [
              { displayText: 'Draft', value: '1' },
              { displayText: 'Final', value: '2' },
            ],
            rawPropertiesXml:
              '<w:sdtPr><w:tag w:val="status"/><w:dropDownList w:lastValue="1"/></w:sdtPr>',
          },
          'Draft'
        )
      ),
    ]);
    // The fix: this no longer throws ContentControlNotFoundError.
    const next = setContentControlValue(doc, { tag: 'status' }, { kind: 'dropdown', value: '2' });
    expect(findContentControl(next, { tag: 'status' })!.text).toBe('Final');
  });

  test('inline dropdown in a table cell: sets display text AND patches lastValue', () => {
    const sdt = mkInlineSdt(
      {
        sdtType: 'dropDownList',
        tag: 'jurisdiction',
        listItems: [
          { displayText: 'England & Wales', value: 'ew' },
          { displayText: 'Scotland', value: 'sc' },
        ],
        rawPropertiesXml:
          '<w:sdtPr><w:tag w:val="jurisdiction"/><w:dropDownList w:lastValue="ew">' +
          '<w:listItem w:displayText="England &amp; Wales" w:value="ew"/>' +
          '<w:listItem w:displayText="Scotland" w:value="sc"/></w:dropDownList></w:sdtPr>',
      },
      'England & Wales'
    );
    const next = setContentControlValue(
      cellDoc(sdt),
      { tag: 'jurisdiction' },
      {
        kind: 'dropdown',
        value: 'sc',
      }
    );
    const ctrl = findContentControl(next, { tag: 'jurisdiction' })!;
    expect(ctrl.kind).toBe('inline');
    expect(ctrl.text).toBe('Scotland');
    // structured state patched on the inline control's raw props
    const node = cellInlineSdt(next);
    expect(inlineProps(node).rawPropertiesXml).toContain('w:lastValue="sc"');
    // the inline control holds a single run (not a paragraph)
    expect(node.content[0].type).toBe('run');
  });

  test('inline date in a table cell: sets w:fullDate AND formats the display text', () => {
    const sdt = mkInlineSdt({
      sdtType: 'date',
      tag: 'effective',
      dateFormat: 'MMMM d, yyyy',
      rawPropertiesXml:
        '<w:sdtPr><w:tag w:val="effective"/><w:date><w:dateFormat w:val="MMMM d, yyyy"/></w:date></w:sdtPr>',
    });
    const next = setContentControlValue(
      cellDoc(sdt),
      { tag: 'effective' },
      {
        kind: 'date',
        date: '2026-06-01',
      }
    );
    const ctrl = findContentControl(next, { tag: 'effective' })!;
    expect(ctrl.kind).toBe('inline');
    expect(ctrl.text).toBe('June 1, 2026');
    expect(inlineProps(cellInlineSdt(next)).rawPropertiesXml).toContain(
      'w:fullDate="2026-06-01T00:00:00"'
    );
  });

  test('inline checkbox in a table cell: sets the glyph AND w14:checked', () => {
    const sdt = mkInlineSdt({
      sdtType: 'checkbox',
      tag: 'agree',
      checked: false,
      rawPropertiesXml:
        '<w:sdtPr><w:tag w:val="agree"/><w14:checkbox><w14:checked w14:val="0"/>' +
        '<w14:checkedState w14:val="2612" w14:font="MS Gothic"/>' +
        '<w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox></w:sdtPr>',
    });
    const next = setContentControlValue(
      cellDoc(sdt),
      { tag: 'agree' },
      {
        kind: 'checkbox',
        checked: true,
      }
    );
    const ctrl = findContentControl(next, { tag: 'agree' })!;
    expect(ctrl.kind).toBe('inline');
    expect(ctrl.checked).toBe(true);
    expect(ctrl.text).toBe(String.fromCodePoint(0x2612));
    const node = cellInlineSdt(next);
    expect(inlineProps(node).rawPropertiesXml).toContain('w14:checked w14:val="1"');
    // glyph run carries the symbol font from w14:checkedState
    expect(node.content[0].formatting?.fontFamily?.ascii).toBe('MS Gothic');
  });

  test('preserves the lock and data-bound guards on inline controls', () => {
    const locked = cellDoc(
      mkInlineSdt({
        sdtType: 'date',
        tag: 'd',
        lock: 'sdtContentLocked',
        rawPropertiesXml: '<w:sdtPr><w:date><w:dateFormat w:val="M/d/yyyy"/></w:date></w:sdtPr>',
      })
    );
    expect(() =>
      setContentControlValue(locked, { tag: 'd' }, { kind: 'date', date: '2026-06-01' })
    ).toThrow(ContentControlLockedError);

    const bound = cellDoc(
      mkInlineSdt({
        sdtType: 'checkbox',
        tag: 'b',
        dataBinding: { xpath: '/x', storeItemID: '{X}' },
        rawPropertiesXml:
          '<w:sdtPr><w14:checkbox><w14:checked w14:val="0"/></w14:checkbox></w:sdtPr>',
      })
    );
    expect(() =>
      setContentControlValue(bound, { tag: 'b' }, { kind: 'checkbox', checked: true })
    ).toThrow(ContentControlBoundError);
  });

  test('includeHeadersFooters reaches an inline typed control in a header', () => {
    const doc = {
      package: {
        document: { content: [mkPara({ type: 'run', content: [{ type: 'text', text: 'body' }] })] },
        headers: new Map([
          [
            'rId7',
            {
              type: 'header',
              content: [
                mkPara(
                  mkInlineSdt({
                    sdtType: 'dropDownList',
                    tag: 'hdr-choice',
                    listItems: [{ displayText: 'X', value: 'x' }],
                    rawPropertiesXml: '<w:sdtPr><w:dropDownList w:lastValue=""/></w:sdtPr>',
                  })
                ),
              ],
            },
          ],
        ]),
      },
    } as unknown as Document;

    // body scope cannot see the header control
    expect(() =>
      setContentControlValue(doc, { tag: 'hdr-choice' }, { kind: 'dropdown', value: 'x' })
    ).toThrow(ContentControlNotFoundError);

    const next = setContentControlValue(
      doc,
      { tag: 'hdr-choice' },
      { kind: 'dropdown', value: 'x' },
      { includeHeadersFooters: true }
    );
    expect(
      findContentControl(next, { tag: 'hdr-choice' }, { includeHeadersFooters: true })!.text
    ).toBe('X');
  });

  test('inline typed values survive a full save → reparse round-trip', async () => {
    const doc = mkBodyDoc([
      mkPara(
        mkInlineSdt({
          sdtType: 'date',
          tag: 'eff',
          dateFormat: 'MMMM d, yyyy',
          rawPropertiesXml:
            '<w:sdtPr><w:tag w:val="eff"/><w:id w:val="5001"/>' +
            '<w:date><w:dateFormat w:val="MMMM d, yyyy"/></w:date></w:sdtPr>',
        })
      ),
      mkPara(
        mkInlineSdt(
          {
            sdtType: 'dropDownList',
            tag: 'sel',
            listItems: [
              { displayText: 'Goods', value: 'g' },
              { displayText: 'Services', value: 's' },
            ],
            rawPropertiesXml:
              '<w:sdtPr><w:tag w:val="sel"/><w:id w:val="5002"/><w:dropDownList w:lastValue="g">' +
              '<w:listItem w:displayText="Goods" w:value="g"/>' +
              '<w:listItem w:displayText="Services" w:value="s"/></w:dropDownList></w:sdtPr>',
          },
          'Goods'
        )
      ),
    ]);

    let next = setContentControlValue(doc, { tag: 'eff' }, { kind: 'date', date: '2026-06-01' });
    next = setContentControlValue(next, { tag: 'sel' }, { kind: 'dropdown', value: 's' });

    const reparsed = await parseDocx(await createDocx(next));
    const eff = findContentControl(reparsed, { tag: 'eff' })!;
    const sel = findContentControl(reparsed, { tag: 'sel' })!;
    expect(eff.kind).toBe('inline');
    expect(eff.text).toBe('June 1, 2026');
    expect(sel.kind).toBe('inline');
    expect(sel.text).toBe('Services');
  });
});

describe('setContentControlValue — { all: true }', () => {
  // Two checkboxes sharing one tag — e.g. an "agree" box repeated on two pages.
  const twoCheckboxes = (): Document => {
    const checkbox = (): SdtProperties => ({
      sdtType: 'checkbox',
      tag: 'agree',
      checked: false,
      rawPropertiesXml:
        '<w:sdtPr><w:tag w:val="agree"/>' +
        '<w14:checkbox><w14:checked w14:val="0"/>' +
        '<w14:checkedState w14:val="2612" w14:font="MS Gothic"/>' +
        '<w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox></w:sdtPr>',
    });
    return {
      package: {
        document: {
          content: [
            {
              type: 'blockSdt',
              properties: checkbox(),
              content: [{ type: 'paragraph', content: [] }],
            },
            {
              type: 'blockSdt',
              properties: checkbox(),
              content: [{ type: 'paragraph', content: [] }],
            },
          ],
        },
      },
    } as unknown as Document;
  };

  test('default sets only the first; { all } checks every matching control', () => {
    const first = setContentControlValue(
      twoCheckboxes(),
      { tag: 'agree' },
      {
        kind: 'checkbox',
        checked: true,
      }
    );
    expect(
      first.package.document.content.map((c) =>
        c.type === 'blockSdt' ? c.properties.checked : null
      )
    ).toEqual([true, false]);

    const all = setContentControlValue(
      twoCheckboxes(),
      { tag: 'agree' },
      { kind: 'checkbox', checked: true },
      { all: true }
    );
    expect(
      all.package.document.content.map((c) => (c.type === 'blockSdt' ? c.properties.checked : null))
    ).toEqual([true, true]);
  });
});
