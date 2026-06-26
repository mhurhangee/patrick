/**
 * Block Content Parser - Shared parser for OOXML block-level content
 *
 * The document body (w:body), headers (w:hdr), footers (w:ftr) and SDT content
 * all share the same content model: a sequence of block-level elements
 * (w:p, w:tbl, w:sdt) — ECMA-376 `EG_BlockLevelElts`. Parsing them through one
 * function keeps body and header/footer in lockstep: any block-level feature
 * (text-box enrichment, bullet-glyph resolution) applies everywhere a Word
 * user can place content, instead of silently working in the body only.
 *
 * OOXML Reference:
 * - Body: w:body — CT_Body
 * - Header/footer: w:hdr / w:ftr — CT_HdrFtr
 * - Content: w:p (paragraphs), w:tbl (tables), w:sdt (structured document tags)
 */

import type {
  Paragraph,
  Shape,
  ShapeContent,
  Theme,
  RelationshipMap,
  MediaFile,
  BlockContent,
  BlockSdt,
} from '../types/document';
import type { StyleMap } from './styleParser';
import type { NumberingMap } from './numberingParser';
import { findChild, findDeep, getChildElements, getLocalName, type XmlElement } from './xmlParser';
import { parseSdtProperties } from './sdtProperties';
import { parseParagraph } from './paragraphParser';
import { parseTable } from './tableParser';
import {
  isTextBoxDrawing,
  parseTextBox,
  getTextBoxContentElement,
  parseTextBoxContent,
} from './textBoxParser';

// ============================================================================
// BULLET MARKER CONVERSION
// ============================================================================

/**
 * Symbol/Wingdings glyph code points → Unicode bullet equivalents. DOCX bullet
 * lists often carry a glyph from a Symbol-family font; mapping it keeps the
 * bullet visible without that font installed.
 */
const SYMBOL_BULLET_MAP: Record<number, string> = {
  // Symbol font
  0x00b7: '•', // Middle dot → bullet
  0x006f: '○', // lowercase o → white circle (used in Symbol font)
  0x00a7: '■', // Section sign → black square (Symbol)
  0x00fc: '✓', // Checkmark in Symbol/Wingdings

  // Wingdings mappings (character codes when Wingdings not available)
  0x006e: '■', // Wingdings n → black square
  0x0071: '○', // Wingdings q → white circle
  0x0075: '◆', // Wingdings u → black diamond
  0x0076: '❖', // Wingdings v → diamond
  0x00a8: '✓', // Wingdings checkmark
  0x00fb: '✓', // Checkmark
  0x00fe: '✓', // Checkmark variant

  // Common control characters that might appear
  0xf0b7: '•', // Private use area bullet
  0xf06e: '■', // Private use area square
  0xf06f: '○', // Private use area circle
  0xf0a7: '■', // Private use area
  0xf0fc: '✓', // Private use area checkmark

  // Other common bullet-like characters
  0x2022: '•', // Already a bullet
  0x25cf: '●', // Black circle
  0x25cb: '○', // White circle
  0x25a0: '■', // Black square
  0x25a1: '□', // White square
  0x25c6: '◆', // Black diamond
  0x25c7: '◇', // White diamond
  0x2013: '–', // En dash
  0x2014: '—', // Em dash
  0x003e: '>', // Greater than (used as arrow)
  0x002d: '-', // Hyphen
};

/**
 * Convert Symbol font bullet characters to Unicode equivalents
 *
 * DOCX often uses characters from Symbol, Wingdings, or Webdings fonts
 * that don't render correctly without the font. This maps them to
 * standard Unicode bullets that work with any font.
 */
export function convertBulletToUnicode(bulletChar: string): string {
  // If empty or whitespace, use standard bullet
  if (!bulletChar || bulletChar.trim() === '') {
    return '•';
  }

  // Get the character code
  const charCode = bulletChar.charCodeAt(0);

  // Check if we have a mapping for this character
  if (SYMBOL_BULLET_MAP[charCode]) {
    return SYMBOL_BULLET_MAP[charCode];
  }

  // If it's in the private use area (often Symbol/Wingdings), use bullet
  if (charCode >= 0xe000 && charCode <= 0xf8ff) {
    return '•';
  }

  // If it's a control character or non-printable, use bullet
  if (charCode < 32 || (charCode >= 127 && charCode < 160)) {
    return '•';
  }

  // Otherwise, use the character as-is (might be a valid Unicode bullet)
  return bulletChar;
}

