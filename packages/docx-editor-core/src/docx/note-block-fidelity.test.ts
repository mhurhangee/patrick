/**
 * Note body block-level fidelity (PR #646 F3 regression)
 *
 * When #646 made footnote/endnote bodies editable, the parse→model→reserialize
 * path dropped block-level constructs the old verbatim copy preserved:
 *   - block-level w:sdt
 *   - block-level bookmarks (w:bookmarkStart / w:bookmarkEnd)
 *   - w:customXml
 *
 * The fix gates the model rewrite: a note carrying an unmodeled child falls
 * back to a verbatim copy of its original XML, restoring pre-#646 fidelity
 * while keeping #646's editability for ordinary notes.
 *
 * Follow-up: note bodies now reuse the body block parser, so block-level
 * `w:sdt` is modeled (as `BlockSdt`) and no longer forces the verbatim gate —
 * only note-level bookmarks and `w:customXml` still do. The sdt-only test below
 * pins that: such a note is rebuilt from the model and stays editable.
 */

import { describe, test, expect } from 'bun:test';
import type { BlockSdt, Paragraph } from '../types/document';
import { parseEndnotes, parseFootnotes } from './footnoteParser';
import { serializeEndnotes, serializeFootnotes } from './serializer/noteSerializer';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/**
 * An endnote body that interleaves an ordinary paragraph with three
 * unmodeled block-level constructs: a bookmark pair, an sdt-wrapped
 * paragraph, and a customXml wrapper.
 */
function endnotesXmlWithUnmodeledBlocks(): string {
  return (
    `${XML_DECL}<w:endnotes ${NS}>` +
    `<w:endnote w:id="1">` +
    `<w:p><w:r><w:t>Plain text before.</w:t></w:r></w:p>` +
    `<w:bookmarkStart w:id="10" w:name="NoteBookmark"/>` +
    `<w:bookmarkEnd w:id="10"/>` +
    `<w:sdt><w:sdtPr><w:tag w:val="noteTag"/></w:sdtPr>` +
    `<w:sdtContent><w:p><w:r><w:t>Inside SDT.</w:t></w:r></w:p></w:sdtContent>` +
    `</w:sdt>` +
    `<w:customXml w:element="MyElement">` +
    `<w:p><w:r><w:t>Inside customXml.</w:t></w:r></w:p>` +
    `</w:customXml>` +
    `</w:endnote>` +
    `</w:endnotes>`
  );
}

function footnotesXmlWithUnmodeledBlocks(): string {
  return endnotesXmlWithUnmodeledBlocks()
    .replace(/w:endnotes/g, 'w:footnotes')
    .replace(/w:endnote /g, 'w:footnote ')
    .replace(/<\/w:endnote>/g, '</w:footnote>');
}

