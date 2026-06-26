/**
 * ProseMirror to Document Conversion
 *
 * Converts a ProseMirror document back to our Document type.
 * This enables round-trip editing: DOCX -> Document -> PM -> Document -> DOCX
 *
 * Key responsibilities:
 * - Coalesce consecutive text with same marks into single Runs
 * - Preserve paragraph attributes (paraId, textId, formatting)
 * - Handle marks -> TextFormatting conversion
 *
 * This file owns the top-level orchestrator (`fromProseDoc`) plus block
 * extraction and the page-break paragraph factory. Per-domain converters
 * live under ./fromProseDoc/ (marks, runs, paragraph, tables, textbox).
 * The deep import `@eigenpal/.../prosemirror/conversion/fromProseDoc` is
 * a tsup entry consumed by the Vue adapter — the barrel re-exports
 * preserve that surface.
 * @packageDocumentation
 * @public
 */

import type { Node as PMNode } from 'prosemirror-model';
import type {
  Document,
  DocumentBody,
  Paragraph,
  Run,
  BreakContent,
  BlockContent,
  BlockSdt,
  Watermark,
} from '../../types/document';
import { getDocumentWatermark, setDocumentWatermark } from '../../docx/watermarkApi';
import type { TextBoxAttrs } from '../extensions/nodes/TextBoxExtension';
import { shouldExportTextBoxInsideFollowingParagraph } from './textBoxAnchors';
import { sdtAttrsToProps } from './sdtAttrs';
import { convertPMParagraph } from './fromProseDoc/paragraph';
import { convertPMTable } from './fromProseDoc/tables';
import { convertPMTextBox, convertPMTextBoxRun } from './fromProseDoc/textbox';
import { collectNumberingFromPM } from './fromProseDoc/numbering';

/**
 * Convert a ProseMirror document to our Document type
 */
export function fromProseDoc(pmDoc: PMNode, baseDocument?: Document): Document {
  const blocks = extractBlocks(pmDoc);

  // Preserve section properties (margins, headers, footers) from base document
  const documentBody: DocumentBody = {
    content: blocks,
    finalSectionProperties: baseDocument?.package.document.finalSectionProperties,
    sections: baseDocument?.package.document.sections,
    comments: baseDocument?.package.document.comments,
  };

  // If we have a base document, preserve its package structure
  const result: Document = baseDocument
    ? {
        ...baseDocument,
        package: {
          ...baseDocument.package,
          document: documentBody,
        },
      }
    : { package: { document: documentBody, numbering: collectNumberingFromPM(pmDoc) } };

  // Sync the watermark doc attr → `HeaderFooter.watermark` so the serializer
  // and any model consumers see watermark applies/removes (incl. via undo).
  // Reference comparison skips the header-map clone on the common no-change
  // path — the same Watermark object rides PM attrs until explicitly changed.
  const attrWatermark = (pmDoc.attrs.watermark as Watermark | null) ?? null;
  const currentWatermark = getDocumentWatermark(result) ?? null;
  if (attrWatermark !== currentWatermark) {
    return setDocumentWatermark(result, attrWatermark);
  }
  return result;
}

/**
 * Extract blocks (paragraphs, tables, and block-level SDTs) from a
 * ProseMirror document or block-containing node.
 */
function extractBlocks(pmDoc: PMNode): BlockContent[] {
  const blocks: BlockContent[] = [];
  let pendingAnchoredTextBoxRuns: Run[] = [];

  const flushPendingTextBoxes = (): void => {
    for (const run of pendingAnchoredTextBoxRuns) {
      blocks.push({
        type: 'paragraph',
        content: [run],
      });
    }
    pendingAnchoredTextBoxRuns = [];
  };

  pmDoc.forEach((node) => {
    if (node.type.name === 'paragraph') {
      const paragraph = convertPMParagraph(node);
      if (pendingAnchoredTextBoxRuns.length > 0) {
        paragraph.content = [...pendingAnchoredTextBoxRuns, ...paragraph.content];
        pendingAnchoredTextBoxRuns = [];
      }
      blocks.push(paragraph);
    } else if (node.type.name === 'table') {
      flushPendingTextBoxes();
      blocks.push(convertPMTable(node));
    } else if (node.type.name === 'blockSdt') {
      flushPendingTextBoxes();
      blocks.push(convertPMBlockSdt(node));
    } else if (node.type.name === 'textBox') {
      const attrs = node.attrs as TextBoxAttrs;
      if (shouldExportTextBoxInsideFollowingParagraph(attrs)) {
        pendingAnchoredTextBoxRuns.push(convertPMTextBoxRun(node));
      } else {
        flushPendingTextBoxes();
        blocks.push(convertPMTextBox(node));
      }
    } else if (node.type.name === 'pageBreak') {
      flushPendingTextBoxes();
      // Convert page break node to a paragraph with a page break run
      blocks.push(createPageBreakParagraph());
    }
  });

  flushPendingTextBoxes();

  return blocks;
}

/**
 * Reconstruct a {@link BlockSdt} model node from a `blockSdt` PM node:
 * project the attrs back to {@link SdtProperties} (the captured raw `sdtPr`
 * rides along for lossless serialization) and recurse into the children.
 */
function convertPMBlockSdt(node: PMNode): BlockSdt {
  return {
    type: 'blockSdt',
    properties: sdtAttrsToProps(node.attrs as Record<string, unknown>),
    content: extractBlocks(node),
  };
}

/**
 * Create a paragraph containing only a page break run (for DOCX serialization)
 */
function createPageBreakParagraph(): Paragraph {
  const breakContent: BreakContent = { type: 'break', breakType: 'page' };
  const run: Run = { type: 'run', content: [breakContent] };
  return {
    type: 'paragraph',
    content: [run],
  };
}

/**
 * Update a Document with content from a ProseMirror document
 * Preserves all non-content parts of the original document
 */
export function updateDocumentContent(originalDocument: Document, pmDoc: PMNode): Document {
  return fromProseDoc(pmDoc, originalDocument);
}

/**
 * Convert a ProseMirror document back to an array of Paragraph/Table blocks.
 * Used for converting edited header/footer PM content back to the document model.
 */
export function proseDocToBlocks(pmDoc: PMNode): BlockContent[] {
  return extractBlocks(pmDoc);
}
