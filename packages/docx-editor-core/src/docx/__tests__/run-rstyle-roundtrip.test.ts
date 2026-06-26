/**
 * Run character-style references (`w:rStyle`) must survive the PM save round-trip.
 *
 * The parser reads `<w:rStyle>` into `run.formatting.styleId` and the headless
 * serializer re-emits it, but the PM path used to *resolve* the style into
 * direct marks and drop the reference itself (no PM mark carried it). A run
 * whose formatting comes from a character style kept its appearance but lost the
 * named link on save. The `runStyle` mark now carries it through
 * toProseDoc -> fromProseDoc -> serializeDocument.
 */
import { describe, test, expect } from 'bun:test';
import { toProseDoc, fromProseDoc } from '../../prosemirror/conversion';
import { serializeDocument } from '../serializer/documentSerializer';
import type { Document, Run, Paragraph } from '../../types/document';

function run(text: string, styleId?: string, extra?: Run['formatting']): Run {
  return {
    type: 'run',
    formatting: { ...(styleId ? { styleId } : {}), ...(extra || {}) },
    content: [{ type: 'text', text }],
  };
}

function findRun(doc: Document, needle: string): Run | undefined {
  for (const block of doc.package.document.content ?? []) {
    if (block.type !== 'paragraph') continue;
    for (const child of block.content) {
      if (child.type !== 'run') continue;
      const t = child.content
        .filter((c): c is Extract<typeof c, { type: 'text' }> => c.type === 'text')
        .map((c) => c.text)
        .join('');
      if (t === needle) return child;
    }
  }
  return undefined;
}

describe('run rStyle survives the PM round-trip', () => {
  test('styleId is preserved on the rebuilt run', () => {
    const para: Paragraph = {
      type: 'paragraph',
      content: [run('strong text', 'Strong'), run(' plain '), run('emph', 'Emphasis')],
    };
    const doc: Document = { package: { document: { content: [para] } } };

    const rebuilt = fromProseDoc(toProseDoc(doc), doc);
    expect(findRun(rebuilt, 'strong text')?.formatting?.styleId).toBe('Strong');
    expect(findRun(rebuilt, 'emph')?.formatting?.styleId).toBe('Emphasis');
    // A run with no character style must not gain one.
    expect(findRun(rebuilt, ' plain ')?.formatting?.styleId).toBeUndefined();
  });

  test('serialized document.xml emits <w:rStyle> for the styled runs only', () => {
    const para: Paragraph = {
      type: 'paragraph',
      content: [run('A', 'Strong'), run('B'), run('C', 'Emphasis')],
    };
    const doc: Document = { package: { document: { content: [para] } } };

    const xml = serializeDocument(fromProseDoc(toProseDoc(doc), doc));
    expect((xml.match(/<w:rStyle w:val="Strong"\/>/g) ?? []).length).toBe(1);
    expect((xml.match(/<w:rStyle w:val="Emphasis"\/>/g) ?? []).length).toBe(1);
    expect((xml.match(/<w:rStyle /g) ?? []).length).toBe(2);
  });

  test('direct formatting alongside a style ref is kept too', () => {
    const para: Paragraph = {
      type: 'paragraph',
      content: [run('both', 'Strong', { italic: true })],
    };
    const doc: Document = { package: { document: { content: [para] } } };

    const rebuilt = fromProseDoc(toProseDoc(doc), doc);
    const r = findRun(rebuilt, 'both');
    expect(r?.formatting?.styleId).toBe('Strong');
    expect(r?.formatting?.italic).toBe(true);
  });
});
