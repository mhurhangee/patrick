/**
 * Header/Footer & Comment Packaging
 *
 * Serialize modified headers, footers, and comments back into the ZIP and
 * ensure each new part is registered in `[Content_Types].xml` and the
 * document's rels file. Without this step Word silently drops parts that
 * the editor inserted into a previously-blank document (#274).
 */

import type JSZip from 'jszip';
import type { Document } from '../../types/document';
import type { HeaderFooter } from '../../types/content';
import { serializeHeaderFooter } from '../serializer/headerFooterSerializer';
import {
  serializeCommentsWithInfo,
  serializeCommentsExtended,
  serializeCommentsIds,
  serializeCommentsExtensible,
} from '../serializer/commentSerializer';
import { serializeFootnotes, serializeEndnotes } from '../serializer/noteSerializer';
import { serializeNumberingXml } from '../serializer/numberingSerializer';
import { RELATIONSHIP_TYPES } from '../relsParser';
import { findMaxRId, readRelsOrStub, headerFooterFilename } from './parts';

const HEADER_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';

const FOOTER_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';

export const COMMENTS_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';

export const COMMENTS_EXTENDED_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml';

export const COMMENTS_IDS_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml';

export const COMMENTS_EXTENSIBLE_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml';

const NUMBERING_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml';

/**
 * Ensure every header/footer in `doc.package.relationships` is wired up in
 * `[Content_Types].xml` and `word/_rels/document.xml.rels`. For blank documents
 * where the user adds a header/footer for the first time, these files don't
 * know about the new part yet — without this Word silently drops them (#274).
 */
export async function ensureHeaderFooterParts(
  doc: Document,
  zip: JSZip,
  compressionLevel: number
): Promise<void> {
  const rels = doc.package.relationships;
  if (!rels) return;

  const parts: Array<{ rId: string; target: string; contentType: string; relType: string }> = [];
  for (const [rId, rel] of rels) {
    if (!rel.target) continue;
    const contentType =
      rel.type === RELATIONSHIP_TYPES.header
        ? HEADER_CONTENT_TYPE
        : rel.type === RELATIONSHIP_TYPES.footer
          ? FOOTER_CONTENT_TYPE
          : null;
    if (!contentType) continue;
    parts.push({
      rId,
      target: rel.target.replace(/^(\/?word\/)/, ''),
      contentType,
      relType: rel.type,
    });
  }
  if (parts.length === 0) return;

  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    let ctXml = await ctFile.async('text');
    let changed = false;
    for (const { target, contentType } of parts) {
      const partName = `/word/${target}`;
      if (!ctXml.includes(`PartName="${partName}"`)) {
        ctXml = ctXml.replace(
          '</Types>',
          `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`
        );
        changed = true;
      }
    }
    if (changed) {
      zip.file('[Content_Types].xml', ctXml, {
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
      });
    }
  }

  const relsPath = 'word/_rels/document.xml.rels';
  let relsXml = await readRelsOrStub(zip, relsPath);
  let relsChanged = false;
  for (const { rId, relType, target } of parts) {
    if (!relsXml.includes(`Id="${rId}"`)) {
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${rId}" Type="${relType}" Target="${target}"/></Relationships>`
      );
      relsChanged = true;
    }
  }
  if (relsChanged) {
    zip.file(relsPath, relsXml, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }
}

/**
 * Ensure a `word/numbering.xml` part exists for documents that reference list
 * `numId`s but carry no original numbering definitions to preserve (e.g. the
 * empty-template `createDocx()` path). Without it Word can't resolve the
 * `<w:numId>` references and silently drops every list marker.
 *
 * No-op when the package has no numbering definitions, or when it already ships
 * a `numbering.xml` — real-template round-trips keep their original numbering
 * untouched (it is copied through verbatim by the repacker).
 */
export async function ensureNumberingPart(
  doc: Document,
  zip: JSZip,
  compressionLevel: number
): Promise<void> {
  const numbering = doc.package.numbering;
  if (!numbering || (numbering.abstractNums.length === 0 && numbering.nums.length === 0)) {
    return;
  }
  if (zip.file('word/numbering.xml')) return;

  zip.file('word/numbering.xml', serializeNumberingXml(numbering), {
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  // Register the content type.
  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    let ctXml = await ctFile.async('text');
    if (!ctXml.includes('PartName="/word/numbering.xml"')) {
      ctXml = ctXml.replace(
        '</Types>',
        `<Override PartName="/word/numbering.xml" ContentType="${NUMBERING_CONTENT_TYPE}"/></Types>`
      );
      zip.file('[Content_Types].xml', ctXml, {
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
      });
    }
  }

  // Register the document → numbering relationship.
  const relsPath = 'word/_rels/document.xml.rels';
  let relsXml = await readRelsOrStub(zip, relsPath);
  if (!relsXml.includes('Target="numbering.xml"')) {
    const rId = `rId${findMaxRId(relsXml) + 1}`;
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${rId}" Type="${RELATIONSHIP_TYPES.numbering}" Target="numbering.xml"/></Relationships>`
    );
    zip.file(relsPath, relsXml, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }
}

/**
 * Ensure content types and relationships exist for all comment parts.
 * Reads each shared file once, applies all modifications, writes once.
 */
async function ensureAllCommentParts(zip: JSZip, compressionLevel: number): Promise<void> {
  const COMMENT_PARTS = [
    {
      partName: '/word/comments.xml',
      contentType: COMMENTS_CONTENT_TYPE,
      target: 'comments.xml',
      relType: RELATIONSHIP_TYPES.comments,
    },
    {
      partName: '/word/commentsExtended.xml',
      contentType: COMMENTS_EXTENDED_CONTENT_TYPE,
      target: 'commentsExtended.xml',
      relType: RELATIONSHIP_TYPES.commentsExtended,
    },
    {
      partName: '/word/commentsIds.xml',
      contentType: COMMENTS_IDS_CONTENT_TYPE,
      target: 'commentsIds.xml',
      relType: RELATIONSHIP_TYPES.commentsIds,
    },
    {
      partName: '/word/commentsExtensible.xml',
      contentType: COMMENTS_EXTENSIBLE_CONTENT_TYPE,
      target: 'commentsExtensible.xml',
      relType: RELATIONSHIP_TYPES.commentsExtensible,
    },
  ];

  // Content types — single read/write
  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    let ctXml = await ctFile.async('text');
    let changed = false;
    for (const { partName, contentType } of COMMENT_PARTS) {
      if (!ctXml.includes(partName)) {
        ctXml = ctXml.replace(
          '</Types>',
          `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`
        );
        changed = true;
      }
    }
    if (changed) {
      zip.file('[Content_Types].xml', ctXml, {
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
      });
    }
  }

  // Relationships — single read/write
  const relsPath = 'word/_rels/document.xml.rels';
  const relsFile = zip.file(relsPath);
  if (relsFile) {
    let relsXml = await relsFile.async('text');
    let changed = false;
    for (const { target, relType } of COMMENT_PARTS) {
      if (!relsXml.includes(target)) {
        const newRId = `rId${findMaxRId(relsXml) + 1}`;
        relsXml = relsXml.replace(
          '</Relationships>',
          `<Relationship Id="${newRId}" Type="${relType}" Target="${target}"/></Relationships>`
        );
        changed = true;
      }
    }
    if (changed) {
      zip.file(relsPath, relsXml, {
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
      });
    }
  }
}

