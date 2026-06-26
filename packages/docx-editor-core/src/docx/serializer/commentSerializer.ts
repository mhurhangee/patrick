/**
 * Comment Serializer
 *
 * Serializes Comment[] to OOXML comments.xml and commentsExtended.xml.
 *
 * comments.xml: the main comment content (w:comment elements)
 * commentsExtended.xml: reply threading via w15:commentEx with paraId/paraIdParent
 *
 * Each comment paragraph gets a w14:paraId. The last paragraph's paraId is used
 * in commentsExtended.xml to link replies to parents via w15:paraIdParent.
 */

import type { Comment, Paragraph, Run } from '../../types/content';
import { escapeXml, OOXML_NAMESPACES, MC_IGNORABLE } from './xmlUtils';
import { generateHexId } from '../../utils/hexId';

function serializeRunContent(run: Run): string {
  let xml = '<w:r>';
  // Run properties (minimal — just preserve formatting basics)
  const rPr: string[] = [];
  if (run.formatting?.bold) rPr.push('<w:b/>');
  if (run.formatting?.italic) rPr.push('<w:i/>');
  if (rPr.length > 0) xml += `<w:rPr>${rPr.join('')}</w:rPr>`;

  for (const c of run.content) {
    if (c.type === 'text') {
      const preserveSpace = c.text !== c.text.trim() || c.text.includes('  ');
      xml += preserveSpace
        ? `<w:t xml:space="preserve">${escapeXml(c.text)}</w:t>`
        : `<w:t>${escapeXml(c.text)}</w:t>`;
    } else if (c.type === 'break') {
      xml += '<w:br/>';
    }
  }
  xml += '</w:r>';
  return xml;
}

function serializeParagraph(p: Paragraph, paraId?: string): string {
  let xml = paraId ? `<w:p w14:paraId="${paraId}">` : '<w:p>';
  for (const item of p.content) {
    if (item.type === 'run') {
      xml += serializeRunContent(item);
    }
  }
  xml += '</w:p>';
  return xml;
}

/** Serialize a paragraph, prepending an annotationRef run (required by Word in first paragraph of a comment) */
function serializeParagraphWithAnnotationRef(p: Paragraph, paraId?: string): string {
  let xml = paraId ? `<w:p w14:paraId="${paraId}">` : '<w:p>';
  xml += '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>';
  for (const item of p.content) {
    if (item.type === 'run') {
      xml += serializeRunContent(item);
    }
  }
  xml += '</w:p>';
  return xml;
}

interface CommentParaInfo {
  commentId: number;
  lastParaId: string;
  durableId: string;
  parentId?: number;
  done?: boolean;
}

function serializeComment(comment: Comment, paraInfos: CommentParaInfo[]): string {
  const commentParaId = generateHexId();

  const attrs: string[] = [`w:id="${comment.id}"`];
  if (comment.author) attrs.push(`w:author="${escapeXml(comment.author)}"`);
  if (comment.initials) attrs.push(`w:initials="${escapeXml(comment.initials)}"`);
  else attrs.push('w:initials=""');
  if (comment.date) {
    // Strip milliseconds — Word/Pages expect ISO without fractional seconds
    const cleanDate = comment.date.replace(/\.\d{3}Z$/, 'Z');
    attrs.push(`w:date="${escapeXml(cleanDate)}"`);
  }
  // Note: w:done is NOT emitted on w:comment — resolved state goes
  // exclusively in commentsExtended.xml as w15:done

  let xml = `<w:comment ${attrs.join(' ')}>`;

  if (comment.content && comment.content.length > 0) {
    if (comment.content.length === 1) {
      // Single paragraph — paraId on this (last) paragraph
      xml += serializeParagraphWithAnnotationRef(comment.content[0], commentParaId);
    } else {
      // Multiple paragraphs — paraId ONLY on the last one
      xml += serializeParagraphWithAnnotationRef(comment.content[0]);
      for (let i = 1; i < comment.content.length - 1; i++) {
        xml += serializeParagraph(comment.content[i]);
      }
      xml += serializeParagraph(comment.content[comment.content.length - 1], commentParaId);
    }
  } else {
    // Empty comment — paraId on the sole paragraph
    xml += `<w:p w14:paraId="${commentParaId}"><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r></w:p>`;
  }
  xml += '</w:comment>';

  paraInfos.push({
    commentId: comment.id,
    lastParaId: commentParaId,
    durableId: generateHexId(),
    parentId: comment.parentId,
    done: comment.done,
  });

  return xml;
}

