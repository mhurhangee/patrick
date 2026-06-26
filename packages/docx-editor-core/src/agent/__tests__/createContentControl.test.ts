/**
 * createContentControl — wrap a text span in a new content control.
 *
 * It splits runs at the span boundaries, preserves formatting, includes interior
 * fields/tabs wholesale, and errors on overlap / a boundary inside a non-run item.
 */

import { describe, expect, test } from 'bun:test';

import { createContentControl, ContentControlCreateError } from '../createContentControl';
import { findContentControl, findContentControls } from '../contentControls';
import { setContentControlValue } from '../contentControlValues';
import { getParagraphText } from '../text-utils';
import { parseDocx } from '../../docx/parser';
import { createDocx } from '../../docx/rezip';
import type { Document } from '../../types/document';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mkRun = (text: string, formatting?: Record<string, unknown>): any => ({
  type: 'run',
  content: [{ type: 'text', text }],
  ...(formatting ? { formatting } : {}),
});
const mkPara = (paraId: string | undefined, ...content: any[]): any => ({
  type: 'paragraph',
  ...(paraId ? { paraId } : {}),
  content,
});
const mkBodyDoc = (content: any[]): Document =>
  ({ package: { document: { content } } }) as unknown as Document;
const bodyBlocks = (doc: Document): any[] => doc.package.document.content as any[];
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('createContentControl — inline text wrap', () => {
  test('wraps a single-run span located by paraId, returns the control info', () => {
    const doc = mkBodyDoc([mkPara('P1', mkRun('Dear '), mkRun('CLIENT'), mkRun(' party'))]);
    const { doc: next, control } = createContentControl(
      doc,
      { paraId: 'P1', text: 'CLIENT' },
      { tag: 'client', alias: 'Client' }
    );

    expect(control.kind).toBe('inline');
    expect(control.tag).toBe('client');
    expect(control.alias).toBe('Client');
    expect(control.id).toBeGreaterThan(0);
    expect(control.text).toBe('CLIENT');
    // resolvable by tag immediately
    expect(findContentControl(next, { tag: 'client' })!.text).toBe('CLIENT');

    // paragraph is now: run "Dear " | sdt(CLIENT) | run " party"
    const para = bodyBlocks(next)[0];
    expect(para.content.map((n: { type: string }) => n.type)).toEqual(['run', 'inlineSdt', 'run']);
    expect(para.content[0].content[0].text).toBe('Dear ');
    expect(para.content[2].content[0].text).toBe(' party');
  });

  test('wraps a span crossing run boundaries, preserving run formatting', () => {
    const doc = mkBodyDoc([
      mkPara(
        'P',
        mkRun('Hello ', { bold: true }),
        mkRun('brave '),
        mkRun('new world', { italic: true })
      ),
    ]);
    const { doc: next } = createContentControl(
      doc,
      { paraId: 'P', text: 'brave new' },
      { tag: 'span' }
    );
    expect(findContentControl(next, { tag: 'span' })!.text).toBe('brave new');

    const para = bodyBlocks(next)[0];
    // Hello (bold, before) | sdt[ "brave ", "new" ] | " world" (italic, after)
    expect(para.content[0].formatting).toEqual({ bold: true });
    const sdt = para.content.find((n: { type: string }) => n.type === 'inlineSdt');
    expect(sdt.content.map((r: { content: { text: string }[] }) => r.content[0].text)).toEqual([
      'brave ',
      'new',
    ]);
    // the split "new" run keeps its source formatting
    expect(sdt.content[1].formatting).toEqual({ italic: true });
    // trailing " world" run also keeps the italic
    const after = para.content[para.content.length - 1];
    expect(after.content[0].text).toBe(' world');
    expect(after.formatting).toEqual({ italic: true });
  });

  test('includes an interior field wholesale in the wrapped span', () => {
    const field = {
      type: 'simpleField',
      instruction: 'TITLE',
      content: [{ type: 'run', content: [{ type: 'text', text: 'X' }] }],
    };
    const doc = mkBodyDoc([
      mkPara('P', mkRun('Ref '), mkRun('AAA'), field, mkRun('BBB'), mkRun(' end')),
    ]);
    const { doc: next, control } = createContentControl(
      doc,
      { paraId: 'P', text: 'AAABBB' },
      { tag: 'f' }
    );
    // the control spans AAA + <field> + BBB; its text flattens the field result.
    expect(control.text).toBe('AAAXBBB');
    const sdt = bodyBlocks(next)[0].content.find((n: { type: string }) => n.type === 'inlineSdt');
    expect(sdt.content.map((n: { type: string }) => n.type)).toEqual(['run', 'simpleField', 'run']);
  });

  test('wraps a span inside a table cell, located by paraId', () => {
    const doc = mkBodyDoc([
      {
        type: 'table',
        rows: [
          {
            type: 'tableRow',
            cells: [
              { type: 'tableCell', content: [mkPara('L', mkRun('Amount: '), mkRun('[VALUE]'))] },
            ],
          },
        ],
      },
    ]);
    const { doc: next, control } = createContentControl(
      doc,
      { paraId: 'L', text: '[VALUE]' },
      { tag: 'amt', sdtType: 'plainText' }
    );
    expect(control.kind).toBe('inline');
    expect(findContentControl(next, { tag: 'amt' })!.text).toBe('[VALUE]');
  });

  test('selects the requested occurrence when the text repeats', () => {
    const doc = mkBodyDoc([mkPara('P', mkRun('x [Y] z [Y] w'))]);
    const { doc: next } = createContentControl(
      doc,
      { paraId: 'P', text: '[Y]', occurrence: 2 },
      { tag: 'y2' }
    );
    const para = bodyBlocks(next)[0];
    const sdtIndex = para.content.findIndex((n: { type: string }) => n.type === 'inlineSdt');
    // the run before the control contains the FIRST [Y]; the control is the 2nd.
    expect(para.content[sdtIndex - 1].content[0].text).toContain('[Y]');
    expect(findContentControl(next, { tag: 'y2' })!.text).toBe('[Y]');
  });

  test('is pure — the input document is not mutated', () => {
    const doc = mkBodyDoc([mkPara('P', mkRun('Dear CLIENT'))]);
    createContentControl(doc, { paraId: 'P', text: 'CLIENT' }, { tag: 'c' });
    const para = bodyBlocks(doc)[0];
    expect(para.content).toHaveLength(1); // still a single run, no sdt spliced in
    expect(getParagraphText(para)).toBe('Dear CLIENT');
  });

  test('auto-assigns a unique w:id above any existing control', () => {
    const existing = {
      type: 'inlineSdt',
      properties: { sdtType: 'richText', tag: 'old', id: 100 },
      content: [mkRun('OLD')],
    };
    const doc = mkBodyDoc([mkPara('P', existing, mkRun(' and NEW'))]);
    const { control } = createContentControl(
      doc,
      { paraId: 'P', text: 'NEW' },
      {
        tag: 'new',
      }
    );
    expect(control.id).toBe(101);
  });
});

