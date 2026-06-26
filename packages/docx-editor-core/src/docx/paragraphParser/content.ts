/**
 * Paragraph inline-content parsers.
 *
 * Walks a w:p element's children and produces a `ParagraphContent[]`. Owns
 * the field state machine (`<w:fldChar>` begin/separate/end), tracked-change
 * wrappers (ins / del / moveFrom / moveTo), SDTs, math, hyperlinks, bookmarks,
 * comment ranges, and the rendered-page-break detector consumed by the main
 * paragraph orchestrator.
 */

import type {
  ParagraphContent,
  ParagraphFormatting,
  ParagraphPropertyChange,
  Run,
  Hyperlink,
  BookmarkStart,
  BookmarkEnd,
  SimpleField,
  ComplexField,
  FieldType,
  Theme,
  RelationshipMap,
  MediaFile,
  InlineSdt,
  Insertion,
  Deletion,
  MoveFrom,
  MoveTo,
  TrackedChangeInfo,
  MathEquation,
} from '../../types/document';
import type { StyleMap } from '../styleParser';
import type { NumberingMap } from '../numberingParser';
import {
  findChild,
  findChildren,
  getAttribute,
  getChildElements,
  elementToXml,
  type XmlElement,
} from '../xmlParser';
import { parseRun } from '../runParser';
import { parseHyperlink as parseHyperlinkFromModule } from '../hyperlinkParser';
import {
  parseBookmarkStart as parseBookmarkStartFromModule,
  parseBookmarkEnd as parseBookmarkEndFromModule,
} from '../bookmarkParser';
import { parseParagraphProperties } from './properties';
import { parseSdtProperties } from '../sdtProperties';

/**
 * Extract plain text from a math element (recursive text content extraction)
 */
function extractMathText(el: XmlElement): string {
  let text = '';
  if (el.type === 'text' && typeof el.text === 'string') {
    return el.text;
  }
  if (el.elements) {
    for (const child of el.elements) {
      // m:t elements contain the actual math text
      const childName = child.name?.replace(/^.*:/, '') ?? '';
      if (childName === 't' && child.elements) {
        for (const t of child.elements) {
          if (t.type === 'text' && typeof t.text === 'string') {
            text += t.text;
          }
        }
      } else {
        text += extractMathText(child);
      }
    }
  }
  return text;
}

// ============================================================================
// RENDERED PAGE BREAK DETECTION
// ============================================================================

/**
 * Get the local name of an element (without namespace prefix)
 */
function getLocalName(name: string | undefined): string {
  if (!name) return '';
  const colonIndex = name.indexOf(':');
  return colonIndex >= 0 ? name.substring(colonIndex + 1) : name;
}

/**
 * Walks a paragraph (and recurses through inline wrappers like hyperlink,
 * smartTag, sdt, fldSimple, ins, del) looking for the first piece of visible
 * run content. Returns true when a `<w:lastRenderedPageBreak/>` precedes
 * that visible content — i.e. Word recorded a page break before this
 * paragraph. Also returns true on a leading hard `<w:br w:type="page"/>`
 * placed before any visible content.
 */
