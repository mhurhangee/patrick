/**
 * Paragraph Serializer - Serialize paragraphs to OOXML XML
 *
 * Converts Paragraph objects back to <w:p> XML format for DOCX files.
 * Handles all paragraph properties and child content (runs, hyperlinks, fields, bookmarks).
 *
 * pPr property serializers (borders/shading/tabs/spacing/indentation/
 * numbering/frame) live in `paragraphSerializer/properties.ts`; child
 * content serializers (hyperlinks/fields/SDT/tracked-change wrappers)
 * live in `paragraphSerializer/content.ts`. This file orchestrates
 * paragraph-level serialization and re-exports the public API consumed
 * by sibling serializers.
 *
 * OOXML Reference:
 * - Paragraph: w:p
 * - Paragraph properties: w:pPr
 * - Runs, hyperlinks, bookmarks, fields as child elements
 */

import type {
  Paragraph,
  ParagraphFormatting,
  ParagraphPropertyChange,
  SectionProperties,
  TextFormatting,
  TrackedChangeInfo,
} from '../../types/document';

import { serializeTextFormatting } from './runSerializer';
import { serializeSectionProperties } from './sectionPropertiesSerializer';
import { escapeXml } from './xmlUtils';
import {
  serializeFrameProperties,
  serializeIndentation,
  serializeNumbering,
  serializeParagraphBorders,
  serializeShading,
  serializeSpacing,
  serializeTabStops,
} from './paragraphSerializer/properties';
import { serializeParagraphContent } from './paragraphSerializer/content';

/**
 * Format a tracked-change attribute triple `(w:id, w:author, w:date)` for
 * emission on any `CT_TrackChange` element. `w:date` is omitted when absent
 * per schema (`use="optional"`).
 */
function serializeTrackedChangeAttrs(info: TrackedChangeInfo): string {
  const normalizedId = Number.isInteger(info.id) && info.id >= 0 ? info.id : 0;
  const author =
    typeof info.author === 'string' && info.author.length > 0 ? info.author : 'Unknown';
  const parts = [`w:id="${normalizedId}"`, `w:author="${escapeXml(author)}"`];
  const date = typeof info.date === 'string' && info.date.length > 0 ? info.date : undefined;
  if (date) parts.push(`w:date="${escapeXml(date)}"`);
  return parts.join(' ');
}

/**
 * Build the pPr/rPr element string for a paragraph, merging:
 *   1. Paragraph-mark tracked-change markers (pPrIns / pPrDel) — emitted
 *      FIRST inside w:rPr per EG_ParaRPrTrackChanges ordering (wml.xsd:1837).
 *   2. Default run-properties from `formatting.runProperties`.
 *
 * Returns an empty string if neither side contributes anything. The result
 * still includes the surrounding `<w:rPr>...</w:rPr>` wrapper when non-empty.
 */
function buildParagraphMarkRPr(
  formatting: ParagraphFormatting | undefined,
  pPrIns: TrackedChangeInfo | undefined,
  pPrDel: TrackedChangeInfo | undefined
): string {
  const inner: string[] = [];
  if (pPrIns) {
    inner.push(`<w:ins ${serializeTrackedChangeAttrs(pPrIns)}/>`);
  }
  if (pPrDel) {
    inner.push(`<w:del ${serializeTrackedChangeAttrs(pPrDel)}/>`);
  }
  if (formatting?.runProperties) {
    const rPrXml = serializeTextFormatting(formatting.runProperties);
    if (rPrXml) {
      // serializeTextFormatting returns a wrapped `<w:rPr>...</w:rPr>`; strip
      // the wrapper so we can append its children after our tracked-change
      // elements while keeping the schema-mandated ordering (ins/del first).
      if (rPrXml.startsWith('<w:rPr>') && rPrXml.endsWith('</w:rPr>')) {
        const body = rPrXml.slice('<w:rPr>'.length, -'</w:rPr>'.length);
        if (body.length > 0) inner.push(body);
      } else if (rPrXml.startsWith('<w:rPr/>')) {
        // empty — nothing to append
      } else {
        // Unexpected shape; emit as-is to avoid data loss.
        inner.push(rPrXml);
      }
    }
  }
  if (inner.length === 0) return '';
  return `<w:rPr>${inner.join('')}</w:rPr>`;
}

/**
 * Serialize paragraph formatting properties to w:pPr XML.
 *
 * `options.baseOnly` emits a `CT_PPrBase`-shaped element — no nested `<w:rPr>`
 * (paragraph-mark properties), no nested `<w:pPrChange>`. Use this when
 * emitting the inner `<w:pPr>` of a `<w:pPrChange>` element, which the
 * schema (wml.xsd `CT_PPrChange` / `CT_PPrBase`) restricts to base
 * properties only.
 */