describe('note body block-level fidelity (#646 F3)', () => {
  test('endnote with bookmark + sdt + customXml round-trips losslessly', () => {
    const parsed = parseEndnotes(endnotesXmlWithUnmodeledBlocks());
    const note = parsed.getEndnote(1)!;
    expect(note).toBeDefined();

    const xml = serializeEndnotes([note]);

    // All three unmodeled constructs must survive the parse→serialize cycle.
    expect(xml).toContain('<w:bookmarkStart');
    expect(xml).toContain('w:name="NoteBookmark"');
    expect(xml).toContain('<w:bookmarkEnd');
    expect(xml).toContain('<w:sdt');
    expect(xml).toContain('w:val="noteTag"');
    expect(xml).toContain('Inside SDT.');
    expect(xml).toContain('<w:customXml');
    expect(xml).toContain('Inside customXml.');

    // And the ordinary paragraph survives too.
    expect(xml).toContain('Plain text before.');

    // Re-parse the serialized XML: the note is still recognized.
    const reparsed = parseEndnotes(xml);
    expect(reparsed.getEndnote(1)).toBeDefined();
  });

  test('footnote with bookmark + sdt + customXml round-trips losslessly', () => {
    const parsed = parseFootnotes(footnotesXmlWithUnmodeledBlocks());
    const note = parsed.getFootnote(1)!;
    expect(note).toBeDefined();

    const xml = serializeFootnotes([note]);

    expect(xml).toContain('<w:bookmarkStart');
    expect(xml).toContain('<w:bookmarkEnd');
    expect(xml).toContain('<w:sdt');
    expect(xml).toContain('Inside SDT.');
    expect(xml).toContain('<w:customXml');
    expect(xml).toContain('Inside customXml.');
  });

  test('an ordinary endnote (no unmodeled blocks) still serializes from the model', () => {
    const xml =
      `${XML_DECL}<w:endnotes ${NS}>` +
      `<w:endnote w:id="2"><w:p><w:r><w:t>Just text.</w:t></w:r></w:p></w:endnote>` +
      `</w:endnotes>`;
    const parsed = parseEndnotes(xml);
    const note = parsed.getEndnote(2)!;
    // No verbatim fallback should be engaged for a plain note.
    expect(note.verbatimXml).toBeUndefined();
    const out = serializeEndnotes([note]);
    expect(out).toContain('Just text.');
  });

  test('a bookmark-only endnote still verbatim-gates (edit does not persist)', () => {
    const xml =
      `${XML_DECL}<w:endnotes ${NS}>` +
      `<w:endnote w:id="4">` +
      `<w:p><w:r><w:t>Bookmarked note.</w:t></w:r></w:p>` +
      `<w:bookmarkStart w:id="20" w:name="OnlyBookmark"/>` +
      `<w:bookmarkEnd w:id="20"/>` +
      `</w:endnote>` +
      `</w:endnotes>`;
    const note = parseEndnotes(xml).getEndnote(4)!;

    // A note-level bookmark has no model carrier, so the note is frozen to its
    // original bytes — this is the boundary the follow-up deliberately keeps.
    expect(note.verbatimXml).toBeDefined();

    // Edits to a verbatim-gated note are discarded (known F3 limitation): the
    // bytes win, so the bookmark survives but the edit is lost.
    const para = note.content.find((b) => b.type === 'paragraph') as Paragraph | undefined;
    if (para) {
      const run = para.content.find((it) => it.type === 'run');
      const textItem =
        run && run.type === 'run' ? run.content.find((c) => c.type === 'text') : undefined;
      if (textItem) (textItem as { text: string }).text = 'Edited away.';
    }

    const out = serializeEndnotes([note]);
    expect(out).toContain('OnlyBookmark'); // bookmark preserved verbatim
    expect(out).toContain('Bookmarked note.'); // original text re-emitted
    expect(out).not.toContain('Edited away.'); // edit discarded by the gate
  });

  test('an sdt-only endnote is modeled (not verbatim-gated) and stays editable', () => {
    const xml =
      `${XML_DECL}<w:endnotes ${NS}>` +
      `<w:endnote w:id="3">` +
      `<w:p><w:r><w:t>Before sdt.</w:t></w:r></w:p>` +
      `<w:sdt><w:sdtPr><w:tag w:val="onlyTag"/></w:sdtPr>` +
      `<w:sdtContent><w:p><w:r><w:t>Inside SDT.</w:t></w:r></w:p></w:sdtContent>` +
      `</w:sdt>` +
      `</w:endnote>` +
      `</w:endnotes>`;
    const note = parseEndnotes(xml).getEndnote(3)!;

    // A content control no longer forces the verbatim gate: the note is fully
    // modeled, so the sdt parses into a BlockSdt sibling of the paragraph.
    expect(note.verbatimXml).toBeUndefined();
    const sdt = note.content.find((b) => b.type === 'blockSdt') as BlockSdt | undefined;
    expect(sdt).toBeDefined();

    // Edit a modeled paragraph in place — the edit must persist (the point of
    // #646), and the content control must survive alongside it.
    const para = note.content.find((b) => b.type === 'paragraph') as Paragraph;
    const run = para.content.find((it) => it.type === 'run');
    const textItem =
      run && run.type === 'run' ? run.content.find((c) => c.type === 'text') : undefined;
    expect(textItem).toBeDefined();
    (textItem as { text: string }).text = 'After edit.';

    const out = serializeEndnotes([note]);
    expect(out).toContain('After edit.'); // edit survived (not frozen to verbatim)
    expect(out).not.toContain('Before sdt.'); // old text was actually replaced
    expect(out).toContain('<w:sdt'); // content control survived
    expect(out).toContain('w:val="onlyTag"');
    expect(out).toContain('Inside SDT.');

    // Still well-formed on reparse.
    expect(parseEndnotes(out).getEndnote(3)).toBeDefined();
  });
});
