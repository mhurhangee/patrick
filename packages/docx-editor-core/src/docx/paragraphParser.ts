/**
 * Paragraph Parser - Parse paragraphs (w:p) with complete formatting
 *
 * A paragraph is the fundamental block-level element containing text runs,
 * hyperlinks, bookmarks, and fields.
 *
 * OOXML Reference:
 * - Paragraph: w:p
 * - Paragraph properties: w:pPr
 * - Content: runs, hyperlinks, bookmarks, fields
 *
 * This file owns `parseParagraph` (the orchestrator) and re-exports the
 * other public symbols. Property parsing lives in ./paragraphParser/
 * properties.ts, inline-content parsing in ./content.ts, and read-only
 * predicates/text extraction in ./utilities.ts.
 */

import type {
  Paragraph,
  Theme,
  RelationshipMap,
  MediaFile,
  TrackedChangeInfo,
} from '../types/document';
import type { StyleMap } from './styleParser';
import { computeListRendering, type NumberingMap } from './numberingParser';
import { findChild, getAttribute, type XmlElement } from './xmlParser';
import { normalizeLongHexId } from '../utils/hexId';
import { parseSectionProperties } from './sectionParser';

import { parseParagraphProperties } from './paragraphParser/properties';
import {
  paragraphStartsWithRenderedPageBreak,
  parseParagraphContents,
  parseParagraphPropertyChanges,
} from './paragraphParser/content';

// Public re-exports (preserve historical import surface).
export { parseParagraphProperties } from './paragraphParser/properties';
export {
  getParagraphText,
  isEmptyParagraph,
  isListItem,
  getListLevel,
  hasStyle,
  getTemplateVariable,
} from './paragraphParser/queries';

/**
 * Parse the OOXML tracked-change attribute triple `(w:id, w:author, w:date)`
 * from any element that extends `CT_TrackChange` (e.g. `<w:ins>`, `<w:del>`,
 * `<w:moveFrom>`). `w:id` is required (`xsd:int`); a missing or non-numeric
 * id returns `null`. `w:date` is optional per schema — passed through as-is.
 */
function parseTrackedChangeAttrs(el: XmlElement): TrackedChangeInfo | null {
  const idAttr = getAttribute(el, 'w', 'id');
  if (idAttr == null) return null;
  const id = parseInt(idAttr, 10);
  if (Number.isNaN(id)) return null;
  const author = getAttribute(el, 'w', 'author') ?? '';
  const date = getAttribute(el, 'w', 'date') ?? undefined;
  const info: TrackedChangeInfo = { id, author };
  if (date) info.date = date;
  return info;
}

/**
 * Parse a paragraph element (w:p)
 *
 * @param node - The w:p XML element
 * @param styles - Style map for resolving style references
 * @param theme - Theme for resolving theme colors/fonts
 * @param numbering - Numbering definitions for list info
 * @param rels - Relationship map for resolving hyperlink URLs
 * @param media - Media files map for image data
 * @param options - `inHeaderFooter` skips `<w:lastRenderedPageBreak/>`
 *   detection since headers and footers reflow per page.
 * @returns Parsed Paragraph object
 */