/**
 * Serialize all comment-side XML parts (comments + extended + ids + extensible)
 * into the ZIP and register them in content types and rels.
 */
export async function serializeCommentsToZip(
  doc: Document,
  zip: JSZip,
  compressionLevel: number
): Promise<void> {
  const comments = doc.package.document.comments;
  if (!comments || comments.length === 0) return;

  const { xml: commentsXml, paraInfos } = serializeCommentsWithInfo(comments);
  zip.file('word/comments.xml', commentsXml, {
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  // Write commentsExtended.xml for reply threading (Word/Google Docs interop)
  const extendedXml = serializeCommentsExtended(paraInfos);
  if (extendedXml) {
    zip.file('word/commentsExtended.xml', extendedXml, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }

  // Write commentsIds.xml for stable IDs (Word Online needs this for replies)
  const idsXml = serializeCommentsIds(paraInfos);
  if (idsXml) {
    zip.file('word/commentsIds.xml', idsXml, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }

  // Write commentsExtensible.xml for UTC dates (Pages, Word 2016+)
  const extensibleXml = serializeCommentsExtensible(paraInfos, comments);
  if (extensibleXml) {
    zip.file('word/commentsExtensible.xml', extensibleXml, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }

  await ensureAllCommentParts(zip, compressionLevel);
}

/**
 * Serialize footnotes into `word/footnotes.xml`.
 *
 * Re-emits separator notes (kept in `footnoteSeparators`) ahead of the normal
 * notes, mirroring Word's ordering. Only writes when the document actually has
 * footnotes; otherwise the original part is left untouched. Content-type / rels
 * registration is skipped on purpose — a document that carries footnotes
 * already declares the part, and notes-from-scratch is out of scope here.
 */
export function serializeFootnotesToZip(doc: Document, zip: JSZip, compressionLevel: number): void {
  const normal = doc.package.footnotes ?? [];
  const separators = doc.package.footnoteSeparators ?? [];
  if (normal.length === 0 && separators.length === 0) return;

  const xml = serializeFootnotes([...separators, ...normal]);
  zip.file('word/footnotes.xml', xml, {
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });
}

/**
 * Serialize endnotes into `word/endnotes.xml`. See {@link serializeFootnotesToZip}.
 */
export function serializeEndnotesToZip(doc: Document, zip: JSZip, compressionLevel: number): void {
  const normal = doc.package.endnotes ?? [];
  const separators = doc.package.endnoteSeparators ?? [];
  if (normal.length === 0 && separators.length === 0) return;

  const xml = serializeEndnotes([...separators, ...normal]);
  zip.file('word/endnotes.xml', xml, {
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });
}

/**
 * Collect serialized header/footer XML updates from the document model.
 * Uses the relationship map to resolve rId → filename.
 */
export function collectHeaderFooterUpdates(doc: Document): Map<string, string> {
  const updates = new Map<string, string>();
  const rels = doc.package.relationships;
  if (!rels) return updates;

  const parts: Array<{
    map: Map<string, HeaderFooter> | undefined;
    type: string;
  }> = [
    { map: doc.package.headers, type: RELATIONSHIP_TYPES.header },
    { map: doc.package.footers, type: RELATIONSHIP_TYPES.footer },
  ];

  for (const { map, type } of parts) {
    if (!map) continue;
    for (const [rId, headerFooter] of map.entries()) {
      const rel = rels.get(rId);
      if (rel && rel.type === type && rel.target) {
        updates.set(headerFooterFilename(rel.target), serializeHeaderFooter(headerFooter));
      }
    }
  }

  return updates;
}

/**
 * Serialize modified headers and footers into the ZIP.
 */
export function serializeHeadersFootersToZip(
  doc: Document,
  zip: JSZip,
  compressionLevel: number
): void {
  const compressionOptions = { level: compressionLevel };
  for (const [filename, xml] of collectHeaderFooterUpdates(doc)) {
    zip.file(filename, xml, { compression: 'DEFLATE', compressionOptions });
  }
}