describe('createContentControl — errors', () => {
  const doc = () => mkBodyDoc([mkPara('P', mkRun('ab ab cd'))]);

  test('throws when the text is not found', () => {
    expect(() => createContentControl(doc(), { paraId: 'P', text: 'ZZZ' }, {})).toThrow(
      ContentControlCreateError
    );
  });

  test('throws when the requested occurrence does not exist', () => {
    expect(() =>
      createContentControl(doc(), { paraId: 'P', text: 'ab', occurrence: 3 }, {})
    ).toThrow(ContentControlCreateError);
  });

  test('throws when the paraId is not found', () => {
    expect(() => createContentControl(doc(), { paraId: 'NOPE', text: 'ab' }, {})).toThrow(
      ContentControlCreateError
    );
  });

  test('rejects an sdtType that cannot be synthesized (would lose its type on round-trip)', () => {
    expect(() =>
      createContentControl(doc(), { paraId: 'P', text: 'ab' }, { sdtType: 'group' })
    ).toThrow(ContentControlCreateError);
  });

  test('throws when the span overlaps an existing inline control', () => {
    const existing = {
      type: 'inlineSdt',
      properties: { sdtType: 'richText', tag: 'x', id: 1 },
      content: [mkRun('MID')],
    };
    // getParagraphText ignores the control's own text → "Hello  world" (two spaces).
    const d = mkBodyDoc([mkPara('P', mkRun('Hello '), existing, mkRun(' world'))]);
    expect(() =>
      createContentControl(d, { paraId: 'P', text: 'Hello  world' }, { tag: 'over' })
    ).toThrow(ContentControlCreateError);
  });

  test('throws when a boundary falls inside a hyperlink', () => {
    const link = { type: 'hyperlink', href: 'https://x', children: [mkRun('LINK')] };
    const d = mkBodyDoc([mkPara('P', mkRun('see '), link, mkRun(' here'))]);
    expect(() => createContentControl(d, { paraId: 'P', text: 'LIN' }, { tag: 'b' })).toThrow(
      ContentControlCreateError
    );
  });

  test('throws when the span encloses content that cannot live inside an inline control', () => {
    // A bookmark cannot sit inside an inline SDT; a span that swallows one is rejected.
    const bookmark = { type: 'bookmarkStart', id: 1, name: 'bm' };
    const d = mkBodyDoc([mkPara('P', mkRun('a '), mkRun('XY'), bookmark, mkRun('Z'), mkRun(' b'))]);
    expect(() => createContentControl(d, { paraId: 'P', text: 'XYZ' }, { tag: 'bm' })).toThrow(
      ContentControlCreateError
    );
  });

  test('rejects a caller-supplied id that collides with an existing control', () => {
    const existing = {
      type: 'inlineSdt',
      properties: { sdtType: 'richText', tag: 'old', id: 7 },
      content: [mkRun('OLD')],
    };
    const d = mkBodyDoc([mkPara('P', existing, mkRun(' NEW'))]);
    expect(() =>
      createContentControl(d, { paraId: 'P', text: 'NEW' }, { tag: 'n', id: 7 })
    ).toThrow(ContentControlCreateError);
  });
});

