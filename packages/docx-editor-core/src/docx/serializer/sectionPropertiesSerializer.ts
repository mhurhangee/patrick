/**
 * Section Properties Serializer - Serialize w:sectPr
 *
 * Converts SectionProperties back to OOXML `<w:sectPr>`. Used both for the
 * final `w:body/w:sectPr` (last section) and for mid-body section breaks
 * carried on a paragraph via `w:pPr/w:sectPr`.
 *
 * OOXML Reference:
 * - Section properties: w:sectPr (ECMA-376 §17.6.17)
 * - A paragraph-level sectPr (`w:pPr/w:sectPr`) marks the end of a section;
 *   the trailing `w:body/w:sectPr` describes the final section.
 */

import type {
  SectionProperties,
  HeaderReference,
  FooterReference,
  FootnoteProperties,
  EndnoteProperties,
} from '../../types/document';

import { escapeXml, intAttr } from './xmlUtils';
import { serializeBorder } from './borderSerializer';

/**
 * Serialize header reference (w:headerReference)
 */
function serializeHeaderReference(ref: HeaderReference): string {
  const attrs: string[] = [`w:type="${ref.type}"`, `r:id="${ref.rId}"`];

  return `<w:headerReference ${attrs.join(' ')}/>`;
}

/**
 * Serialize footer reference (w:footerReference)
 */
function serializeFooterReference(ref: FooterReference): string {
  const attrs: string[] = [`w:type="${ref.type}"`, `r:id="${ref.rId}"`];

  return `<w:footerReference ${attrs.join(' ')}/>`;
}

/**
 * Serialize footnote properties (w:footnotePr)
 */
function serializeFootnoteProperties(props: FootnoteProperties | undefined): string {
  if (!props) return '';

  const parts: string[] = [];

  if (props.position) {
    parts.push(`<w:pos w:val="${props.position}"/>`);
  }

  if (props.numFmt) {
    parts.push(`<w:numFmt w:val="${props.numFmt}"/>`);
  }

  if (props.numStart !== undefined) {
    parts.push(`<w:numStart w:val="${props.numStart}"/>`);
  }

  if (props.numRestart) {
    parts.push(`<w:numRestart w:val="${props.numRestart}"/>`);
  }

  if (parts.length === 0) return '';

  return `<w:footnotePr>${parts.join('')}</w:footnotePr>`;
}

/**
 * Serialize endnote properties (w:endnotePr)
 */
function serializeEndnoteProperties(props: EndnoteProperties | undefined): string {
  if (!props) return '';

  const parts: string[] = [];

  if (props.position) {
    parts.push(`<w:pos w:val="${props.position}"/>`);
  }

  if (props.numFmt) {
    parts.push(`<w:numFmt w:val="${props.numFmt}"/>`);
  }

  if (props.numStart !== undefined) {
    parts.push(`<w:numStart w:val="${props.numStart}"/>`);
  }

  if (props.numRestart) {
    parts.push(`<w:numRestart w:val="${props.numRestart}"/>`);
  }

  if (parts.length === 0) return '';

  return `<w:endnotePr>${parts.join('')}</w:endnotePr>`;
}

/**
 * Serialize page size (w:pgSz)
 */
function serializePageSize(props: SectionProperties): string {
  const attrs: string[] = [];

  if (props.pageWidth !== undefined) {
    attrs.push(`w:w="${intAttr(props.pageWidth)}"`);
  }

  if (props.pageHeight !== undefined) {
    attrs.push(`w:h="${intAttr(props.pageHeight)}"`);
  }

  if (props.orientation === 'landscape') {
    attrs.push('w:orient="landscape"');
  }

  if (attrs.length === 0) return '';

  return `<w:pgSz ${attrs.join(' ')}/>`;
}

/**
 * Serialize page margins (w:pgMar)
 */
