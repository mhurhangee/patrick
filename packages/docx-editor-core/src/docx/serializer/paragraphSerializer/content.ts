/**
 * Paragraph content-item serializers — runs are owned by runSerializer,
 * but everything that can sit inside a `<w:p>` alongside a run (hyperlinks,
 * bookmarks, fields, SDTs, tracked-change wrappers, move markers, comment
 * ranges, math) goes through here. `serializeParagraphContent` is the
 * dispatcher used by serializeParagraph.
 */

import type {
  ParagraphContent,
  Run,
  Hyperlink,
  BookmarkStart,
  BookmarkEnd,
  SimpleField,
  ComplexField,
  InlineSdt,
  SdtProperties,
  Insertion,
  Deletion,
  MoveFrom,
  MoveTo,
  MoveFromRangeStart,
  MoveToRangeStart,
} from '../../../types/document';
import { serializeRun, serializeTextFormatting } from '../runSerializer';
import { escapeXml } from '../xmlUtils';

/**
 * Serialize bookmark start (w:bookmarkStart)
 */
export function serializeBookmarkStart(bookmark: BookmarkStart): string {
  const attrs: string[] = [`w:id="${bookmark.id}"`, `w:name="${escapeXml(bookmark.name)}"`];

  if (bookmark.colFirst !== undefined) {
    attrs.push(`w:colFirst="${bookmark.colFirst}"`);
  }

  if (bookmark.colLast !== undefined) {
    attrs.push(`w:colLast="${bookmark.colLast}"`);
  }

  return `<w:bookmarkStart ${attrs.join(' ')}/>`;
}

/**
 * Serialize bookmark end (w:bookmarkEnd)
 */
export function serializeBookmarkEnd(bookmark: BookmarkEnd): string {
  return `<w:bookmarkEnd w:id="${bookmark.id}"/>`;
}

/**
 * Serialize a hyperlink (w:hyperlink)
 */
export function serializeHyperlink(hyperlink: Hyperlink): string {
  const attrs: string[] = [];

  if (hyperlink.rId) {
    attrs.push(`r:id="${hyperlink.rId}"`);
  }

  if (hyperlink.anchor) {
    attrs.push(`w:anchor="${escapeXml(hyperlink.anchor)}"`);
  }

  if (hyperlink.tooltip) {
    attrs.push(`w:tooltip="${escapeXml(hyperlink.tooltip)}"`);
  }

  if (hyperlink.target) {
    attrs.push(`w:tgtFrame="${escapeXml(hyperlink.target)}"`);
  }

  if (hyperlink.history === false) {
    attrs.push('w:history="0"');
  }

  if (hyperlink.docLocation) {
    attrs.push(`w:docLocation="${escapeXml(hyperlink.docLocation)}"`);
  }

  // Serialize children
  const childrenXml = hyperlink.children
    .map((child) => {
      if (child.type === 'run') {
        return serializeRun(child);
      } else if (child.type === 'bookmarkStart') {
        return serializeBookmarkStart(child);
      } else if (child.type === 'bookmarkEnd') {
        return serializeBookmarkEnd(child);
      }
      return '';
    })
    .join('');

  // A hyperlink that would emit no attributes navigates nowhere; an empty
  // wrapper is meaningless and rejected by strict validators, so fall back to
  // the bare runs (e.g. a stale rId was dropped at save time). An href without
  // an rId is an editor-created link awaiting registration — keep it wrapped
  // (it is assigned an rId before export). Any other attribute (tooltip,
  // tgtFrame, docLocation, ...) is preserved.
  if (attrs.length === 0 && !hyperlink.href) {
    return childrenXml;
  }

  const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  return `<w:hyperlink${attrsStr}>${childrenXml}</w:hyperlink>`;
}

/**
 * Serialize a simple field as a complex field (fldChar begin/separate/end).
 * Complex field format is more widely supported by OOXML consumers
 * (Google Docs, Apple Pages) than w:fldSimple.
 */