/**
 * Convert bullet markers (raw lvlText, often a Symbol-font glyph) to Unicode.
 *
 * Numbered list resolution lives in `toFlowBlocks.computeListMarker` so that
 * body, table-cell, and text-box paragraphs share one counter map. Doing it
 * here for body-only would double-resolve and desync counters across
 * containers.
 */
function resolveBulletMarker(paragraph: Paragraph): void {
  const listRendering = paragraph.listRendering;
  if (!listRendering) return;
  if (!listRendering.isBullet) return;
  listRendering.marker = convertBulletToUnicode(listRendering.marker || '');
}

// ============================================================================
// TEXT BOX ENRICHMENT
// ============================================================================

/**
 * Enrich a parsed paragraph with text box content from its raw XML.
 *
 * During initial parsing, w:drawing elements containing text boxes (wps:wsp with wps:txbx)
 * are skipped because parseImage returns null for non-image drawings. This function does
 * a second pass over the raw XML to find text box drawings, parse them with their content,
 * and inject ShapeContent into the paragraph's runs.
 */
function enrichParagraphTextBoxes(
  paragraph: Paragraph,
  paraXml: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  numbering: NumberingMap | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null
): void {
  // Early exit: skip paragraphs with no runs (most paragraphs have no text boxes)
  if (paragraph.content.length === 0) return;

  const xmlChildren = getChildElements(paraXml);

  // Track which run we're on (to match XML runs with parsed runs)
  let runIndex = 0;

  // Walk into <mc:AlternateContent> wrappers too: Word stores anchored
  // wps:wsp text boxes inside Choice Requires="wps" (Fallback is VML).
  function processDrawing(drawingEl: XmlElement): void {
    if (!isTextBoxDrawing(drawingEl)) return;

    const textBox = parseTextBox(drawingEl);
    if (!textBox) return;

    // Navigate to wps:wsp to get the txbxContent element
    const wsp = findDeep(drawingEl, 'wps', 'wsp');
    if (wsp) {
      const txbxContentEl = getTextBoxContentElement(wsp);
      if (txbxContentEl) {
        textBox.content = parseTextBoxContent(
          txbxContentEl,
          parseParagraph,
          null, // table parser not needed for most text boxes
          styles,
          theme,
          numbering,
          rels ?? undefined,
          media ?? undefined
        );
      }
    }

    // Convert to Shape with textBody and inject as ShapeContent
    const shape: Shape = {
      type: 'shape',
      shapeType: 'rect',
      size: textBox.size,
      position: textBox.position,
      wrap: textBox.wrap,
      fill: textBox.fill,
      outline: textBox.outline,
      textBody: {
        content: textBox.content,
        margins: textBox.margins,
      },
    };
    if (textBox.id) shape.id = textBox.id;

    const shapeContent: ShapeContent = { type: 'shape', shape };

    // Clamp to the last parsed run: runIndex can outrun paragraph.content
    // when an <w:r> contributes nothing parseable. Best-effort attachment —
    // anchored boxes are off-flow, so the owning run matters less than
    // keeping the shape from being dropped.
    let targetIdx = runIndex;
    if (targetIdx >= paragraph.content.length) {
      targetIdx = -1;
      for (let i = paragraph.content.length - 1; i >= 0; i--) {
        if (paragraph.content[i].type === 'run') {
          targetIdx = i;
          break;
        }
      }
    }
    if (targetIdx >= 0) {
      const parsedContent = paragraph.content[targetIdx];
      if (parsedContent.type === 'run') {
        parsedContent.content.push(shapeContent);
      }
    }
  }

  for (const xmlChild of xmlChildren) {
    if (getLocalName(xmlChild.name ?? '') !== 'r') continue;

    const runElements = getChildElements(xmlChild);
    for (const runEl of runElements) {
      const localName = getLocalName(runEl.name ?? '');
      if (localName === 'drawing') {
        processDrawing(runEl);
      } else if (localName === 'AlternateContent') {
        // Prefer the wps Choice branch (modern wps:wsp shapes); fall back
        // to the Fallback branch only if no Choice is present.
        const branches = getChildElements(runEl);
        const choiceEl = branches.find((el) => getLocalName(el.name ?? '') === 'Choice');
        const targetEl =
          choiceEl ?? branches.find((el) => getLocalName(el.name ?? '') === 'Fallback');
        if (targetEl) {
          for (const innerEl of getChildElements(targetEl)) {
            if (getLocalName(innerEl.name ?? '') === 'drawing') {
              processDrawing(innerEl);
            }
          }
        }
      }
    }

    runIndex++;
  }
}