describe('createContentControl — sdtPr synthesis + round-trip', () => {
  test('a date control writes its format to <w:dateFormat>, not @w:fullDate', () => {
    const doc = mkBodyDoc([mkPara('P', mkRun('Date: '), mkRun('[DATE]'))]);
    const { doc: created } = createContentControl(
      doc,
      { paraId: 'P', text: '[DATE]' },
      { tag: 'eff', sdtType: 'date', dateFormat: 'MMMM d, yyyy' }
    );
    const sdt = bodyBlocks(created)[0].content.find(
      (n: { type: string }) => n.type === 'inlineSdt'
    );
    const raw: string = sdt.properties.rawPropertiesXml;
    expect(raw).toContain('<w:date><w:dateFormat w:val="MMMM d, yyyy"/></w:date>');
    expect(raw).not.toContain('w:fullDate');
    expect(raw).toContain('<w:id w:val=');
  });

  test('a created checkbox synthesizes glyph states and fills with the symbol font', async () => {
    const doc = mkBodyDoc([mkPara('P', mkRun('Agree: '), mkRun('[ ]'))]);
    const { doc: created } = createContentControl(
      doc,
      { paraId: 'P', text: '[ ]' },
      { tag: 'agree', sdtType: 'checkbox', checked: false }
    );
    const sdt = bodyBlocks(created)[0].content.find(
      (n: { type: string }) => n.type === 'inlineSdt'
    );
    const raw: string = sdt.properties.rawPropertiesXml;
    expect(raw).toContain('<w14:checked w14:val="0"/>');
    expect(raw).toContain('<w14:checkedState w14:val="2612" w14:font="MS Gothic"/>');
    expect(raw).toContain('<w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/>');

    // The value setter reads the synthesized states for the glyph + symbol font.
    const filled = setContentControlValue(
      created,
      { tag: 'agree' },
      { kind: 'checkbox', checked: true }
    );
    const fsdt = bodyBlocks(filled)[0].content.find(
      (n: { type: string }) => n.type === 'inlineSdt'
    );
    expect(fsdt.content[0].content[0].text).toBe('☒');
    expect(fsdt.content[0].formatting.fontFamily.ascii).toBe('MS Gothic');

    // still a checkbox after a save → reparse
    const reparsed = await parseDocx(await createDocx(filled));
    expect(findContentControl(reparsed, { tag: 'agree' })!.sdtType).toBe('checkbox');
  });

  test('created control round-trips and stays resolvable by tag', async () => {
    const doc = mkBodyDoc([mkPara('P', mkRun('Hello '), mkRun('NAME'), mkRun('!'))]);
    const { doc: created } = createContentControl(
      doc,
      { paraId: 'P', text: 'NAME' },
      { tag: 'who', alias: 'Who', sdtType: 'richText' }
    );
    const reparsed = await parseDocx(await createDocx(created));
    const info = findContentControl(reparsed, { tag: 'who' })!;
    expect(info).toBeDefined();
    expect(info.kind).toBe('inline');
    expect(info.alias).toBe('Who');
    expect(info.text).toBe('NAME');
    expect(findContentControls(reparsed)).toHaveLength(1);
  });

  test('a created date control can then be filled via setContentControlValue (round-trips)', async () => {
    const doc = mkBodyDoc([mkPara('P', mkRun('Effective: '), mkRun('[DATE]'))]);
    const { doc: created } = createContentControl(
      doc,
      { paraId: 'P', text: '[DATE]' },
      { tag: 'eff', sdtType: 'date', dateFormat: 'MMMM d, yyyy' }
    );
    // format survives the round trip (proves the date-bug fix end to end)
    const reparsed = await parseDocx(await createDocx(created));
    expect(findContentControl(reparsed, { tag: 'eff' })!.dateFormat).toBe('MMMM d, yyyy');

    // and the typed setter fills both visible text and structured state
    const filled = setContentControlValue(
      created,
      { tag: 'eff' },
      { kind: 'date', date: '2026-06-01' }
    );
    expect(findContentControl(filled, { tag: 'eff' })!.text).toBe('June 1, 2026');
    const reparsed2 = await parseDocx(await createDocx(filled));
    expect(findContentControl(reparsed2, { tag: 'eff' })!.text).toBe('June 1, 2026');
  });

  test('a created dropDownList can be filled via setContentControlValue', async () => {
    const doc = mkBodyDoc([mkPara('P', mkRun('Type: '), mkRun('[CHOICE]'))]);
    const { doc: created } = createContentControl(
      doc,
      { paraId: 'P', text: '[CHOICE]' },
      {
        tag: 'choice',
        sdtType: 'dropDownList',
        listItems: [
          { displayText: 'Goods', value: 'g' },
          { displayText: 'Services', value: 's' },
        ],
      }
    );
    const filled = setContentControlValue(
      created,
      { tag: 'choice' },
      {
        kind: 'dropdown',
        value: 's',
      }
    );
    expect(findContentControl(filled, { tag: 'choice' })!.text).toBe('Services');
    // the structured selection (w:lastValue) is populated too, not just the text
    const sdt = bodyBlocks(filled)[0].content.find((n: { type: string }) => n.type === 'inlineSdt');
    expect(sdt.properties.rawPropertiesXml).toContain('w:lastValue="s"');
    const reparsed = await parseDocx(await createDocx(filled));
    expect(findContentControl(reparsed, { tag: 'choice' })!.text).toBe('Services');
  });
});