export function serializeSimpleField(field: SimpleField): string {
  const parts: string[] = [];

  // Extract formatting from the first content run
  const firstRun = field.content.find((c): c is Run => c.type === 'run');
  const rPrXml = firstRun?.formatting ? serializeTextFormatting(firstRun.formatting) : '';

  // Begin field character
  const beginAttrs: string[] = ['w:fldCharType="begin"'];
  if (field.fldLock) {
    beginAttrs.push('w:fldLock="true"');
  }
  parts.push(`<w:r>${rPrXml}<w:fldChar ${beginAttrs.join(' ')}/></w:r>`);

  // Field code (instrText)
  const needsPreserve =
    field.instruction.startsWith(' ') ||
    field.instruction.endsWith(' ') ||
    field.instruction.includes('  ');
  const spaceAttr = needsPreserve ? ' xml:space="preserve"' : '';
  parts.push(
    `<w:r>${rPrXml}<w:instrText${spaceAttr}>${escapeXml(field.instruction)}</w:instrText></w:r>`
  );

  // Separate field character
  parts.push(`<w:r>${rPrXml}<w:fldChar w:fldCharType="separate"/></w:r>`);

  // Field result (the display runs)
  for (const item of field.content) {
    if (item.type === 'run') {
      parts.push(serializeRun(item));
    }
  }

  // End field character
  parts.push(`<w:r>${rPrXml}<w:fldChar w:fldCharType="end"/></w:r>`);

  return parts.join('');
}

/**
 * Serialize a complex field
 * Complex fields are represented by multiple runs with fldChar elements,
 * so we convert them back to that structure
 */
export function serializeComplexField(field: ComplexField): string {
  const parts: string[] = [];

  // Extract formatting from the first result run to apply to structural runs
  // (begin/separate/end). OOXML consumers expect consistent formatting across
  // all runs in a complex field. When there is no result run, fall back to the
  // formatting captured from the field's structural runs at parse time so a
  // PAGE field's w:rPr survives the round-trip.
  const resultFormatting = field.fieldResult?.[0]?.formatting ?? field.formatting;
  const rPrXml = resultFormatting ? serializeTextFormatting(resultFormatting) : '';

  // Begin field character (never set dirty — dirty causes apps to recalculate
  // and potentially discard run formatting)
  const beginAttrs: string[] = ['w:fldCharType="begin"'];
  if (field.fldLock) {
    beginAttrs.push('w:fldLock="true"');
  }
  parts.push(`<w:r>${rPrXml}<w:fldChar ${beginAttrs.join(' ')}/></w:r>`);

  // Field code (instrText)
  if (field.fieldCode.length > 0) {
    parts.push(...field.fieldCode.map((run) => serializeRun(run)));
  } else {
    // Fallback: create instrText from instruction
    const needsPreserve =
      field.instruction.startsWith(' ') ||
      field.instruction.endsWith(' ') ||
      field.instruction.includes('  ');
    const spaceAttr = needsPreserve ? ' xml:space="preserve"' : '';
    parts.push(
      `<w:r>${rPrXml}<w:instrText${spaceAttr}>${escapeXml(field.instruction)}</w:instrText></w:r>`
    );
  }

  // Separate field character
  parts.push(`<w:r>${rPrXml}<w:fldChar w:fldCharType="separate"/></w:r>`);

  // Field result
  parts.push(...field.fieldResult.map((run) => serializeRun(run)));

  // End field character
  parts.push(`<w:r>${rPrXml}<w:fldChar w:fldCharType="end"/></w:r>`);

  return parts.join('');
}

/**
 * Synthesize a `<w:sdtPr>` element from the modeled {@link SdtProperties}.
 *
 * Used for SDTs created programmatically (no captured `rawPropertiesXml`) —
 * both by {@link serializeInlineSdt} on save and by the headless
 * `createContentControl` to seed a control's raw properties. The element order
 * follows the `CT_SdtPr` sequence (alias, tag, id, lock, placeholder,
 * showingPlcHdr, then the type marker) so Word accepts the result without repair.
 *
 * The `id` is emitted so a created control keeps a stable, unique `w:id` across
 * the round trip; without it `findContentControl(doc, { id })` would not resolve
 * the control after a save/reload.
 */