export function paragraphStartsWithRenderedPageBreak(node: XmlElement): boolean {
  // Wrappers that just contain runs at this layer; recurse into them.
  const inlineWrappers = new Set([
    'hyperlink',
    'smartTag',
    'sdt',
    'sdtContent',
    'fldSimple',
    'customXml',
    'ins',
    'del',
    'moveFrom',
    'moveTo',
  ]);
  // Sub-paragraph markers that don't carry visible content; skip past them.
  const nonContentMarkers = new Set([
    'pPr',
    'proofErr',
    'bookmarkStart',
    'bookmarkEnd',
    'commentRangeStart',
    'commentRangeEnd',
    'commentReference',
    'permStart',
    'permEnd',
    'rsidR',
  ]);
  // Run children that count as visible content (cursor renders something).
  const visibleRunContent = new Set([
    't',
    'tab',
    'br',
    'cr',
    'sym',
    'drawing',
    'pict',
    'object',
    'softHyphen',
    'noBreakHyphen',
    'fldChar',
    'instrText',
    'pgNum',
    'separator',
    'continuationSeparator',
    'footnoteRef',
    'endnoteRef',
    'footnoteReference',
    'endnoteReference',
    'ptab',
    'monthShort',
    'monthLong',
    'yearShort',
    'yearLong',
    'dayShort',
    'dayLong',
  ]);

  type Result = 'forced' | 'visible' | 'continue';
  let sawRenderedPageBreak = false;

  function visit(el: XmlElement): Result {
    for (const child of getChildElements(el)) {
      const childName = getLocalName(child.name);
      if (nonContentMarkers.has(childName)) continue;
      if (childName === 'lastRenderedPageBreak') {
        sawRenderedPageBreak = true;
        continue;
      }

      if (childName === 'r') {
        for (const runChild of getChildElements(child)) {
          const runChildName = getLocalName(runChild.name);
          if (runChildName === 'rPr') continue;
          if (runChildName === 'lastRenderedPageBreak') {
            sawRenderedPageBreak = true;
            continue;
          }
          if (runChildName === 'br' && getAttribute(runChild, 'w', 'type') === 'page') {
            // A hard page break is itself a forced break — mark unconditionally.
            return 'forced';
          }
          if (visibleRunContent.has(runChildName)) {
            return 'visible';
          }
        }
        // Empty run (only rPr or skipped markers) — keep scanning siblings.
        continue;
      }

      if (inlineWrappers.has(childName)) {
        const r = visit(child);
        if (r !== 'continue') return r;
        continue;
      }

      // Anything else (an unexpected sub-element) is treated as a stop —
      // we can't know whether to count it as visible content.
      return 'continue';
    }
    return 'continue';
  }

  const outcome = visit(node);
  if (outcome === 'forced') return true;
  if (outcome === 'visible') return sawRenderedPageBreak;
  return false;
}

// ============================================================================
// TRACKED CHANGE PARSING
// ============================================================================

type TrackedChangeParseContext = 'default' | 'deletion';

function replaceLocalName(name: string | undefined, localName: string): string {
  if (!name) {
    return `w:${localName}`;
  }
  const colonIndex = name.indexOf(':');
  if (colonIndex < 0) {
    return localName;
  }
  return `${name.substring(0, colonIndex + 1)}${localName}`;
}

function normalizeDeletionContentElement(node: XmlElement): XmlElement {
  if (node.type !== 'element') {
    return node;
  }

  const localName = getLocalName(node.name);
  let mappedName = node.name;

  if (localName === 'delText') {
    mappedName = replaceLocalName(node.name, 't');
  } else if (localName === 'delInstrText') {
    mappedName = replaceLocalName(node.name, 'instrText');
  }

  return {
    ...node,
    name: mappedName,
    elements: node.elements?.map(normalizeDeletionContentElement),
  };
}

function parseTrackedChangeInfo(node: XmlElement): TrackedChangeInfo {
  const rawId = getAttribute(node, 'w', 'id');
  const parsedId = rawId ? parseInt(rawId, 10) : 0;
  const rawAuthor = getAttribute(node, 'w', 'author');
  const rawDate = getAttribute(node, 'w', 'date');
  const author = rawAuthor?.trim() ?? '';
  const date = rawDate?.trim() ?? '';

  return {
    id: Number.isInteger(parsedId) && parsedId >= 0 ? parsedId : 0,
    author: author.length > 0 ? author : 'Unknown',
    date: date.length > 0 ? date : undefined,
  };
}

function parsePropertyChangeInfo(node: XmlElement): ParagraphPropertyChange['info'] {
  // `CT_PPrChange` extends `CT_TrackChange` (wml.xsd:803,920); the schema does
  // NOT add a `w:rsid` attribute group. Earlier code parsed and round-tripped
  // it, but emitting it on `<w:pPrChange>` is schema-invalid. Drop on parse so
  // a round-trip can never re-emit it.
  return parseTrackedChangeInfo(node);
}

export function parseParagraphPropertyChanges(
  pPr: XmlElement | null,
  theme: Theme | null,
  styles: StyleMap | null,
  currentFormatting: ParagraphFormatting | undefined
): ParagraphPropertyChange[] | undefined {
  if (!pPr) return undefined;

  const changes = findChildren(pPr, 'w', 'pPrChange')
    .map((changeElement): ParagraphPropertyChange => {
      const previousPPr = findChild(changeElement, 'w', 'pPr');
      return {
        type: 'paragraphPropertyChange',
        info: parsePropertyChangeInfo(changeElement),
        previousFormatting: parseParagraphProperties(previousPPr, theme, styles ?? undefined),
        currentFormatting,
      };
    })
    .filter((change) => change.previousFormatting || change.currentFormatting);

  return changes.length > 0 ? changes : undefined;
}

