/**
 * Footnote / Endnote Serializer
 *
 * Serializes Footnote[] → word/footnotes.xml and Endnote[] → word/endnotes.xml.
 *
 * Unlike the comment serializer (which reimplements a minimal paragraph/run
 * emitter), note bodies are serialized with the SAME `serializeBlockContent`
 * the document body uses. That is deliberate: note bodies can carry the full
 * block model — paragraphs, tables, tracked-change wrappers (`w:ins`/`w:del`),
 * fields, run/paragraph properties — and reusing the body serializer preserves
 * all of it on round-trip rather than silently flattening it.
 *
 * Separator notes (`w:type="separator"` / `w:type="continuationSeparator"`) and
 * the in-body auto-number marks (`w:footnoteRef` / `w:endnoteRef`) survive
 * because the run model now carries them (see SeparatorContent / NoteRefMark-
 * Content in types/content/run.ts); no special-casing is needed here.
 *
 * OOXML Reference:
 * - Footnotes root: w:footnotes; each note: w:footnote[@w:id][@w:type]
 * - Endnotes root:  w:endnotes;  each note: w:endnote[@w:id][@w:type]
 */

import type { Footnote, Endnote } from '../../types/content';
import type { BlockContent } from '../../types/document';
import { serializeBlockContent } from './documentSerializer';
import { OOXML_NAMESPACES, MC_IGNORABLE } from './xmlUtils';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Serialize one note element (footnote or endnote share identical structure). */
function serializeNote(elementName: 'footnote' | 'endnote', note: Footnote | Endnote): string {
  // Verbatim gate (#646 F3): when the note body carried a block-level construct
  // the model can't represent — note-level bookmarks or w:customXml — the parser
  // stored the original `<w:footnote>`/`<w:endnote>` bytes verbatim. Re-emit them
  // as-is rather than rebuilding from `content` (which would drop the unmodeled
  // block). This restores pre-#646 fidelity for these notes. Block-level w:sdt is
  // NOT gated: it now round-trips through the model (BlockSdt), so notes whose
  // only "exotic" content is a content control stay fully editable.
  //
  // KNOWN LIMITATION (residual edge): a note that is BOTH edited in the editor
  // AND carries a bookmark / customXml can't be both verbatim-copied and
  // re-serialized from the edited model. We prefer correctness of the
  // structure: the verbatim bytes win, so an edit to such a note does NOT
  // persist. Notes built from modeled blocks (paragraphs, tables, content
  // controls) are unaffected and remain fully editable.
  if (note.verbatimXml) {
    return note.verbatimXml;
  }

  const attrs: string[] = [];
  // Word emits w:type before w:id on separator notes; mirror that ordering.
  if (note.noteType && note.noteType !== 'normal') {
    attrs.push(`w:type="${note.noteType}"`);
  }
  attrs.push(`w:id="${note.id}"`);

  const body = note.content.map((block) => serializeBlockContent(block as BlockContent)).join('');

  return `<w:${elementName} ${attrs.join(' ')}>${body}</w:${elementName}>`;
}

/**
 * Serialize footnotes to word/footnotes.xml content.
 *
 * @param footnotes - All footnotes in document order, including separator notes.
 * @returns Complete footnotes.xml string.
 */
export function serializeFootnotes(footnotes: Footnote[]): string {
  const notes = footnotes.map((fn) => serializeNote('footnote', fn)).join('');
  return `${XML_DECL}<w:footnotes ${OOXML_NAMESPACES} ${MC_IGNORABLE}>${notes}</w:footnotes>`;
}

/**
 * Serialize endnotes to word/endnotes.xml content.
 *
 * @param endnotes - All endnotes in document order, including separator notes.
 * @returns Complete endnotes.xml string.
 */
export function serializeEndnotes(endnotes: Endnote[]): string {
  const notes = endnotes.map((en) => serializeNote('endnote', en)).join('');
  return `${XML_DECL}<w:endnotes ${OOXML_NAMESPACES} ${MC_IGNORABLE}>${notes}</w:endnotes>`;
}
