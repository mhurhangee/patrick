/**
 * Comment-range integrity.
 *
 * `commentRangeStart` / `commentRangeEnd` markers anchor a comment inside a
 * paragraph by id. A marker whose id has no matching `w:comment` in
 * `comments.xml` is an orphan that Word treats as corruption ("unreadable
 * content") and strict validators reject.
 *
 * Orphans only enter the model from imported documents (the editor and the
 * headless comment API always add and remove markers together). We therefore
 * repair them once, at parse time, on freshly-owned data — keeping the model
 * invariant "every comment range resolves to a comment" true everywhere
 * downstream, instead of scrubbing the model on the way out.
 */

import type { BlockContent, Document } from '../types/document';

function pruneBlocks(blocks: BlockContent[] | undefined, commentIds: Set<number>): void {
  if (!blocks) return;

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      block.content = block.content.filter(
        (item) =>
          (item.type !== 'commentRangeStart' && item.type !== 'commentRangeEnd') ||
          commentIds.has(item.id)
      );
    } else if (block.type === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          pruneBlocks(cell.content, commentIds);
        }
      }
    } else if (block.type === 'blockSdt') {
      pruneBlocks(block.content, commentIds);
    }
  }
}

/**
 * Remove comment-range markers that do not resolve to a known comment, across
 * the body and every part that can carry inline content (headers, footers,
 * footnotes, endnotes, and their separators).
 */
export function removeOrphanCommentRanges(doc: Document): void {
  const pkg = doc.package;
  const commentIds = new Set((pkg.document.comments ?? []).map((comment) => comment.id));

  pruneBlocks(pkg.document.content, commentIds);

  for (const header of pkg.headers?.values() ?? []) pruneBlocks(header.content, commentIds);
  for (const footer of pkg.footers?.values() ?? []) pruneBlocks(footer.content, commentIds);
  for (const note of pkg.footnotes ?? []) pruneBlocks(note.content, commentIds);
  for (const note of pkg.endnotes ?? []) pruneBlocks(note.content, commentIds);
  for (const note of pkg.footnoteSeparators ?? []) pruneBlocks(note.content, commentIds);
  for (const note of pkg.endnoteSeparators ?? []) pruneBlocks(note.content, commentIds);
}