export function serializeParagraphFormatting(
  formatting: ParagraphFormatting | undefined,
  propertyChanges?: ParagraphPropertyChange[],
  pPrIns?: TrackedChangeInfo,
  pPrDel?: TrackedChangeInfo,
  options?: { baseOnly?: boolean; sectionProperties?: SectionProperties }
): string {
  const parts: string[] = [];

  if (formatting) {
    // Style reference (must be first)
    if (formatting.styleId) {
      parts.push(`<w:pStyle w:val="${escapeXml(formatting.styleId)}"/>`);
    }

    // Keep next/lines/widow. Like widowControl below, these emit an explicit
    // `w:val="0"` for `false` so a paragraph that cancels a style-inherited
    // flag round-trips instead of silently re-inheriting it.
    if (formatting.keepNext === true) {
      parts.push('<w:keepNext/>');
    } else if (formatting.keepNext === false) {
      parts.push('<w:keepNext w:val="0"/>');
    }

    if (formatting.keepLines === true) {
      parts.push('<w:keepLines/>');
    } else if (formatting.keepLines === false) {
      parts.push('<w:keepLines w:val="0"/>');
    }

    if (formatting.contextualSpacing === true) {
      parts.push('<w:contextualSpacing/>');
    } else if (formatting.contextualSpacing === false) {
      parts.push('<w:contextualSpacing w:val="0"/>');
    }

    if (formatting.pageBreakBefore === true) {
      parts.push('<w:pageBreakBefore/>');
    } else if (formatting.pageBreakBefore === false) {
      parts.push('<w:pageBreakBefore w:val="0"/>');
    }

    // Frame properties
    const frameXml = serializeFrameProperties(formatting.frame);
    if (frameXml) {
      parts.push(frameXml);
    }

    // Widow control
    if (formatting.widowControl === false) {
      parts.push('<w:widowControl w:val="0"/>');
    } else if (formatting.widowControl === true) {
      parts.push('<w:widowControl/>');
    }

    // Numbering. Skip numPr that still equals its style-sourced value (see
    // ParagraphFormatting.numPrFromStyle) — the parser materialized it from
    // the style and writing it back as direct formatting would flip Word's
    // level-indent precedence on the saved file. Guards the direct
    // serialize-a-parsed-Document path; the PM save path already drops it
    // in fromProseDoc.
    const styleSourcedNumPr =
      formatting.numPrFromStyle != null &&
      JSON.stringify(formatting.numPr) === JSON.stringify(formatting.numPrFromStyle);
    const numPrXml = styleSourcedNumPr ? '' : serializeNumbering(formatting.numPr);
    if (numPrXml) {
      parts.push(numPrXml);
    }

    // Paragraph borders
    const bordersXml = serializeParagraphBorders(formatting.borders);
    if (bordersXml) {
      parts.push(bordersXml);
    }

    // Shading
    const shadingXml = serializeShading(formatting.shading);
    if (shadingXml) {
      parts.push(shadingXml);
    }

    // Tabs
    const tabsXml = serializeTabStops(formatting.tabs);
    if (tabsXml) {
      parts.push(tabsXml);
    }

    // Suppress line numbers
    if (formatting.suppressLineNumbers === true) {
      parts.push('<w:suppressLineNumbers/>');
    } else if (formatting.suppressLineNumbers === false) {
      parts.push('<w:suppressLineNumbers w:val="0"/>');
    }

    // Suppress auto hyphens
    if (formatting.suppressAutoHyphens === true) {
      parts.push('<w:suppressAutoHyphens/>');
    } else if (formatting.suppressAutoHyphens === false) {
      parts.push('<w:suppressAutoHyphens w:val="0"/>');
    }

    // Spacing
    const spacingXml = serializeSpacing(formatting);
    if (spacingXml) {
      parts.push(spacingXml);
    }

    // Indentation
    const indXml = serializeIndentation(formatting);
    if (indXml) {
      parts.push(indXml);
    }

    // Text direction (bidi)
    if (formatting.bidi === true) {
      parts.push('<w:bidi/>');
    } else if (formatting.bidi === false) {
      parts.push('<w:bidi w:val="0"/>');
    }

    // Justification
    if (formatting.alignment) {
      parts.push(`<w:jc w:val="${formatting.alignment}"/>`);
    }

    // Outline level
    if (formatting.outlineLevel !== undefined) {
      parts.push(`<w:outlineLvl w:val="${formatting.outlineLevel}"/>`);
    }
  }

  if (!options?.baseOnly) {
    // Paragraph-mark rPr is built once at the end so tracked-change markers
    // (pPrIns/pPrDel) come first inside <w:rPr> per EG_ParaRPrTrackChanges
    // ordering, followed by any default run-properties from formatting.
    const rPrXml = buildParagraphMarkRPr(formatting, pPrIns ?? undefined, pPrDel ?? undefined);
    if (rPrXml) {
      parts.push(rPrXml);
    }

    // Section properties (mid-body section break carried on `w:pPr/w:sectPr`).
    // CT_PPr ordering puts `<w:sectPr>` after the paragraph-mark `<w:rPr>` and
    // before `<w:pPrChange>`.
    if (options?.sectionProperties) {
      const sectPrXml = serializeSectionProperties(options.sectionProperties);
      if (sectPrXml) {
        parts.push(sectPrXml);
      }
    }

    // OOXML allows at most one `<w:pPrChange>` per `<w:pPr>` (CT_PPr
    // maxOccurs="1"). The model array CAN carry several entries for in-memory
    // history; on disk we emit only the first (the canonical prior snapshot)
    // to stay schema-valid.
    if (propertyChanges && propertyChanges.length > 0) {
      parts.push(serializeParagraphPropertyChange(propertyChanges[0]));
    }
  }

  if (parts.length === 0) return '';

  return `<w:pPr>${parts.join('')}</w:pPr>`;
}

