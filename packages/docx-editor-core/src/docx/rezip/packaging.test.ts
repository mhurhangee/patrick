import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import type { Document, Footnote, Endnote } from '../../types/document';
import { serializeFootnotesToZip, serializeEndnotesToZip } from './packaging';

function makeDoc(overrides: Partial<Document['package']> = {}): Document {
  return {
    package: {
      document: { content: [] },
      ...overrides,
    },
  };
}

const SEPARATOR_ENDNOTE: Endnote = {
  type: 'endnote',
  id: -1,
  noteType: 'separator',
  content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'separator' }] }] }],
};

const NORMAL_ENDNOTE: Endnote = {
  type: 'endnote',
  id: 1,
  noteType: 'normal',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'run', content: [{ type: 'endnoteRefMark' }] },
        { type: 'run', content: [{ type: 'text', text: ' Edited endnote body.' }] },
      ],
    },
  ],
};

const SEPARATOR_FOOTNOTE: Footnote = {
  type: 'footnote',
  id: -1,
  noteType: 'separator',
  content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'separator' }] }] }],
};

const NORMAL_FOOTNOTE: Footnote = {
  type: 'footnote',
  id: 1,
  noteType: 'normal',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'run', content: [{ type: 'text', text: 'A footnote.' }] }],
    },
  ],
};

async function entryText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  return f ? await f.async('text') : null;
}

describe('serializeEndnotesToZip', () => {
  test('writes word/endnotes.xml with separators ahead of normal notes', async () => {
    const zip = new JSZip();
    const doc = makeDoc({ endnotes: [NORMAL_ENDNOTE], endnoteSeparators: [SEPARATOR_ENDNOTE] });
    serializeEndnotesToZip(doc, zip, 6);

    const xml = await entryText(zip, 'word/endnotes.xml');
    expect(xml).not.toBeNull();
    expect(xml!).toContain('Edited endnote body.');
    expect(xml!).toContain('<w:separator/>');
    // Separator note (id=-1) must precede the normal note (id=1)
    expect(xml!.indexOf('w:id="-1"')).toBeLessThan(xml!.indexOf('w:id="1"'));
  });

  test('does not write the part when the document has no endnotes', async () => {
    const zip = new JSZip();
    serializeEndnotesToZip(makeDoc(), zip, 6);
    expect(zip.file('word/endnotes.xml')).toBeNull();
  });
});

describe('serializeFootnotesToZip', () => {
  test('writes word/footnotes.xml with separators ahead of normal notes', async () => {
    const zip = new JSZip();
    const doc = makeDoc({ footnotes: [NORMAL_FOOTNOTE], footnoteSeparators: [SEPARATOR_FOOTNOTE] });
    serializeFootnotesToZip(doc, zip, 6);

    const xml = await entryText(zip, 'word/footnotes.xml');
    expect(xml).not.toBeNull();
    expect(xml!).toContain('A footnote.');
    expect(xml!).toContain('<w:separator/>');
    expect(xml!.indexOf('w:id="-1"')).toBeLessThan(xml!.indexOf('w:id="1"'));
  });

  test('does not write the part when the document has no footnotes', async () => {
    const zip = new JSZip();
    serializeFootnotesToZip(makeDoc(), zip, 6);
    expect(zip.file('word/footnotes.xml')).toBeNull();
  });
});
