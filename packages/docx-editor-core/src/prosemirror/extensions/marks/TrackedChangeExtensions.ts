/**
 * Tracked Change Mark Extensions — insertion and deletion marks
 *
 * Renders insertions with green underline and deletions with red strikethrough,
 * matching the standard MS Word display for tracked changes.
 */

import { createMarkExtension } from '../create';

/**
 * Insertion mark — text added in tracked changes
 * Renders with green color and underline.
 */
export const InsertionExtension = createMarkExtension({
  name: 'insertion',
  schemaMarkName: 'insertion',
  markSpec: {
    attrs: {
      revisionId: { default: 0 },
      author: { default: '' },
      date: { default: null },
      // True only when parsed from `<w:moveTo>`. The serializer uses this to
      // emit `<w:moveFrom>`/`<w:moveTo>` faithfully; without it, an
      // insertion + deletion that happen to share a `w:id` (not unique
      // per ECMA-376) would be silently flipped into a move pair on save.
      isMovePair: { default: false },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'span.docx-insertion',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            revisionId: parseInt(el.dataset.revisionId || '0', 10),
            author: el.dataset.author || '',
            date: el.dataset.date || null,
            isMovePair: el.dataset.movePair === 'true',
          };
        },
      },
    ],
    toDOM(mark) {
      return [
        'span',
        {
          class: 'docx-insertion',
          'data-revision-id': String(mark.attrs.revisionId),
          'data-author': mark.attrs.author,
          ...(mark.attrs.date ? { 'data-date': mark.attrs.date } : {}),
          ...(mark.attrs.isMovePair ? { 'data-move-pair': 'true' } : {}),
          style: 'color: #2e7d32;',
        },
        0,
      ];
    },
  },
});

/**
 * Deletion mark — text removed in tracked changes
 * Renders with red color and strikethrough.
 */
export const DeletionExtension = createMarkExtension({
  name: 'deletion',
  schemaMarkName: 'deletion',
  markSpec: {
    attrs: {
      revisionId: { default: 0 },
      author: { default: '' },
      date: { default: null },
      // True only when parsed from `<w:moveFrom>`. See InsertionExtension
      // above for the rationale — id coincidence is not a reliable signal.
      isMovePair: { default: false },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'span.docx-deletion',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            revisionId: parseInt(el.dataset.revisionId || '0', 10),
            author: el.dataset.author || '',
            date: el.dataset.date || null,
            isMovePair: el.dataset.movePair === 'true',
          };
        },
      },
    ],
    toDOM(mark) {
      return [
        'span',
        {
          class: 'docx-deletion',
          'data-revision-id': String(mark.attrs.revisionId),
          'data-author': mark.attrs.author,
          ...(mark.attrs.date ? { 'data-date': mark.attrs.date } : {}),
          ...(mark.attrs.isMovePair ? { 'data-move-pair': 'true' } : {}),
          style: 'color: #c62828;',
        },
        0,
      ];
    },
  },
});