function extractPPrInner(pPrXml: string): string {
  if (!pPrXml.startsWith('<w:pPr>') || !pPrXml.endsWith('</w:pPr>')) {
    return '';
  }
  return pPrXml.slice('<w:pPr>'.length, -'</w:pPr>'.length);
}

function serializeParagraphPropertyChange(change: ParagraphPropertyChange): string {
  const normalizedId = Number.isInteger(change.info.id) && change.info.id >= 0 ? change.info.id : 0;
  const authorCandidate = typeof change.info.author === 'string' ? change.info.author.trim() : '';
  const normalizedAuthor = authorCandidate.length > 0 ? authorCandidate : 'Unknown';
  const normalizedDate = typeof change.info.date === 'string' ? change.info.date.trim() : undefined;
  // NOTE: `w:rsid` is NOT an attribute of `CT_TrackChange` (wml.xsd:803).
  // Some legacy code stored it on `PropertyChangeInfo`, but it must not be
  // emitted on `<w:pPrChange>` — strict OOXML readers reject it.
  const attrs = [`w:id="${normalizedId}"`, `w:author="${escapeXml(normalizedAuthor)}"`];
  if (normalizedDate) {
    attrs.push(`w:date="${escapeXml(normalizedDate)}"`);
  }

  // The inner `<w:pPr>` is constrained to `CT_PPrBase` — no nested rPr,
  // sectPr, or pPrChange. `baseOnly: true` enforces that.
  const previousPPrXml =
    serializeParagraphFormatting(change.previousFormatting, undefined, undefined, undefined, {
      baseOnly: true,
    }) || '<w:pPr/>';
  const previousPPrInner = extractPPrInner(previousPPrXml);
  const normalizedPreviousPPr =
    previousPPrInner.length > 0 ? `<w:pPr>${previousPPrInner}</w:pPr>` : '<w:pPr/>';
  return `<w:pPrChange ${attrs.join(' ')}>${normalizedPreviousPPr}</w:pPrChange>`;
}

/**
 * Serialize a paragraph to OOXML XML (w:p)
 *
 * @param paragraph - The paragraph to serialize
 * @returns XML string for the paragraph
 */
export function serializeParagraph(paragraph: Paragraph): string {
  const parts: string[] = [];

  // Paragraph ID attributes
  const attrs: string[] = [];
  if (paragraph.paraId) {
    attrs.push(`w14:paraId="${paragraph.paraId}"`);
  }
  if (paragraph.textId) {
    attrs.push(`w14:textId="${paragraph.textId}"`);
  }
  const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

  // Add paragraph properties if present
  const pPrXml = serializeParagraphFormatting(
    paragraph.formatting,
    paragraph.propertyChanges,
    paragraph.pPrIns,
    paragraph.pPrDel,
    paragraph.sectionProperties ? { sectionProperties: paragraph.sectionProperties } : undefined
  );
  if (pPrXml) {
    parts.push(pPrXml);
  }

  // Add paragraph content. Marker injection (when `renderedPageBreakBefore`
  // is set) is handled by `injectRenderedPageBreakIntoFirstRun` below.
  let pendingRenderedPageBreak = !!paragraph.renderedPageBreakBefore;
  for (const content of paragraph.content) {
    let contentXml = serializeParagraphContent(content);
    if (!contentXml) continue;
    if (pendingRenderedPageBreak) {
      const next = injectRenderedPageBreakIntoFirstRun(contentXml);
      if (next) {
        contentXml = next;
        pendingRenderedPageBreak = false;
      }
    }
    parts.push(contentXml);
  }

  return `<w:p${attrsStr}>${parts.join('')}</w:p>`;
}

