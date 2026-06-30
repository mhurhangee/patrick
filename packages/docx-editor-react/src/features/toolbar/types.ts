/**
 * Formatting contract — the seam between the editor "brain" (glue: selection
 * tracking, formatting-action execution) and the toolbar chrome.
 *
 * `SelectionFormatting` is the current state of the selection (what the toolbar
 * reflects); `FormattingAction` is what the toolbar dispatches and the glue
 * applies. React-package types only — headless/core has no toolbar.
 */

import type { ColorValue, ParagraphAlignment } from '@eigenpal/docx-editor-core/types/document';
import type { ListState } from '@eigenpal/docx-editor-core/utils/listState';

/**
 * Current formatting state of the selection
 */
export interface SelectionFormatting {
  /** Whether selected text is bold */
  bold?: boolean;
  /** Whether selected text is italic */
  italic?: boolean;
  /** Whether selected text is underlined */
  underline?: boolean;
  /** Whether selected text has strikethrough */
  strike?: boolean;
  /** Whether selected text is superscript */
  superscript?: boolean;
  /** Whether selected text is subscript */
  subscript?: boolean;
  /** Font family of selected text */
  fontFamily?: string;
  /** Font size of selected text (in half-points) */
  fontSize?: number;
  /** Text color */
  color?: string;
  /** Highlight color */
  highlight?: string;
  /** Paragraph alignment */
  alignment?: ParagraphAlignment;
  /** List state of the current paragraph */
  listState?: ListState;
  /** Line spacing in twips (OOXML value, 240 = single spacing) */
  lineSpacing?: number;
  /** Paragraph style ID */
  styleId?: string;
  /** Paragraph left indentation in twips */
  indentLeft?: number;
}

/**
 * Formatting action types
 */
export type FormattingAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'superscript'
  | 'subscript'
  | 'clearFormatting'
  | 'bulletList'
  | 'numberedList'
  | 'indent'
  | 'outdent'
  | 'insertLink'
  | { type: 'fontFamily'; value: string }
  | { type: 'fontSize'; value: number }
  | { type: 'textColor'; value: ColorValue | string }
  | { type: 'highlightColor'; value: string }
  | { type: 'alignment'; value: ParagraphAlignment }
  | { type: 'lineSpacing'; value: number }
  | { type: 'applyStyle'; value: string };