// ============================================================================
// BLOCK CONTENT PARSING
// ============================================================================

/**
 * Parse block-level content from a container element (w:body, w:hdr, w:ftr, or
 * w:sdtContent).
 *
 * Handles paragraphs (with text-box enrichment + bullet-glyph resolution),
 * tables, and structured document tags (recursively flattened). Section
 * properties (w:sectPr) are skipped here — the body builds sections in a
 * separate pass.
 *
 * @param parent - Parent element containing the block-level content
 * @param styles - Style map
 * @param theme - Theme
 * @param numbering - Numbering definitions
 * @param rels - Relationships
 * @param media - Media files
 * @param options - When `inHeaderFooter` is set, propagates into
 *   `parseParagraph` / `parseTable` so header/footer paragraphs (which reflow
 *   per page) skip rendered-page-break detection.
 * @returns Array of paragraphs and tables
 */
export function parseBlockContent(
  parent: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  numbering: NumberingMap | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null,
  options?: { inHeaderFooter?: boolean }
): BlockContent[] {
  const content: BlockContent[] = [];
  const children = getChildElements(parent);

  for (const child of children) {
    const name = child.name ?? '';

    // Paragraph (w:p)
    if (name === 'w:p' || name.endsWith(':p')) {
      const paragraph = parseParagraph(child, styles, theme, numbering, rels, media, options);
      // Enrich with text box content (parsed in a second pass to avoid circular deps)
      enrichParagraphTextBoxes(paragraph, child, styles, theme, numbering, rels, media);
      // Convert bullet glyphs (Symbol font → Unicode). Numbered marker
      // resolution happens later in toFlowBlocks where body, table, and
      // text-box paragraphs share one counter map.
      resolveBulletMarker(paragraph);
      content.push(paragraph);
    }
    // Table (w:tbl)
    else if (name === 'w:tbl' || name.endsWith(':tbl')) {
      const table = parseTable(child, styles, theme, numbering, rels, media, options);
      content.push(table);
    }
    // Structured Document Tag (w:sdt) — preserve as a BlockSdt wrapper so the
    // content control, its properties, and identity survive the round trip.
    else if (name === 'w:sdt' || name.endsWith(':sdt')) {
      content.push(parseBlockSdt(child, styles, theme, numbering, rels, media, options));
    }
    // Section properties (w:sectPr) - handled separately at body level
    // Skip here as we handle it after content parsing
  }

  return content;
}

/**
 * Parse a block-level Structured Document Tag (`w:sdt`) into a {@link BlockSdt}.
 *
 * Captures the `w:sdtPr`/`w:sdtEndPr` properties (verbatim for round-trip) and
 * recurses through `parseBlockContent` so nested block SDTs, tables, and
 * run-level content inside `w:sdtContent` are preserved rather than flattened.
 */
function parseBlockSdt(
  sdt: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  numbering: NumberingMap | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null,
  options?: { inHeaderFooter?: boolean }
): BlockSdt {
  const sdtPr = findChild(sdt, 'w', 'sdtPr');
  const sdtEndPr = findChild(sdt, 'w', 'sdtEndPr');
  const sdtContent = findChild(sdt, 'w', 'sdtContent');
  const properties = parseSdtProperties(sdtPr, sdtEndPr);
  const content = sdtContent
    ? parseBlockContent(sdtContent, styles, theme, numbering, rels, media, options)
    : [];
  return { type: 'blockSdt', properties, content };
}