export function parseParagraph(
  node: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  numbering: NumberingMap | null,
  rels: RelationshipMap | null = null,
  media: Map<string, MediaFile> | null = null,
  options?: { inHeaderFooter?: boolean }
): Paragraph {
  const paragraph: Paragraph = {
    type: 'paragraph',
    content: [],
  };

  // Get paragraph ID attributes (Word 2010+ uses these for collaboration).
  // Foreign exporters sometimes emit malformed or out-of-range ids that Word
  // and strict validators reject, so normalize them as they enter the model.
  const paraId = getAttribute(node, 'w14', 'paraId') ?? getAttribute(node, 'w', 'paraId');
  if (paraId) {
    paragraph.paraId = normalizeLongHexId(paraId);
  }

  const textId = getAttribute(node, 'w14', 'textId') ?? getAttribute(node, 'w', 'textId');
  if (textId) {
    paragraph.textId = normalizeLongHexId(textId);
  }

  // `<w:lastRenderedPageBreak/>` only makes sense in body flow; headers and
  // footers reflow per page, so detection is skipped there.
  if (!options?.inHeaderFooter && paragraphStartsWithRenderedPageBreak(node)) {
    paragraph.renderedPageBreakBefore = true;
  }

  // Parse paragraph properties (w:pPr)
  const pPr = findChild(node, 'w', 'pPr');
  if (pPr) {
    paragraph.formatting = parseParagraphProperties(pPr, theme, styles ?? undefined);
    paragraph.propertyChanges = parseParagraphPropertyChanges(
      pPr,
      theme,
      styles,
      paragraph.formatting
    );

    // Paragraph-mark tracked-change markers live inside w:pPr/w:rPr per
    // ECMA-376 §17.13.5 (EG_ParaRPrTrackChanges). They mean "the pilcrow
    // that terminates this paragraph was inserted/deleted as a tracked
    // change," NOT that any run content is tracked.
    const pPrRPr = findChild(pPr, 'w', 'rPr');
    if (pPrRPr) {
      const ins = findChild(pPrRPr, 'w', 'ins');
      if (ins) {
        const info = parseTrackedChangeAttrs(ins);
        if (info) paragraph.pPrIns = info;
      }
      const del = findChild(pPrRPr, 'w', 'del');
      if (del) {
        const info = parseTrackedChangeAttrs(del);
        if (info) paragraph.pPrDel = info;
      }
    }

    // Check for section properties within paragraph (marks end of a section)
    const sectPr = findChild(pPr, 'w', 'sectPr');
    if (sectPr) {
      paragraph.sectionProperties = parseSectionProperties(sectPr, rels);
    }
  }

  // Parse paragraph contents (runs, hyperlinks, bookmarks, fields)
  const rawContent = parseParagraphContents(node, styles, theme, numbering, rels, media);

  // Keep source run boundaries intact. Run positions can anchor comments,
  // tracked changes, and fidelity tooling, so parser-level consolidation would
  // erase information before later round-trip stages have a chance to preserve it.
  paragraph.content = rawContent;

  // Compute list rendering if this is a list item.
  // numPr can come from inline pPr or from the referenced paragraph style.
  let effectiveNumPr = paragraph.formatting?.numPr;
  let numPrFromStyle = false;
  if (!effectiveNumPr && paragraph.formatting?.styleId && styles) {
    const style = styles.get(paragraph.formatting.styleId);
    if (style?.pPr?.numPr) {
      effectiveNumPr = style.pPr.numPr;
      numPrFromStyle = true;
      // Store it on the paragraph formatting so downstream code sees it,
      // and record the provenance so the serializer can drop it again —
      // materializing style numbering as direct <w:numPr> flips Word's
      // level-indent precedence on the saved file.
      if (!paragraph.formatting) paragraph.formatting = {};
      paragraph.formatting.numPr = effectiveNumPr;
      paragraph.formatting.numPrFromStyle = effectiveNumPr;
    }
  }

  if (effectiveNumPr && numbering) {
    const rendering = computeListRendering(effectiveNumPr, numbering);
    if (rendering) {
      paragraph.listRendering = rendering;

      // Apply level's paragraph properties (indentation) as defaults.
      // Per OOXML spec, direct w:ind on the paragraph overrides numbering
      // level indent — only use numbering indent as fallback.
      //
      // When the numbering reference itself comes from the paragraph STYLE
      // (style pPr numPr), Word gives the style chain's own w:ind
      // precedence over the numbering level's — e.g. a "Claim" style with
      // ind left=1134 hanging=1134 referencing a level with 360/360 lays
      // out at 1134. Skip the level indents the style chain covers; the
      // toProseDoc style fallback supplies the style values. Resolution is
      // per group (left vs firstLine/hanging) so a chain that only defines
      // `left` (e.g. ListParagraph) still takes the level's hanging —
      // mirrors listAttrsFromResolvedStyle so the picker and the loader
      // resolve a style identically. Direct paragraph numPr keeps the
      // level-over-style behavior (Word's toolbar-list case).
      const chainInd = numPrFromStyle
        ? styleChainInd(paragraph.formatting?.styleId, styles)
        : { left: false, firstLine: false };
      const level = numbering.getLevel(rendering.numId, rendering.level);
      if (level?.pPr) {
        if (!paragraph.formatting) {
          paragraph.formatting = {};
        }
        const directInd = pPr ? findChild(pPr, 'w', 'ind') : null;
        const hasDirectLeft =
          directInd != null &&
          (getAttribute(directInd, 'w', 'left') !== null ||
            getAttribute(directInd, 'w', 'start') !== null);
        // Per ECMA-376 §17.3.1.12 (CT_Ind), `w:firstLine` and `w:hanging`
        // are ST_TwipsMeasure values; a value of `0` is semantically
        // identical to omitting the attribute. Treat both `firstLine="0"`
        // and `hanging="0"` as no-op so the numbering level's indent
        // still applies. A non-numeric value parses to NaN and falls
        // through as an override, preserving prior behavior on
        // malformed input.
        const hasNonZeroDirectAttr = (name: 'firstLine' | 'hanging'): boolean => {
          const raw = directInd ? getAttribute(directInd, 'w', name) : null;
          if (raw === null) return false;
          const value = parseInt(raw, 10);
          return Number.isNaN(value) || value !== 0;
        };
        const hasDirectFirstLineOrHanging =
          directInd != null &&
          (hasNonZeroDirectAttr('firstLine') || hasNonZeroDirectAttr('hanging'));

        if (!hasDirectLeft && !chainInd.left && level.pPr.indentLeft !== undefined) {
          paragraph.formatting.indentLeft = level.pPr.indentLeft;
        }
        if (!hasDirectFirstLineOrHanging && !chainInd.firstLine) {
          if (level.pPr.indentFirstLine !== undefined) {
            paragraph.formatting.indentFirstLine = level.pPr.indentFirstLine;
          }
          if (level.pPr.hangingIndent !== undefined) {
            paragraph.formatting.hangingIndent = level.pPr.hangingIndent;
          }
        }
      }
    }
  }

  return paragraph;
}

/**
 * Which indent groups the basedOn chain defines: `left` (w:ind left) and
 * `firstLine` (w:ind firstLine/hanging). Walks from the given style up the
 * chain; cycles are guarded. Grouping matches listAttrsFromResolvedStyle.
 */
function styleChainInd(
  styleId: string | undefined,
  styles?: StyleMap | null
): { left: boolean; firstLine: boolean } {
  const result = { left: false, firstLine: false };
  if (!styleId || !styles) return result;
  const seen = new Set<string>();
  let current: string | undefined = styleId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const style = styles.get(current);
    if (!style) break;
    const p = style.pPr;
    if (p) {
      result.left ||= p.indentLeft !== undefined;
      result.firstLine ||= p.indentFirstLine !== undefined || p.hangingIndent !== undefined;
    }
    if (result.left && result.firstLine) break;
    current = style.basedOn;
  }
  return result;
}