// ============================================================================
// HYPERLINK / BOOKMARK / FIELD WRAPPERS
// ============================================================================

/**
 * Parse hyperlink element (w:hyperlink)
 *
 * Delegates to hyperlinkParser module which resolves URLs via relationships.
 */
function parseHyperlink(
  node: XmlElement,
  rels: RelationshipMap | null,
  styles: StyleMap | null,
  theme: Theme | null,
  media: Map<string, MediaFile> | null
): Hyperlink {
  return parseHyperlinkFromModule(node, rels, styles, theme, media);
}

/**
 * Parse bookmark start (w:bookmarkStart)
 * Delegates to bookmarkParser module.
 */
function parseBookmarkStart(node: XmlElement): BookmarkStart {
  return parseBookmarkStartFromModule(node);
}

/**
 * Parse bookmark end (w:bookmarkEnd)
 * Delegates to bookmarkParser module.
 */
function parseBookmarkEnd(node: XmlElement): BookmarkEnd {
  return parseBookmarkEndFromModule(node);
}

/**
 * Parse field type from instruction string
 */
function parseFieldType(instruction: string): FieldType {
  // Extract the field name (first word)
  const match = instruction.trim().match(/^\\?([A-Z]+)/i);
  if (!match) return 'UNKNOWN';

  const fieldName = match[1].toUpperCase();

  const knownFields: FieldType[] = [
    'PAGE',
    'NUMPAGES',
    'NUMWORDS',
    'NUMCHARS',
    'DATE',
    'TIME',
    'CREATEDATE',
    'SAVEDATE',
    'PRINTDATE',
    'AUTHOR',
    'TITLE',
    'SUBJECT',
    'KEYWORDS',
    'COMMENTS',
    'FILENAME',
    'FILESIZE',
    'TEMPLATE',
    'DOCPROPERTY',
    'DOCVARIABLE',
    'REF',
    'PAGEREF',
    'NOTEREF',
    'HYPERLINK',
    'TOC',
    'TOA',
    'INDEX',
    'SEQ',
    'STYLEREF',
    'AUTONUM',
    'AUTONUMLGL',
    'AUTONUMOUT',
    'IF',
    'MERGEFIELD',
    'NEXT',
    'NEXTIF',
    'ASK',
    'SET',
    'QUOTE',
    'INCLUDETEXT',
    'INCLUDEPICTURE',
    'SYMBOL',
    'ADVANCE',
    'EDITTIME',
    'REVNUM',
    'SECTION',
    'SECTIONPAGES',
    'USERADDRESS',
    'USERNAME',
    'USERINITIALS',
  ];

  if (knownFields.includes(fieldName as FieldType)) {
    return fieldName as FieldType;
  }

  return 'UNKNOWN';
}

/**
 * Parse simple field (w:fldSimple)
 */
function parseSimpleField(
  node: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null
): SimpleField {
  const instruction = getAttribute(node, 'w', 'instr') ?? '';
  const fieldType = parseFieldType(instruction);

  const field: SimpleField = {
    type: 'simpleField',
    instruction,
    fieldType,
    content: [],
  };

  // Check for fldLock
  const fldLock = getAttribute(node, 'w', 'fldLock');
  if (fldLock === '1' || fldLock === 'true') {
    field.fldLock = true;
  }

  // Check for dirty
  const dirty = getAttribute(node, 'w', 'dirty');
  if (dirty === '1' || dirty === 'true') {
    field.dirty = true;
  }

  // Parse child runs (the display value)
  const children = getChildElements(node);
  for (const child of children) {
    const localName = getLocalName(child.name);
    if (localName === 'r') {
      field.content.push(parseRun(child, styles, theme, rels, media));
    }
  }

  return field;
}

// ============================================================================
// MAIN CONTENT WALKER
// ============================================================================

/**
 * Parse all content within a paragraph
 *
 * Returns the parsed content and any complex fields that span multiple runs
 */