function serializePageMargins(props: SectionProperties): string {
  const attrs: string[] = [];

  if (props.marginTop !== undefined) {
    attrs.push(`w:top="${intAttr(props.marginTop)}"`);
  }

  if (props.marginRight !== undefined) {
    attrs.push(`w:right="${intAttr(props.marginRight)}"`);
  }

  if (props.marginBottom !== undefined) {
    attrs.push(`w:bottom="${intAttr(props.marginBottom)}"`);
  }

  if (props.marginLeft !== undefined) {
    attrs.push(`w:left="${intAttr(props.marginLeft)}"`);
  }

  if (props.headerDistance !== undefined) {
    attrs.push(`w:header="${intAttr(props.headerDistance)}"`);
  }

  if (props.footerDistance !== undefined) {
    attrs.push(`w:footer="${intAttr(props.footerDistance)}"`);
  }

  if (props.gutter !== undefined) {
    attrs.push(`w:gutter="${intAttr(props.gutter)}"`);
  }

  if (attrs.length === 0) return '';

  return `<w:pgMar ${attrs.join(' ')}/>`;
}

/**
 * Serialize columns (w:cols)
 */
function serializeColumns(props: SectionProperties): string {
  if (!props.columnCount && !props.columns?.length) return '';

  const attrs: string[] = [];

  if (props.columnCount !== undefined && props.columnCount > 1) {
    attrs.push(`w:num="${intAttr(props.columnCount)}"`);
  }

  if (props.columnSpace !== undefined) {
    attrs.push(`w:space="${intAttr(props.columnSpace)}"`);
  }

  if (props.equalWidth !== undefined) {
    attrs.push(`w:equalWidth="${props.equalWidth ? '1' : '0'}"`);
  }

  if (props.separator) {
    attrs.push('w:sep="1"');
  }

  // Individual column definitions
  let colElements = '';
  if (props.columns && props.columns.length > 0) {
    colElements = props.columns
      .map((col) => {
        const colAttrs: string[] = [];
        if (col.width !== undefined) {
          colAttrs.push(`w:w="${intAttr(col.width)}"`);
        }
        if (col.space !== undefined) {
          colAttrs.push(`w:space="${intAttr(col.space)}"`);
        }
        return `<w:col ${colAttrs.join(' ')}/>`;
      })
      .join('');
  }

  if (attrs.length === 0 && !colElements) return '';

  const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  return `<w:cols${attrsStr}>${colElements}</w:cols>`;
}

/**
 * Serialize line numbers (w:lnNumType)
 */
function serializeLineNumbers(props: SectionProperties): string {
  if (!props.lineNumbers) return '';

  const ln = props.lineNumbers;
  const attrs: string[] = [];

  if (ln.countBy !== undefined) {
    attrs.push(`w:countBy="${intAttr(ln.countBy)}"`);
  }

  if (ln.start !== undefined) {
    attrs.push(`w:start="${intAttr(ln.start)}"`);
  }

  if (ln.distance !== undefined) {
    attrs.push(`w:distance="${intAttr(ln.distance)}"`);
  }

  if (ln.restart) {
    attrs.push(`w:restart="${ln.restart}"`);
  }

  if (attrs.length === 0) return '';

  return `<w:lnNumType ${attrs.join(' ')}/>`;
}

/**
 * Serialize page borders (w:pgBorders)
 */
function serializePageBorders(props: SectionProperties): string {
  if (!props.pageBorders) return '';

  const pb = props.pageBorders;
  const attrs: string[] = [];
  const borderElements: string[] = [];

  // display/offsetFrom/zOrder are file-derived enum values cast without
  // validation, so escape them before interpolating into the attribute.
  if (pb.display) {
    attrs.push(`w:display="${escapeXml(pb.display)}"`);
  }

  if (pb.offsetFrom) {
    attrs.push(`w:offsetFrom="${escapeXml(pb.offsetFrom)}"`);
  }

  if (pb.zOrder) {
    attrs.push(`w:zOrder="${escapeXml(pb.zOrder)}"`);
  }

  for (const side of ['top', 'left', 'bottom', 'right'] as const) {
    const xml = serializeBorder(pb[side], side);
    if (xml) borderElements.push(xml);
  }

  if (borderElements.length === 0) return '';

  const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  return `<w:pgBorders${attrsStr}>${borderElements.join('')}</w:pgBorders>`;
}

/**
 * Serialize document grid (w:docGrid)
 */
function serializeDocGrid(props: SectionProperties): string {
  if (!props.docGrid) return '';

  const dg = props.docGrid;
  const attrs: string[] = [];

  if (dg.type) {
    attrs.push(`w:type="${dg.type}"`);
  }

  if (dg.linePitch !== undefined) {
    attrs.push(`w:linePitch="${dg.linePitch}"`);
  }

  if (dg.charSpace !== undefined) {
    attrs.push(`w:charSpace="${dg.charSpace}"`);
  }

  if (attrs.length === 0) return '';

  return `<w:docGrid ${attrs.join(' ')}/>`;
}

