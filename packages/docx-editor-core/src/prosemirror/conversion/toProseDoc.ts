/**
 * Document to ProseMirror Conversion
 *
 * Converts our Document type (from DOCX parsing) to a ProseMirror document.
 * Preserves all formatting attributes for round-trip fidelity.
 *
 * Style Resolution:
 * When styles are provided, paragraph properties are resolved from the style chain:
 * - Document defaults (docDefaults)
 * - Normal style (if no explicit styleId)
 * - Style chain (basedOn inheritance)
 * - Inline properties (highest priority)
 *
 * This file owns the top-level entry points (toProseDoc, headerFooterToProseDoc,
 * footnoteToProseDoc, createEmptyDoc). Per-domain converters live under
 * ./toProseDoc/ (marks, runs, paragraph, tables, textbox) — symmetric to
 * the fromProseDoc/ split.
 */

import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../schema';
import type { Document, BlockContent, StyleDefinitions, Theme } from '../../types/document';
import { createStyleResolver, type StyleResolver } from '../styles';
import { getDocumentWatermark } from '../../docx/watermarkApi';
import { paragraphHasNonLeadingPageBreak } from './toProseDoc/paragraph';
import { convertTable } from './toProseDoc/tables';
import { convertParagraphWithTextBoxes } from './toProseDoc/textbox';
import { sdtPropsToAttrs } from './sdtAttrs';

/**
 * Convert a list of block-content model nodes to PM nodes.
 *
 * Block-level SDTs become real `blockSdt` PM nodes wrapping their
 * (recursively converted) children, so content controls survive the edit
 * cycle instead of being flattened. A control that wraps nothing gets a
 * single empty paragraph to satisfy the `block+` content model.
 *
 * `includePageBreaks` mirrors the body-only behavior of emitting a
 * `pageBreak` node after a paragraph carrying a rendered page break;
 * header/footer content passes `false`.
 */
function convertBlocksToNodes(
  blocks: BlockContent[],
  styleResolver: StyleResolver | null,
  theme: Theme | null,
  includePageBreaks: boolean
): PMNode[] {
  const nodes: PMNode[] = [];
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      nodes.push(...convertParagraphWithTextBoxes(block, styleResolver));
      if (includePageBreaks && paragraphHasNonLeadingPageBreak(block)) {
        nodes.push(schema.node('pageBreak'));
      }
    } else if (block.type === 'table') {
      nodes.push(convertTable(block, styleResolver, theme));
    } else if (block.type === 'blockSdt') {
      const childNodes = convertBlocksToNodes(
        block.content,
        styleResolver,
        theme,
        includePageBreaks
      );
      const inner = childNodes.length > 0 ? childNodes : [schema.node('paragraph', {}, [])];
      nodes.push(schema.node('blockSdt', sdtPropsToAttrs(block.properties), inner));
    }
  }
  return nodes;
}

/**
 * Options for document conversion
 */
export interface ToProseDocOptions {
  /** Style definitions for resolving paragraph styles */
  styles?: StyleDefinitions;
  /**
   * Doc-level `w:defaultTabStop` (§17.6.13) in twips, stamped onto the PM
   * doc node so `toFlowBlocks` picks it up. The body entry point reads
   * this from the parsed package; HF/footnote callers must pass it
   * through explicitly since their input is a content array, not a full
   * `Document`. Falls back to the OOXML default (720 twips) when null.
   */
  defaultTabStopTwips?: number | null;
}

/**
 * Convert a Document to a ProseMirror document
 *
 * @param document - The Document to convert
 * @param options - Conversion options including style definitions
 */
export function toProseDoc(document: Document, options?: ToProseDocOptions): PMNode {
  const theme = document.package.theme ?? null;

  // Create style resolver if styles are provided
  const styleResolver = options?.styles ? createStyleResolver(options.styles) : null;

  const nodes = convertBlocksToNodes(
    document.package.document.content,
    styleResolver,
    theme,
    /* includePageBreaks */ true
  );

  // Ensure we have at least one paragraph.
  if (nodes.length === 0) {
    nodes.push(schema.node('paragraph', {}, []));
  }

  // Guarantee a text-cursor position after trailing isolating block content.
  // An `isolating` node (table, textBox, blockSdt) cannot have the caret land
  // after it when it is the doc's last node (there is no gapcursor plugin), so
  // the user can never type below it — e.g. a document whose final element is a
  // signature table, a floating text box, or a body wrapped in a content
  // control. Word likewise always keeps a body-final paragraph after such
  // content (OOXML forbids a body ending in a table), so emitting one here is
  // faithful and round-trips correctly.
  if (nodes[nodes.length - 1]?.type.spec.isolating) {
    nodes.push(schema.node('paragraph', {}, []));
  }

  return schema.node(
    'doc',
    {
      defaultTabStopTwips: document.package.settings?.defaultTabStop ?? null,
      // Seed the watermark from the parsed headers so it rides PM state.
      watermark: getDocumentWatermark(document) ?? null,
    },
    nodes
  );
}

/**
 * Convert HeaderFooter content (array of Paragraph/Table blocks) to a ProseMirror document.
 * Used for editing headers/footers in their own ProseMirror editor and for the
 * unified header/footer render pipeline. `theme` must be threaded for themeColor
 * resolution in cell shading (`<w:shd w:themeFill=...>`) — without it, themed
 * fills in HF tables fall back to the unresolved theme key.
 */
export function headerFooterToProseDoc(
  content: BlockContent[],
  options?: ToProseDocOptions & { theme?: Theme | null }
): PMNode {
  const styleResolver = options?.styles ? createStyleResolver(options.styles) : null;
  const theme = options?.theme ?? null;

  const nodes = convertBlocksToNodes(content, styleResolver, theme, /* includePageBreaks */ false);

  if (nodes.length === 0) {
    nodes.push(schema.node('paragraph', {}, []));
  }

  return schema.node('doc', { defaultTabStopTwips: options?.defaultTabStopTwips ?? null }, nodes);
}

/**
 * Convert footnote/endnote content (array of Paragraph/Table blocks) to a
 * ProseMirror document. Mirrors `headerFooterToProseDoc` so footnotes flow
 * through the same body pipeline (toFlowBlocks → measureBlocks →
 * renderFragment) and inherit its block support — paragraph + table + image
 * + textBox + fields. Pre-PR, footnoteLayout's `convertFootnoteToContent`
 * re-implemented run/paragraph conversion by hand and silently dropped
 * tables, images, and fields nested inside a footnote.
 */
export function footnoteToProseDoc(
  content: BlockContent[],
  options?: ToProseDocOptions & { theme?: Theme | null }
): PMNode {
  return headerFooterToProseDoc(content, options);
}

/**
 * Create an empty ProseMirror document
 */
export function createEmptyDoc(): PMNode {
  return schema.node('doc', null, [schema.node('paragraph', {}, [])]);
}