/**
 * Insert `<w:lastRenderedPageBreak/>` after the first `<w:r ...>` opening
 * tag in `xml` (matches runs nested in hyperlink / sdt / ins / del /
 * moveFrom / moveTo / smartTag wrappers). Returns `null` when no `<w:r>`
 * is present so the caller can keep scanning later siblings. The lookahead
 * `(?=[\s>/])` skips `<w:rPr>` and any other prefix-collision tag.
 */
function injectRenderedPageBreakIntoFirstRun(xml: string): string | null {
  const re = /<w:r(?=[\s>/])[^>]*>/;
  if (!re.test(xml)) return null;
  return xml.replace(re, (match) => `${match}<w:lastRenderedPageBreak/>`);
}

/**
 * Serialize multiple paragraphs to OOXML XML
 *
 * @param paragraphs - The paragraphs to serialize
 * @returns XML string for all paragraphs
 */
export function serializeParagraphs(paragraphs: Paragraph[]): string {
  return paragraphs.map(serializeParagraph).join('');
}

/**
 * Check if a paragraph has any content
 */
export function hasParagraphContent(paragraph: Paragraph): boolean {
  return paragraph.content.length > 0;
}

/**
 * Check if a paragraph has formatting
 */
export function hasParagraphFormatting(paragraph: Paragraph): boolean {
  return paragraph.formatting !== undefined && Object.keys(paragraph.formatting).length > 0;
}

/**
 * Get plain text from a paragraph (for comparison/debugging)
 */
export function getParagraphPlainText(paragraph: Paragraph): string {
  const texts: string[] = [];

  for (const content of paragraph.content) {
    if (content.type === 'run') {
      for (const item of content.content) {
        if (item.type === 'text') {
          texts.push(item.text);
        } else if (item.type === 'tab') {
          texts.push('\t');
        } else if (item.type === 'break') {
          texts.push('\n');
        }
      }
    } else if (content.type === 'hyperlink') {
      for (const child of content.children) {
        if (child.type === 'run') {
          for (const item of child.content) {
            if (item.type === 'text') {
              texts.push(item.text);
            }
          }
        }
      }
    } else if (content.type === 'simpleField') {
      for (const item of content.content) {
        if (item.type === 'run') {
          for (const subItem of item.content) {
            if (subItem.type === 'text') {
              texts.push(subItem.text);
            }
          }
        }
      }
    } else if (content.type === 'complexField') {
      for (const run of content.fieldResult) {
        for (const item of run.content) {
          if (item.type === 'text') {
            texts.push(item.text);
          }
        }
      }
    } else if (content.type === 'inlineSdt') {
      for (const item of content.content) {
        if (item.type === 'run') {
          for (const subItem of item.content) {
            if (subItem.type === 'text') {
              texts.push(subItem.text);
            }
          }
        }
      }
    } else if (
      content.type === 'insertion' ||
      content.type === 'deletion' ||
      content.type === 'moveFrom' ||
      content.type === 'moveTo'
    ) {
      for (const item of content.content) {
        if (item.type === 'run') {
          for (const subItem of item.content) {
            if (subItem.type === 'text') {
              texts.push(subItem.text);
            }
          }
        }
      }
    }
  }

  return texts.join('');
}

/**
 * Create an empty paragraph
 */
export function createEmptyParagraph(formatting?: ParagraphFormatting): Paragraph {
  return {
    type: 'paragraph',
    formatting,
    content: [],
  };
}

/**
 * Create a paragraph with a single text run
 */
export function createTextParagraph(
  text: string,
  paragraphFormatting?: ParagraphFormatting,
  textFormatting?: TextFormatting
): Paragraph {
  return {
    type: 'paragraph',
    formatting: paragraphFormatting,
    content: [
      {
        type: 'run',
        formatting: textFormatting,
        content: [{ type: 'text', text }],
      },
    ],
  };
}

/**
 * Check if paragraph is a list item
 */
export function isListParagraph(paragraph: Paragraph): boolean {
  return paragraph.formatting?.numPr !== undefined;
}

/**
 * Get list level of a paragraph (0-8, or -1 if not a list)
 */
export function getListLevel(paragraph: Paragraph): number {
  return paragraph.formatting?.numPr?.ilvl ?? -1;
}

export default serializeParagraph;
