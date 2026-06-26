/**
 * Comments (`w:comment` in `comments.xml`) and the inline range markers
 * (`w:commentRangeStart`/`End`) that anchor them inside paragraphs.
 */

import type { Paragraph } from './paragraph';

/**
 * A comment from `comments.xml` — the top-level entity for review
 * comments and replies. `id` matches the inline `CommentRangeStart` /
 * `CommentRangeEnd` markers that anchor it inside a paragraph; `parentId`
 * threads replies under their parent; `done` reflects Word's "Resolve"
 * state (`w15:done`).
 */
export interface Comment {
  /** Comment ID (matches commentRangeStart/End) */
  id: number;
  /** Author name */
  author: string;
  /** Author initials */
  initials?: string;
  /** Date */
  date?: string;
  /** Comment content (paragraphs) */
  content: Paragraph[];
  /** Parent comment ID (for replies) */
  parentId?: number;
  /** Whether the comment is resolved/done */
  done?: boolean;
}

/**
 * Comment range start marker in paragraph content
 */
export interface CommentRangeStart {
  type: 'commentRangeStart';
  id: number;
}

/**
 * Comment range end marker in paragraph content
 */
export interface CommentRangeEnd {
  type: 'commentRangeEnd';
  id: number;
}
