/**
 * Shared single-border serializer for every `CT_Border` field — table borders
 * (`w:tblBorders`/`w:tcBorders`), paragraph borders (`w:pBdr`), and page borders
 * (`w:pgBorders`). The per-container helpers in the table/paragraph/section
 * serializers all delegate here so border rules round-trip identically
 * everywhere.
 */

import type { BorderSpec } from '../../types/document';
import { escapeXml, intAttr } from './xmlUtils';

/**
 * Serialize a single border element (`<w:top .../>`, `<w:left .../>`, ...).
 *
 * `nil`/`none` mean "no border", but an EXPLICIT one overrides an inherited
 * border (a table-level grid via `w:tblBorders`, a paragraph-style border, a
 * section page border), so it must still be emitted as `<w:side w:val="nil"/>`.
 * A `BorderSpec` only exists here when the source set it or the user turned the
 * border off, so emitting it is a faithful round-trip, not noise. Dropping it
 * silently re-inherited the container default — e.g. hidden table gridlines
 * reappeared on reload (issue #947). `nil`/`none` carry no size/color/space, so
 * emit just the value.
 *
 * `style` and the color values come straight from the parsed DOCX (the parser
 * casts `w:val`/`w:color` without validating the enum), so they are
 * attacker-controlled and must be `escapeXml`'d before going back into XML
 * attributes — otherwise a crafted `w:val` could break out and inject markup on
 * round-trip. For valid documents these are enum/hex values, so escaping is a
 * no-op.
 */
export function serializeBorder(border: BorderSpec | undefined, elementName: string): string {
  if (!border) {
    return '';
  }

  if (border.style === 'none' || border.style === 'nil') {
    return `<w:${elementName} w:val="${border.style}"/>`;
  }

  const attrs: string[] = [`w:val="${escapeXml(border.style)}"`];

  if (border.size !== undefined) {
    attrs.push(`w:sz="${intAttr(border.size)}"`);
  }

  if (border.space !== undefined) {
    attrs.push(`w:space="${intAttr(border.space)}"`);
  }

  // Color
  if (border.color) {
    if (border.color.auto) {
      attrs.push('w:color="auto"');
    } else if (border.color.rgb) {
      attrs.push(`w:color="${escapeXml(border.color.rgb)}"`);
    }

    if (border.color.themeColor) {
      attrs.push(`w:themeColor="${escapeXml(border.color.themeColor)}"`);
    }

    if (border.color.themeTint) {
      attrs.push(`w:themeTint="${escapeXml(border.color.themeTint)}"`);
    }

    if (border.color.themeShade) {
      attrs.push(`w:themeShade="${escapeXml(border.color.themeShade)}"`);
    }
  }

  if (border.shadow) {
    attrs.push('w:shadow="true"');
  }

  if (border.frame) {
    attrs.push('w:frame="true"');
  }

  return `<w:${elementName} ${attrs.join(' ')}/>`;
}
