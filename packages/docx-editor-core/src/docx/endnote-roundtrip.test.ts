import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { parseDocx } from './parser';
import { repackDocx } from './rezip';
import type { Paragraph } from '../types/document';

const FIXTURE = path.resolve(__dirname, '../../../../e2e/fixtures/endnotes-tracked-changes.docx');

function loadFixture(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE));
}

async function endnotesXmlOf(buf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/endnotes.xml')!.async('text');
}

function endnoteText(note: { content: unknown[] }): string {
  const para = note.content.find((b) => (b as Paragraph).type === 'paragraph') as Paragraph;
  return para.content
    .flatMap((item) => {
      if (item.type === 'run') return item.content;
      if (item.type === 'insertion' || item.type === 'deletion') {
        return item.content.flatMap((r) => (r.type === 'run' ? r.content : []));
      }
      return [];
    })
    .filter((c): c is { type: 'text'; text: string } => (c as { type: string }).type === 'text')
    .map((c) => c.text)
    .join('');
}

describe('endnote round-trip (fixture)', () => {
  test('parses normal endnotes and separators separately', async () => {
    const doc = await parseDocx(loadFixture(), { preloadFonts: false });
    expect(doc.package.endnotes?.length).toBe(2);
    expect(doc.package.endnoteSeparators?.length).toBe(2);
    const sepTypes = doc.package.endnoteSeparators!.map((s) => s.noteType).sort();
    expect(sepTypes).toEqual(['continuationSeparator', 'separator']);
  });

  test('an edit to an endnote body persists through repack and reparse', async () => {
    const doc = await parseDocx(loadFixture(), { preloadFonts: false });
    const target = doc.package.endnotes!.find((e) => e.id === 1)!;
    const para = target.content.find((b) => b.type === 'paragraph') as Paragraph;
    para.content.push({
      type: 'run',
      content: [{ type: 'text', text: ' EDITED', preserveSpace: true }],
    });

    const out = new Uint8Array(await repackDocx(doc));
    const xml = await endnotesXmlOf(out);
    expect(xml).toContain('EDITED');

    const reparsed = await parseDocx(out, { preloadFonts: false });
    expect(reparsed.package.endnotes?.length).toBe(2);
    expect(reparsed.package.endnoteSeparators?.length).toBe(2);
    const reEdited = reparsed.package.endnotes!.find((e) => e.id === 1)!;
    expect(endnoteText(reEdited)).toContain('EDITED');
  });

  test('a tracked insertion inside an endnote survives repack', async () => {
    const doc = await parseDocx(loadFixture(), { preloadFonts: false });
    const out = new Uint8Array(await repackDocx(doc));
    const xml = await endnotesXmlOf(out);
    expect(xml).toContain('<w:ins');
    expect(xml).toContain('w:author="Reviewer"');
    expect(xml).toContain('tracked insertion');

    // And the endnoteRef auto-number mark is preserved, not dropped.
    expect(xml).toContain('<w:endnoteRef/>');
  });

  test('the body endnote references are unchanged by a note-only edit', async () => {
    const doc = await parseDocx(loadFixture(), { preloadFonts: false });
    const out = new Uint8Array(await repackDocx(doc));
    const zip = await JSZip.loadAsync(out);
    const bodyXml = await zip.file('word/document.xml')!.async('text');
    expect((bodyXml.match(/<w:endnoteReference/g) ?? []).length).toBe(2);
  });
});
