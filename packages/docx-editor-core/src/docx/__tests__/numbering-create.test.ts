import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { createEmptyDocument } from '../../utils/createDocument';
import { schema } from '../../prosemirror/schema';
import { collectNumberingFromPM } from '../../prosemirror/conversion/fromProseDoc/numbering';
import { serializeNumberingXml } from '../serializer/numberingSerializer';
import { parseNumbering } from '../numberingParser';
import { createDocx } from '../rezip';
import type { NumberingDefinitions } from '../../types/document';

function textRun(text: string) {
  return { type: 'run' as const, content: [{ type: 'text' as const, text }] };
}

async function unzip(buffer: ArrayBuffer): Promise<{
  numbering: string | null;
  contentTypes: string | null;
  rels: string | null;
  documentXml: string | null;
}> {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (p: string): Promise<string | null> => {
    const f = zip.file(p);
    return f ? await f.async('text') : null;
  };
  return {
    numbering: await read('word/numbering.xml'),
    contentTypes: await read('[Content_Types].xml'),
    rels: await read('word/_rels/document.xml.rels'),
    documentXml: await read('word/document.xml'),
  };
}

const DECIMAL_NUMBERING: NumberingDefinitions = {
  abstractNums: [
    {
      abstractNumId: 0,
      levels: [{ ilvl: 0, start: 1, numFmt: 'decimal', lvlText: '%1.', lvlJc: 'left' }],
    },
  ],
  nums: [{ numId: 2, abstractNumId: 0 }],
};

describe('numbering.xml generation on createDocx', () => {
  test('serializeNumberingXml round-trips through parseNumbering', () => {
    const xml = serializeNumberingXml(DECIMAL_NUMBERING);
    const parsed = parseNumbering(xml);

    expect(parsed.hasNumbering(2)).toBe(true);
    expect(parsed.getInstance(2)?.abstractNumId).toBe(0);
    const level = parsed.getLevel(2, 0);
    expect(level?.numFmt).toBe('decimal');
    expect(level?.lvlText).toBe('%1.');
  });

  test('collectNumberingFromPM rebuilds definitions from PM list attrs', () => {
    const numbered = schema.nodes.paragraph.create(
      { numPr: { numId: 3, ilvl: 0 }, listNumFmt: 'decimal', listIsBullet: false },
      schema.text('Numbered item')
    );
    const bulleted = schema.nodes.paragraph.create(
      { numPr: { numId: 4, ilvl: 0 }, listIsBullet: true, listMarker: '•' },
      schema.text('Bulleted item')
    );
    const pmDoc = schema.nodes.doc.create(null, [numbered, bulleted]);

    const defs = collectNumberingFromPM(pmDoc);
    expect(defs).toBeDefined();
    expect(defs!.nums.map((n) => n.numId).sort()).toEqual([3, 4]);

    const numberedAbstract = defs!.abstractNums.find(
      (a) => a.abstractNumId === defs!.nums.find((n) => n.numId === 3)!.abstractNumId
    );
    expect(numberedAbstract?.levels[0]?.numFmt).toBe('decimal');

    const bulletAbstract = defs!.abstractNums.find(
      (a) => a.abstractNumId === defs!.nums.find((n) => n.numId === 4)!.abstractNumId
    );
    expect(bulletAbstract?.levels[0]?.numFmt).toBe('bullet');
    expect(bulletAbstract?.levels[0]?.lvlText).toBe('•');
  });

  test('collectNumberingFromPM returns undefined for a document with no lists', () => {
    const pmDoc = schema.nodes.doc.create(
      null,
      schema.nodes.paragraph.create(null, schema.text('Plain'))
    );
    expect(collectNumberingFromPM(pmDoc)).toBeUndefined();
  });

  test('serializeNumberingXml emits w:suff before w:lvlText (ECMA-376 CT_Lvl order)', () => {
    const xml = serializeNumberingXml({
      abstractNums: [
        {
          abstractNumId: 0,
          levels: [
            {
              ilvl: 0,
              start: 1,
              numFmt: 'decimal',
              lvlText: '%1.',
              suffix: 'space',
              lvlJc: 'left',
            },
          ],
        },
      ],
      nums: [{ numId: 1, abstractNumId: 0 }],
    });

    const suff = xml.indexOf('<w:suff');
    const lvlText = xml.indexOf('<w:lvlText');
    const lvlJc = xml.indexOf('<w:lvlJc');
    expect(suff).toBeGreaterThan(-1);
    expect(suff).toBeLessThan(lvlText);
    expect(lvlText).toBeLessThan(lvlJc);
  });

  test('collectNumberingFromPM applies startOverride to the level it was set on', () => {
    const nested = schema.nodes.paragraph.create(
      { numPr: { numId: 5, ilvl: 1 }, listNumFmt: 'decimal', listStartOverride: 3 },
      schema.text('Nested item with a custom start')
    );
    const pmDoc = schema.nodes.doc.create(null, nested);

    const defs = collectNumberingFromPM(pmDoc);
    const num = defs!.nums.find((n) => n.numId === 5);
    expect(num?.levelOverrides).toEqual([{ ilvl: 1, startOverride: 3 }]);
  });

  test('createDocx synthesizes numbering.xml and registers it for documents with lists', async () => {
    const doc = createEmptyDocument();
    doc.package.document.content = [
      {
        type: 'paragraph',
        formatting: { numPr: { numId: 2, ilvl: 0 } },
        content: [textRun('First')],
      },
      {
        type: 'paragraph',
        formatting: { numPr: { numId: 2, ilvl: 0 } },
        content: [textRun('Second')],
      },
    ];
    doc.package.numbering = DECIMAL_NUMBERING;

    const { numbering, contentTypes, rels, documentXml } = await unzip(await createDocx(doc));

    // The body references the numId...
    expect(documentXml).toContain('<w:numId w:val="2"/>');
    // ...and numbering.xml now defines it, so Word can resolve the marker.
    expect(numbering).not.toBeNull();
    expect(parseNumbering(numbering!).hasNumbering(2)).toBe(true);
    // The part is registered in content types + document relationships.
    expect(contentTypes).toContain('PartName="/word/numbering.xml"');
    expect(contentTypes).toContain('wordprocessingml.numbering+xml');
    expect(rels).toContain('Target="numbering.xml"');
    expect(rels).toContain('/relationships/numbering');
  });

  test('createDocx does not add numbering.xml when the document has no lists', async () => {
    const doc = createEmptyDocument();
    doc.package.document.content = [{ type: 'paragraph', content: [textRun('Plain text')] }];

    const { numbering, contentTypes } = await unzip(await createDocx(doc));

    expect(numbering).toBeNull();
    expect(contentTypes).not.toContain('/word/numbering.xml');
  });
});