/**
 * Serialize section properties (w:sectPr)
 */
export function serializeSectionProperties(props: SectionProperties | undefined): string {
  if (!props) return '';

  const parts: string[] = [];

  // Header references
  if (props.headerReferences) {
    for (const ref of props.headerReferences) {
      parts.push(serializeHeaderReference(ref));
    }
  }

  // Footer references
  if (props.footerReferences) {
    for (const ref of props.footerReferences) {
      parts.push(serializeFooterReference(ref));
    }
  }

  // Footnote properties
  const footnotePrXml = serializeFootnoteProperties(props.footnotePr);
  if (footnotePrXml) {
    parts.push(footnotePrXml);
  }

  // Endnote properties
  const endnotePrXml = serializeEndnoteProperties(props.endnotePr);
  if (endnotePrXml) {
    parts.push(endnotePrXml);
  }

  // Section type
  if (props.sectionStart) {
    parts.push(`<w:type w:val="${props.sectionStart}"/>`);
  }

  // Page size
  const pgSzXml = serializePageSize(props);
  if (pgSzXml) {
    parts.push(pgSzXml);
  }

  // Page margins
  const pgMarXml = serializePageMargins(props);
  if (pgMarXml) {
    parts.push(pgMarXml);
  }

  // Paper source
  if (props.paperSrcFirst !== undefined || props.paperSrcOther !== undefined) {
    const attrs: string[] = [];
    if (props.paperSrcFirst !== undefined) {
      attrs.push(`w:first="${props.paperSrcFirst}"`);
    }
    if (props.paperSrcOther !== undefined) {
      attrs.push(`w:other="${props.paperSrcOther}"`);
    }
    parts.push(`<w:paperSrc ${attrs.join(' ')}/>`);
  }

  // Page borders
  const pgBordersXml = serializePageBorders(props);
  if (pgBordersXml) {
    parts.push(pgBordersXml);
  }

  // Line numbers
  const lnNumXml = serializeLineNumbers(props);
  if (lnNumXml) {
    parts.push(lnNumXml);
  }

  // Columns
  const colsXml = serializeColumns(props);
  if (colsXml) {
    parts.push(colsXml);
  }

  // Footnote columns (w15:footnoteColumns) — Word emits this immediately after
  // w:cols. It is a w15-extension child of w:sectPr; the w15 namespace is
  // already declared on the document root by the document serializer. Only emit
  // for an explicit multi-column value (1 is the default and Word omits it).
  if (props.footnoteColumns !== undefined && props.footnoteColumns > 1) {
    parts.push(`<w15:footnoteColumns w:val="${intAttr(props.footnoteColumns)}"/>`);
  }

  // Remaining EG_SectPrContents elements MUST follow schema order
  // (wml.xsd CT_SectPr): ... cols, vAlign, titlePg, bidi, docGrid. Emitting
  // docGrid early or bidi before titlePg makes strict OOXML validators reject
  // the file (Word itself is lenient and reorders on open).

  // Vertical alignment
  if (props.verticalAlign) {
    parts.push(`<w:vAlign w:val="${props.verticalAlign}"/>`);
  }

  // Title page (different first page header/footer)
  if (props.titlePg) {
    parts.push('<w:titlePg/>');
  }

  // Bidirectional
  if (props.bidi) {
    parts.push('<w:bidi/>');
  }

  // Document grid (last EG_SectPrContents element this serializer emits)
  const docGridXml = serializeDocGrid(props);
  if (docGridXml) {
    parts.push(docGridXml);
  }

  // Even and odd headers. NOTE: this is a CT_Settings element (settings.xml),
  // not a CT_SectPr child; it is emitted here only to round-trip non-standard
  // input that carried it inside `w:sectPr` (the parser reads it from there).
  // Real Word documents store it in settings.xml, so this branch is inert for
  // them. Kept last to avoid disturbing the schema-ordered elements above.
  if (props.evenAndOddHeaders) {
    parts.push('<w:evenAndOddHeaders/>');
  }

  if (parts.length === 0) return '';

  return `<w:sectPr>${parts.join('')}</w:sectPr>`;
}