/**
 * Serialize comments array to comments.xml content.
 * Also returns para info needed for commentsExtended.xml.
 */
export function serializeCommentsWithInfo(comments: Comment[]): {
  xml: string;
  paraInfos: CommentParaInfo[];
} {
  if (!comments || comments.length === 0) return { xml: '', paraInfos: [] };

  // Separate top-level comments and replies in a single pass
  const topLevel: Comment[] = [];
  const replies: Comment[] = [];
  for (const c of comments) {
    (c.parentId == null ? topLevel : replies).push(c);
  }

  const paraInfos: CommentParaInfo[] = [];

  let xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:comments ${OOXML_NAMESPACES} ${MC_IGNORABLE}>`;

  // Serialize top-level comments first, then replies
  for (const comment of topLevel) {
    xml += serializeComment(comment, paraInfos);
  }
  for (const reply of replies) {
    xml += serializeComment(reply, paraInfos);
  }

  xml += '</w:comments>';
  return { xml, paraInfos };
}

/**
 * Serialize comments array to comments.xml content (backwards-compatible wrapper)
 */
export function serializeComments(comments: Comment[]): string {
  return serializeCommentsWithInfo(comments).xml;
}

/**
 * Serialize commentsExtended.xml (w15:commentsEx) for reply threading.
 *
 * This file tells Word/Google Docs which comments are replies (via paraIdParent)
 * and which are resolved (via done). Without it, replies show as separate comments.
 */
export function serializeCommentsExtended(paraInfos: CommentParaInfo[]): string {
  if (paraInfos.length === 0) return '';

  // Build a lookup: commentId → lastParaId (for resolving parentId → paraIdParent)
  const paraIdByCommentId = new Map<number, string>();
  for (const info of paraInfos) {
    paraIdByCommentId.set(info.commentId, info.lastParaId);
  }

  let xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w15:commentsEx ${OOXML_NAMESPACES} ${MC_IGNORABLE}>`;

  for (const info of paraInfos) {
    let attrs = `w15:paraId="${info.lastParaId}" w15:done="${info.done ? '1' : '0'}"`;

    // Link reply to parent via paraIdParent
    if (info.parentId != null) {
      const parentParaId = paraIdByCommentId.get(info.parentId);
      if (parentParaId) {
        attrs += ` w15:paraIdParent="${parentParaId}"`;
      }
    }

    xml += `<w15:commentEx ${attrs} />`;
  }

  xml += '</w15:commentsEx>';
  return xml;
}

/**
 * Serialize commentsIds.xml (w16cid:commentsIds) for stable comment IDs.
 *
 * Word Online needs this to associate replies with parent comments.
 * Each comment gets a durableId derived from its paraId.
 */
export function serializeCommentsIds(paraInfos: CommentParaInfo[]): string {
  if (paraInfos.length === 0) return '';

  let xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w16cid:commentsIds ${OOXML_NAMESPACES} ${MC_IGNORABLE}>`;

  for (const info of paraInfos) {
    xml += `<w16cid:commentId w16cid:paraId="${info.lastParaId}" w16cid:durableId="${info.durableId}" />`;
  }

  xml += '</w16cid:commentsIds>';
  return xml;
}

/**
 * Serialize commentsExtensible.xml (w16cex:commentsExtensible) with UTC dates.
 *
 * Word Online and Pages use this for precise timestamps on comments.
 * Each entry links a durableId to a UTC date.
 */
export function serializeCommentsExtensible(
  paraInfos: CommentParaInfo[],
  comments: Comment[]
): string {
  if (paraInfos.length === 0) return '';

  // Build commentId → comment lookup for dates
  const commentById = new Map<number, Comment>();
  for (const c of comments) commentById.set(c.id, c);

  let xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w16cex:commentsExtensible ${OOXML_NAMESPACES} ${MC_IGNORABLE}>`;

  for (const info of paraInfos) {
    const comment = commentById.get(info.commentId);
    if (!comment?.date) continue;

    const durableId = info.durableId;

    // Ensure UTC format
    // Strip milliseconds and ensure Z suffix
    const dateUtc = (comment.date.endsWith('Z') ? comment.date : comment.date + 'Z').replace(
      /\.\d{3}Z$/,
      'Z'
    );

    xml += `<w16cex:commentExtensible w16cex:durableId="${durableId}" w16cex:dateUtc="${dateUtc}"/>`;
  }

  xml += '</w16cex:commentsExtensible>';
  return xml;
}