export function synthesizeSdtPr(props: SdtProperties): string {
  const prParts: string[] = [];

  if (props.alias) prParts.push(`<w:alias w:val="${escapeXml(props.alias)}"/>`);
  if (props.tag) prParts.push(`<w:tag w:val="${escapeXml(props.tag)}"/>`);
  if (props.id != null) prParts.push(`<w:id w:val="${props.id}"/>`);
  if (props.lock && props.lock !== 'unlocked') prParts.push(`<w:lock w:val="${props.lock}"/>`);
  // `placeholder` precedes `showingPlcHdr` in the CT_SdtPr sequence (ECMA-376
  // §17.5.2.38); emit it so a synthesized control keeps a valid element order.
  if (props.placeholder)
    prParts.push(
      `<w:placeholder><w:docPart w:val="${escapeXml(props.placeholder)}"/></w:placeholder>`
    );
  if (props.showingPlaceholder) prParts.push('<w:showingPlcHdr/>');

  // Type-specific properties
  switch (props.sdtType) {
    case 'plainText':
      prParts.push('<w:text/>');
      break;
    case 'date':
      // The display format is the child `<w:dateFormat w:val="…"/>`; the
      // `w:date/@w:fullDate` slot holds the *value* (the picked date), which a
      // typed value setter fills in later — never the format.
      if (props.dateFormat) {
        prParts.push(`<w:date><w:dateFormat w:val="${escapeXml(props.dateFormat)}"/></w:date>`);
      } else {
        prParts.push('<w:date/>');
      }
      break;
    case 'dropDownList': {
      const items = (props.listItems ?? [])
        .map(
          (i) =>
            `<w:listItem w:displayText="${escapeXml(i.displayText)}" w:value="${escapeXml(i.value)}"/>`
        )
        .join('');
      // Emit an empty `w:lastValue` (the stored selection slot) so a typed value
      // setter can later populate it — Word treats an empty value as "no choice".
      prParts.push(`<w:dropDownList w:lastValue="">${items}</w:dropDownList>`);
      break;
    }
    case 'comboBox': {
      const items = (props.listItems ?? [])
        .map(
          (i) =>
            `<w:listItem w:displayText="${escapeXml(i.displayText)}" w:value="${escapeXml(i.value)}"/>`
        )
        .join('');
      prParts.push(`<w:comboBox w:lastValue="">${items}</w:comboBox>`);
      break;
    }
    case 'checkbox':
      // Emit the default glyph states (Word's MS Gothic ☒/☐) so a created
      // checkbox renders correctly and the value setter reads the symbol font
      // instead of falling back to a bare code point.
      prParts.push(
        `<w14:checkbox><w14:checked w14:val="${props.checked ? '1' : '0'}"/>` +
          '<w14:checkedState w14:val="2612" w14:font="MS Gothic"/>' +
          '<w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox>'
      );
      break;
    case 'picture':
      prParts.push('<w:picture/>');
      break;
  }

  return `<w:sdtPr>${prParts.join('')}</w:sdtPr>`;
}

/**
 * Serialize an inline SDT (w:sdt)
 */
export function serializeInlineSdt(sdt: InlineSdt): string {
  const props = sdt.properties;

  const contentXml = sdt.content
    .map((item) => {
      switch (item.type) {
        case 'run':
          return serializeRun(item);
        case 'hyperlink':
          return serializeHyperlink(item);
        case 'simpleField':
          return serializeSimpleField(item);
        case 'complexField':
          return serializeComplexField(item);
        case 'inlineSdt':
          return serializeInlineSdt(item);
        case 'mathEquation':
          return item.ommlXml || '';
        default: {
          // Exhaustiveness check: if a new type is added to
          // InlineSdt['content'] (see types/content.ts) without a matching
          // case here, TypeScript errors out instead of silently dropping
          // the content on save. Keep this in sync with the filter in
          // fromProseDoc.createInlineSdtFromNode.
          const _exhaustive: never = item;
          return _exhaustive;
        }
      }
    })
    .join('');

  const sdtPrXml = props.rawPropertiesXml ?? synthesizeSdtPr(props);
  const sdtEndPrXml = props.rawEndPropertiesXml ?? '';
  return `<w:sdt>${sdtPrXml}${sdtEndPrXml}<w:sdtContent>${contentXml}</w:sdtContent></w:sdt>`;
}

