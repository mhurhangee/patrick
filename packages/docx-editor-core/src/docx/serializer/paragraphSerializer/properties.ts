/**
 * Paragraph property serializers — borders, shading, tabs, spacing,
 * indentation, numbering, frame. Used by serializeParagraphFormatting.
 */

import type { ParagraphFormatting, TabStop, ShadingProperties } from '../../../types/document';
import { intAttr } from '../xmlUtils';
import { serializeBorder } from '../borderSerializer';

const BORDER_SIDES = ['top', 'left', 'bottom', 'right', 'between', 'bar'] as const;

/**
 * Serialize paragraph borders (w:pBdr)
 */
export function serializeParagraphBorders(borders: ParagraphFormatting['borders']): string {
  if (!borders) return '';

  const parts: string[] = [];
  for (const side of BORDER_SIDES) {
    const xml = serializeBorder(borders[side], side);
    if (xml) parts.push(xml);
  }

  if (parts.length === 0) return '';
  return `<w:pBdr>${parts.join('')}</w:pBdr>`;
}

/**
 * Serialize shading properties (w:shd)
 */
export function serializeShading(shading: ShadingProperties | undefined): string {
  if (!shading) return '';

  const attrs: string[] = [];

  // Pattern/val
  if (shading.pattern) {
    attrs.push(`w:val="${shading.pattern}"`);
  } else {
    attrs.push('w:val="clear"');
  }

  // Color (pattern color)
  if (shading.color?.rgb) {
    attrs.push(`w:color="${shading.color.rgb}"`);
  } else if (shading.color?.auto) {
    attrs.push('w:color="auto"');
  }

  // Fill (background color)
  if (shading.fill?.rgb) {
    attrs.push(`w:fill="${shading.fill.rgb}"`);
  } else if (shading.fill?.auto) {
    attrs.push('w:fill="auto"');
  }

  // Theme fill
  if (shading.fill?.themeColor) {
    attrs.push(`w:themeFill="${shading.fill.themeColor}"`);
  }

  if (shading.fill?.themeTint) {
    attrs.push(`w:themeFillTint="${shading.fill.themeTint}"`);
  }

  if (shading.fill?.themeShade) {
    attrs.push(`w:themeFillShade="${shading.fill.themeShade}"`);
  }

  if (attrs.length === 0) return '';

  return `<w:shd ${attrs.join(' ')}/>`;
}

/**
 * Serialize tab stops (w:tabs)
 */
export function serializeTabStops(tabs: TabStop[] | undefined): string {
  if (!tabs || tabs.length === 0) return '';

  const tabElements = tabs.map((tab) => {
    const attrs: string[] = [`w:val="${tab.alignment}"`, `w:pos="${intAttr(tab.position)}"`];

    if (tab.leader && tab.leader !== 'none') {
      attrs.push(`w:leader="${tab.leader}"`);
    }

    return `<w:tab ${attrs.join(' ')}/>`;
  });

  return `<w:tabs>${tabElements.join('')}</w:tabs>`;
}

/**
 * Serialize spacing properties (w:spacing)
 */
export function serializeSpacing(formatting: ParagraphFormatting): string {
  const attrs: string[] = [];

  if (formatting.spaceBefore !== undefined) {
    attrs.push(`w:before="${intAttr(formatting.spaceBefore)}"`);
  }

  if (formatting.spaceAfter !== undefined) {
    attrs.push(`w:after="${intAttr(formatting.spaceAfter)}"`);
  }

  if (formatting.lineSpacing !== undefined) {
    attrs.push(`w:line="${intAttr(formatting.lineSpacing)}"`);
  }

  if (formatting.lineSpacingRule) {
    attrs.push(`w:lineRule="${formatting.lineSpacingRule}"`);
  }

  if (formatting.beforeAutospacing) {
    attrs.push('w:beforeAutospacing="1"');
  }

  if (formatting.afterAutospacing) {
    attrs.push('w:afterAutospacing="1"');
  }

  if (attrs.length === 0) return '';

  return `<w:spacing ${attrs.join(' ')}/>`;
}

/**
 * Serialize indentation properties (w:ind)
 */
export function serializeIndentation(formatting: ParagraphFormatting): string {
  const attrs: string[] = [];

  if (formatting.indentLeft !== undefined) {
    attrs.push(`w:left="${intAttr(formatting.indentLeft)}"`);
  }

  if (formatting.indentRight !== undefined) {
    attrs.push(`w:right="${intAttr(formatting.indentRight)}"`);
  }

  if (formatting.indentFirstLine !== undefined) {
    if (formatting.hangingIndent) {
      // Hanging indent is stored as positive value but uses w:hanging attribute
      attrs.push(`w:hanging="${intAttr(Math.abs(formatting.indentFirstLine))}"`);
    } else if (formatting.indentFirstLine !== 0) {
      attrs.push(`w:firstLine="${intAttr(formatting.indentFirstLine)}"`);
    }
  }

  if (attrs.length === 0) return '';

  return `<w:ind ${attrs.join(' ')}/>`;
}

/**
 * Serialize numbering properties (w:numPr)
 */
export function serializeNumbering(numPr: ParagraphFormatting['numPr']): string {
  if (!numPr) return '';

  const parts: string[] = [];

  if (numPr.ilvl !== undefined) {
    parts.push(`<w:ilvl w:val="${intAttr(numPr.ilvl)}"/>`);
  }

  if (numPr.numId !== undefined) {
    parts.push(`<w:numId w:val="${intAttr(numPr.numId)}"/>`);
  }

  if (parts.length === 0) return '';

  return `<w:numPr>${parts.join('')}</w:numPr>`;
}

/**
 * Serialize frame properties (w:framePr)
 */
export function serializeFrameProperties(frame: ParagraphFormatting['frame']): string {
  if (!frame) return '';

  const attrs: string[] = [];

  if (frame.width !== undefined) {
    attrs.push(`w:w="${intAttr(frame.width)}"`);
  }

  if (frame.height !== undefined) {
    attrs.push(`w:h="${intAttr(frame.height)}"`);
  }

  if (frame.hAnchor) {
    attrs.push(`w:hAnchor="${frame.hAnchor}"`);
  }

  if (frame.vAnchor) {
    attrs.push(`w:vAnchor="${frame.vAnchor}"`);
  }

  if (frame.x !== undefined) {
    attrs.push(`w:x="${intAttr(frame.x)}"`);
  }

  if (frame.y !== undefined) {
    attrs.push(`w:y="${intAttr(frame.y)}"`);
  }

  if (frame.xAlign) {
    attrs.push(`w:xAlign="${frame.xAlign}"`);
  }

  if (frame.yAlign) {
    attrs.push(`w:yAlign="${frame.yAlign}"`);
  }

  if (frame.wrap) {
    attrs.push(`w:wrap="${frame.wrap}"`);
  }

  if (attrs.length === 0) return '';

  return `<w:framePr ${attrs.join(' ')}/>`;
}
