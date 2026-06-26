/**
 * Part Enumeration
 *
 * Shared helpers for walking the parts of a DOCX package (body, headers,
 * footers, footnotes, endnotes) when registering newly inserted images and
 * hyperlinks against each part's rels file.
 */

import type JSZip from 'jszip';
import type { Document } from '../../types/document';
import type { BlockContent, HeaderFooter } from '../../types/content';
import { RELATIONSHIP_TYPES } from '../relsParser';

/**
 * A DOCX part (body, header, or footer) that owns a rels file and may contain
 * newly inserted images/hyperlinks that need to be registered.
 */
export interface Part {
  /** Path to the rels file for this part, e.g. `word/_rels/header1.xml.rels` */
  relsPath: string;
  blocks: BlockContent[];
}

const EMPTY_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

/**
 * Resolve the on-disk filename of a header/footer part from its relationship entry.
 * Returns e.g. `word/header1.xml`.
 */
export function headerFooterFilename(target: string): string {
  return target.startsWith('/') ? target.slice(1) : `word/${target}`;
}

/**
 * Enumerate all parts that may contain newly inserted images/hyperlinks:
 * the document body, every header and footer, and the footnote/endnote parts.
 * Footnotes/endnotes always serialize to the fixed `word/footnotes.xml` /
 * `word/endnotes.xml`, so their rels paths are fixed too.
 */
export function collectParts(doc: Document): Part[] {
  const parts: Part[] = [
    { relsPath: 'word/_rels/document.xml.rels', blocks: doc.package.document.content },
  ];

  const noteBlocks = (notes: { content: BlockContent[] }[] | undefined): BlockContent[] =>
    (notes ?? []).flatMap((note) => note.content);

  const footnoteBlocks = [
    ...noteBlocks(doc.package.footnoteSeparators),
    ...noteBlocks(doc.package.footnotes),
  ];
  if (footnoteBlocks.length > 0) {
    parts.push({ relsPath: 'word/_rels/footnotes.xml.rels', blocks: footnoteBlocks });
  }

  const endnoteBlocks = [
    ...noteBlocks(doc.package.endnoteSeparators),
    ...noteBlocks(doc.package.endnotes),
  ];
  if (endnoteBlocks.length > 0) {
    parts.push({ relsPath: 'word/_rels/endnotes.xml.rels', blocks: endnoteBlocks });
  }

  const rels = doc.package.relationships;
  if (!rels) return parts;

  const addHeaderFooterParts = (map: Map<string, HeaderFooter> | undefined, type: string) => {
    if (!map) return;
    for (const [rId, hf] of map.entries()) {
      const rel = rels.get(rId);
      if (!rel || rel.type !== type || !rel.target) continue;
      const filename = headerFooterFilename(rel.target);
      const basename = filename.replace(/^word\//, '');
      parts.push({ relsPath: `word/_rels/${basename}.rels`, blocks: hf.content });
    }
  };

  addHeaderFooterParts(doc.package.headers, RELATIONSHIP_TYPES.header);
  addHeaderFooterParts(doc.package.footers, RELATIONSHIP_TYPES.footer);

  return parts;
}

/**
 * Read an existing rels file (or return a minimal stub) and normalize the
 * self-closing form `<Relationships .../>` — which Word emits for empty parts —
 * to the open/close form so our `.replace('</Relationships>', ...)` append works.
 */
export async function readRelsOrStub(zip: JSZip, relsPath: string): Promise<string> {
  const file = zip.file(relsPath);
  const xml = file ? await file.async('text') : EMPTY_RELS_XML;
  return xml.replace(/<Relationships([^>]*)\/>/, '<Relationships$1></Relationships>');
}

/**
 * Find the highest rId number in a relationships XML string.
 */
export function findMaxRId(relsXml: string): number {
  let maxId = 0;
  for (const match of relsXml.matchAll(/Id="rId(\d+)"/g)) {
    const id = parseInt(match[1], 10);
    if (id > maxId) maxId = id;
  }
  return maxId;
}