function serializeMoveRangeStart(
  tag: 'moveFromRangeStart' | 'moveToRangeStart',
  marker: MoveFromRangeStart | MoveToRangeStart
): string {
  const attrs = [`w:id="${marker.id}"`, `w:name="${escapeXml(marker.name)}"`];
  return `<w:${tag} ${attrs.join(' ')}/>`;
}

/**
 * Serialize a tracked change wrapper (ins/del/moveFrom/moveTo)
 */
function serializeTrackedChange(
  tag: 'ins' | 'del' | 'moveFrom' | 'moveTo',
  change: Insertion | Deletion | MoveFrom | MoveTo
): string {
  const info = change.info;
  const normalizedId = Number.isInteger(info.id) && info.id >= 0 ? info.id : 0;
  const authorCandidate = typeof info.author === 'string' ? info.author.trim() : '';
  const normalizedAuthor = authorCandidate.length > 0 ? authorCandidate : 'Unknown';
  const normalizedDate = typeof info.date === 'string' ? info.date.trim() : undefined;
  const attrs = [`w:id="${normalizedId}"`, `w:author="${escapeXml(normalizedAuthor)}"`];
  if (normalizedDate) attrs.push(`w:date="${escapeXml(normalizedDate)}"`);

  const contentXml = change.content
    .map((item) => {
      if (item.type === 'run') {
        const xml = serializeRun(item);
        // A deleted drawing run keeps its content verbatim: a picture has no
        // `<w:t>`, and a shape's textbox text (`<w:txbxContent><w:t>`) must NOT
        // be rewritten to `<w:delText>` — that markup belongs only to a run's
        // own deleted text, not to a nested textbox document.
        const isDrawingRun = item.content.some((c) => c.type === 'drawing');
        if ((tag === 'del' || tag === 'moveFrom') && !isDrawingRun) {
          return xml
            .replace(/<w:t\b/g, '<w:delText')
            .replace(/<\/w:t>/g, '</w:delText>')
            .replace(/<w:instrText\b/g, '<w:delInstrText')
            .replace(/<\/w:instrText>/g, '</w:delInstrText>');
        }
        return xml;
      }
      if (item.type === 'hyperlink') return serializeHyperlink(item);
      return '';
    })
    .join('');

  return `<w:${tag} ${attrs.join(' ')}>${contentXml}</w:${tag}>`;
}

/**
 * Serialize a single paragraph content item
 */
export function serializeParagraphContent(content: ParagraphContent): string {
  switch (content.type) {
    case 'run':
      return serializeRun(content);
    case 'hyperlink':
      return serializeHyperlink(content);
    case 'bookmarkStart':
      return serializeBookmarkStart(content);
    case 'bookmarkEnd':
      return serializeBookmarkEnd(content);
    case 'simpleField':
      return serializeSimpleField(content);
    case 'complexField':
      return serializeComplexField(content);
    case 'inlineSdt':
      return serializeInlineSdt(content);
    case 'commentRangeStart':
      return `<w:commentRangeStart w:id="${content.id}"/>`;
    case 'commentRangeEnd':
      return (
        `<w:commentRangeEnd w:id="${content.id}"/>` +
        `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${content.id}"/></w:r>`
      );
    case 'insertion':
      return serializeTrackedChange('ins', content);
    case 'deletion':
      return serializeTrackedChange('del', content);
    case 'moveFrom':
      return serializeTrackedChange('moveFrom', content);
    case 'moveTo':
      return serializeTrackedChange('moveTo', content);
    case 'moveFromRangeStart':
      return serializeMoveRangeStart('moveFromRangeStart', content as MoveFromRangeStart);
    case 'moveFromRangeEnd':
      return `<w:moveFromRangeEnd w:id="${content.id}"/>`;
    case 'moveToRangeStart':
      return serializeMoveRangeStart('moveToRangeStart', content as MoveToRangeStart);
    case 'moveToRangeEnd':
      return `<w:moveToRangeEnd w:id="${content.id}"/>`;
    case 'mathEquation':
      // Round-trip the raw OMML XML directly
      return content.ommlXml || '';
    default:
      return '';
  }
}