export function parseParagraphContents(
  paraElement: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  _numbering: NumberingMap | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null,
  trackedContext: TrackedChangeParseContext = 'default'
): ParagraphContent[] {
  const contents: ParagraphContent[] = [];
  const children = getChildElements(paraElement);

  // State for tracking complex fields
  let inComplexField = false;
  let complexFieldInstr = '';
  let complexFieldCodeRuns: Run[] = [];
  let complexFieldResultRuns: Run[] = [];
  let afterSeparator = false;
  let complexFieldLock = false;
  let complexFieldDirty = false;
  let complexFieldFormatting: Run['formatting'] | undefined;

  for (const child of children) {
    const localName = getLocalName(child.name);

    switch (localName) {
      case 'r': {
        // Check for field characters in this run
        const runElement =
          trackedContext === 'deletion' ? normalizeDeletionContentElement(child) : child;
        const run = parseRun(runElement, styles, theme, rels, media);

        // Look for field characters
        let hasFieldBegin = false;
        let hasFieldSeparate = false;
        let hasFieldEnd = false;
        let instrText = '';

        for (const content of run.content) {
          if (content.type === 'fieldChar') {
            if (content.charType === 'begin') {
              hasFieldBegin = true;
              if (content.fldLock) complexFieldLock = true;
              if (content.dirty) complexFieldDirty = true;
            } else if (content.charType === 'separate') {
              hasFieldSeparate = true;
            } else if (content.charType === 'end') {
              hasFieldEnd = true;
            }
          } else if (content.type === 'instrText') {
            instrText += content.text;
          }
        }

        if (hasFieldBegin) {
          // Starting a new complex field
          inComplexField = true;
          afterSeparator = false;
          complexFieldInstr = '';
          complexFieldCodeRuns = [];
          complexFieldResultRuns = [];
          complexFieldLock = false;
          complexFieldDirty = false;
          // The structural run carrying `begin` holds the field's run
          // properties. Capture them so the result keeps its formatting even
          // when there is no separate result run to read it from.
          complexFieldFormatting = run.formatting;
        }

        if (inComplexField) {
          if (instrText) {
            complexFieldInstr += instrText;
          }
          // Prefer any field run that actually carries formatting (the begin
          // run is often empty in docs that put `w:rPr` on a later code run).
          if (!complexFieldFormatting && run.formatting) {
            complexFieldFormatting = run.formatting;
          }

          if (hasFieldSeparate) {
            afterSeparator = true;
          }

          if (afterSeparator && !hasFieldEnd) {
            // Add to result runs (excluding the separator run itself)
            if (!hasFieldSeparate) {
              complexFieldResultRuns.push(run);
            }
          } else if (!afterSeparator && !hasFieldBegin) {
            // Add to code runs
            complexFieldCodeRuns.push(run);
          }

          if (hasFieldEnd) {
            // Close the complex field
            const complexField: ComplexField = {
              type: 'complexField',
              instruction: complexFieldInstr.trim(),
              fieldType: parseFieldType(complexFieldInstr),
              fieldCode: complexFieldCodeRuns,
              fieldResult: complexFieldResultRuns,
            };

            if (complexFieldFormatting) complexField.formatting = complexFieldFormatting;
            if (complexFieldLock) complexField.fldLock = true;
            if (complexFieldDirty) complexField.dirty = true;

            contents.push(complexField);
            inComplexField = false;
          }
        } else {
          // Regular run, not part of a field
          contents.push(run);
        }
        break;
      }

      case 'hyperlink':
        contents.push(parseHyperlink(child, rels, styles, theme, media));
        break;

      case 'bookmarkStart':
        contents.push(parseBookmarkStart(child));
        break;

      case 'bookmarkEnd':
        contents.push(parseBookmarkEnd(child));
        break;

      case 'fldSimple':
        contents.push(parseSimpleField(child, styles, theme, rels, media));
        break;

      case 'pPr':
        // Already handled separately
        break;

      case 'proofErr':
      case 'permStart':
      case 'permEnd':
      case 'customXml':
        // Skip these elements
        break;

      case 'sdt': {
        // Structured document tag - extract properties and content
        const sdtPr = (child.elements ?? []).find(
          (el: XmlElement) =>
            el.type === 'element' && (el.name === 'w:sdtPr' || el.name?.endsWith(':sdtPr'))
        );
        const sdtContentEl = (child.elements ?? []).find(
          (el: XmlElement) =>
            el.type === 'element' &&
            (el.name === 'w:sdtContent' || el.name?.endsWith(':sdtContent'))
        );
        if (sdtContentEl) {
          const sdtParsed = parseParagraphContents(
            sdtContentEl,
            styles,
            theme,
            null,
            rels,
            media,
            trackedContext
          );
          const properties = parseSdtProperties(sdtPr ?? null);
          const inlineSdt: InlineSdt = {
            type: 'inlineSdt',
            properties,
            content: sdtParsed.filter(
              (c): c is InlineSdt['content'][number] =>
                c.type === 'run' ||
                c.type === 'hyperlink' ||
                c.type === 'simpleField' ||
                c.type === 'complexField' ||
                c.type === 'inlineSdt' ||
                c.type === 'mathEquation'
            ),
          };
          contents.push(inlineSdt);
        }
        break;
      }

      case 'ins': {
        // Track change: insertion — parse content and wrap
        const insInfo = parseTrackedChangeInfo(child);
        const insContent = parseParagraphContents(child, styles, theme, null, rels, media);
        const insertion: Insertion = {
          type: 'insertion',
          info: insInfo,
          content: insContent.filter(
            (c): c is Run | Hyperlink => c.type === 'run' || c.type === 'hyperlink'
          ),
        };
        contents.push(insertion);
        break;
      }
      case 'del': {
        // Track change: deletion — parse content and wrap
        const delInfo = parseTrackedChangeInfo(child);
        const delContent = parseParagraphContents(
          child,
          styles,
          theme,
          null,
          rels,
          media,
          'deletion'
        );
        const deletion: Deletion = {
          type: 'deletion',
          info: delInfo,
          content: delContent.filter(
            (c): c is Run | Hyperlink => c.type === 'run' || c.type === 'hyperlink'
          ),
        };
        contents.push(deletion);
        break;
      }
      case 'moveFrom': {
        const moveFromInfo = parseTrackedChangeInfo(child);
        const moveFromContent = parseParagraphContents(
          child,
          styles,
          theme,
          null,
          rels,
          media,
          'deletion'
        );
        const moveFrom: MoveFrom = {
          type: 'moveFrom',
          info: moveFromInfo,
          content: moveFromContent.filter(
            (c): c is Run | Hyperlink => c.type === 'run' || c.type === 'hyperlink'
          ),
        };
        contents.push(moveFrom);
        break;
      }

      case 'moveTo': {
        const moveToInfo = parseTrackedChangeInfo(child);
        const moveToContent = parseParagraphContents(child, styles, theme, null, rels, media);
        const moveTo: MoveTo = {
          type: 'moveTo',
          info: moveToInfo,
          content: moveToContent.filter(
            (c): c is Run | Hyperlink => c.type === 'run' || c.type === 'hyperlink'
          ),
        };
        contents.push(moveTo);
        break;
      }

      case 'smartTag':
        break;

      case 'moveFromRangeStart': {
        const id = parseInt(getAttribute(child, 'w', 'id') ?? '0', 10);
        const name = getAttribute(child, 'w', 'name') ?? '';
        contents.push({ type: 'moveFromRangeStart', id, name });
        break;
      }
      case 'moveFromRangeEnd': {
        const id = parseInt(getAttribute(child, 'w', 'id') ?? '0', 10);
        contents.push({ type: 'moveFromRangeEnd', id });
        break;
      }
      case 'moveToRangeStart': {
        const id = parseInt(getAttribute(child, 'w', 'id') ?? '0', 10);
        const name = getAttribute(child, 'w', 'name') ?? '';
        contents.push({ type: 'moveToRangeStart', id, name });
        break;
      }
      case 'moveToRangeEnd': {
        const id = parseInt(getAttribute(child, 'w', 'id') ?? '0', 10);
        contents.push({ type: 'moveToRangeEnd', id });
        break;
      }

      case 'commentRangeStart': {
        const commentId = parseInt(getAttribute(child, 'w', 'id') ?? '0', 10);
        contents.push({ type: 'commentRangeStart', id: commentId });
        break;
      }
      case 'commentRangeEnd': {
        const commentId = parseInt(getAttribute(child, 'w', 'id') ?? '0', 10);
        contents.push({ type: 'commentRangeEnd', id: commentId });
        break;
      }

      case 'oMath':
      case 'oMathPara': {
        // Math equations — store raw OMML XML and extract text fallback
        const isBlock = localName === 'oMathPara';
        const ommlXml = elementToXml(child);
        const plainText = extractMathText(child);
        const mathEq: MathEquation = {
          type: 'mathEquation',
          display: isBlock ? 'block' : 'inline',
          ommlXml,
          plainText: plainText || undefined,
        };
        contents.push(mathEq);
        break;
      }

      default:
        // Unknown element - skip
        break;
    }
  }

  return contents;
}
