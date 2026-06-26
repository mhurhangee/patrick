/**
 * Read-only queries on a parsed Paragraph.
 *
 * Plain-text extraction and small predicates (empty, list item, list level,
 * style match, template-variable detection). No XML access — they operate
 * on the parsed model only. Mirrors the `tableParser/queries.ts` sibling.
 */

import type { Paragraph } from '../../types/document';

/**
 * Get plain text from a paragraph
 *
 * @param paragraph - Parsed Paragraph object
 * @returns Concatenated text content
 */
export function getParagraphText(paragraph: Paragraph): string {
  let text = '';

  for (const content of paragraph.content) {
    if (content.type === 'run') {
      for (const runContent of content.content) {
        if (runContent.type === 'text') {
          text += runContent.text;
        } else if (runContent.type === 'tab') {
          text += '\t';
        } else if (runContent.type === 'break') {
          if (runContent.breakType === 'page') {
            text += '\f';
          } else {
            text += '\n';
          }
        }
      }
    } else if (content.type === 'hyperlink') {
      for (const child of content.children) {
        if (child.type === 'run') {
          for (const runContent of child.content) {
            if (runContent.type === 'text') {
              text += runContent.text;
            }
          }
        }
      }
    } else if (content.type === 'simpleField') {
      for (const child of content.content) {
        if (child.type === 'run') {
          for (const runContent of child.content) {
            if (runContent.type === 'text') {
              text += runContent.text;
            }
          }
        }
      }
    } else if (content.type === 'complexField') {
      for (const run of content.fieldResult) {
        for (const runContent of run.content) {
          if (runContent.type === 'text') {
            text += runContent.text;
          }
        }
      }
    }
  }

  return text;
}

/**
 * Check if a paragraph is empty (no visible content)
 *
 * @param paragraph - Parsed Paragraph object
 * @returns true if paragraph has no visible content
 */
export function isEmptyParagraph(paragraph: Paragraph): boolean {
  return (
    getParagraphText(paragraph).trim() === '' &&
    !paragraph.content.some(
      (c) =>
        c.type === 'run' && c.content.some((rc) => rc.type === 'drawing' || rc.type === 'shape')
    )
  );
}

/**
 * Check if a paragraph is a list item
 *
 * @param paragraph - Parsed Paragraph object
 * @returns true if paragraph has numbering properties
 */
export function isListItem(paragraph: Paragraph): boolean {
  return (
    paragraph.formatting?.numPr !== undefined &&
    paragraph.formatting.numPr.numId !== undefined &&
    paragraph.formatting.numPr.numId !== 0
  );
}

/**
 * Get the list level of a paragraph (0-8)
 *
 * @param paragraph - Parsed Paragraph object
 * @returns List level or undefined if not a list item
 */
export function getListLevel(paragraph: Paragraph): number | undefined {
  if (!isListItem(paragraph)) return undefined;
  return paragraph.formatting?.numPr?.ilvl ?? 0;
}

/**
 * Check if paragraph has a specific style
 *
 * @param paragraph - Parsed Paragraph object
 * @param styleId - Style ID to check for
 * @returns true if paragraph has the specified style
 */
export function hasStyle(paragraph: Paragraph, styleId: string): boolean {
  return paragraph.formatting?.styleId === styleId;
}

/**
 * Check if paragraph starts with a template variable {{...}}
 *
 * @param paragraph - Parsed Paragraph object
 * @returns The variable name or null
 */
export function getTemplateVariable(paragraph: Paragraph): string | null {
  const text = getParagraphText(paragraph);
  const match = text.match(/\{\{([^}]+)\}\}/);
  return match ? match[1] : null;
}
