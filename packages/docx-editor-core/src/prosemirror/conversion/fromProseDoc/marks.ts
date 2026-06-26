/**
 * Mark coalescing & TextFormatting conversion.
 *
 * Helpers used by the run/paragraph walkers to (a) decide when two adjacent
 * text runs share their full mark set (for run coalescing on save) and
 * (b) project a Mark[] back to the OOXML-shaped `TextFormatting`.
 */

import type { Mark } from 'prosemirror-model';
import type { TextFormatting } from '../../../types/document';
import type { TextColorAttrs, UnderlineAttrs, FontFamilyAttrs } from '../../schema/marks';
import { getMarkSetKey, RUN_COALESCING_MARK_EXCLUSIONS } from '../markKeys';

/**
 * Create a unique key for a link mark
 */
export function getLinkKey(mark: Mark): string {
  return mark.attrs.href || '';
}

/**
 * Create a unique key for a set of marks (excluding hyperlink)
 */
export function getMarksKey(marks: readonly Mark[]): string {
  return getMarkSetKey(marks, RUN_COALESCING_MARK_EXCLUSIONS);
}

/**
 * Convert ProseMirror marks to TextFormatting
 */
export function marksToTextFormatting(marks: readonly Mark[]): TextFormatting {
  const formatting: TextFormatting = {};

  for (const mark of marks) {
    switch (mark.type.name) {
      case 'bold':
        formatting.bold = true;
        formatting.boldCs = true;
        break;

      case 'italic':
        formatting.italic = true;
        formatting.italicCs = true;
        break;

      case 'underline': {
        const attrs = mark.attrs as UnderlineAttrs;
        formatting.underline = {
          style: attrs.style || 'single',
          color: attrs.color,
        };
        break;
      }

      case 'strike':
        if (mark.attrs.double) {
          formatting.doubleStrike = true;
        } else {
          formatting.strike = true;
        }
        break;

      case 'textColor': {
        const attrs = mark.attrs as TextColorAttrs;
        formatting.color = {
          rgb: attrs.rgb,
          themeColor: attrs.themeColor,
          themeTint: attrs.themeTint,
          themeShade: attrs.themeShade,
        };
        break;
      }

      case 'highlight':
        formatting.highlight = mark.attrs.color;
        break;

      case 'fontSize':
        if (mark.attrs.size != null) {
          formatting.fontSize = mark.attrs.size;
        }
        const sizeCs = mark.attrs.sizeCs ?? mark.attrs.size;
        if (sizeCs != null) {
          formatting.fontSizeCs = sizeCs;
        }
        break;

      case 'fontFamily': {
        const attrs = mark.attrs as FontFamilyAttrs;
        formatting.fontFamily = {
          ascii: attrs.ascii,
          hAnsi: attrs.hAnsi,
          eastAsia: attrs.eastAsia || undefined,
          // Use stored cs value, falling back to ascii for Complex Script compatibility
          cs: attrs.cs || attrs.ascii || undefined,
          // asciiTheme needs to be cast to the proper type or undefined
          asciiTheme: attrs.asciiTheme as
            | 'majorAscii'
            | 'majorHAnsi'
            | 'majorEastAsia'
            | 'majorBidi'
            | 'minorAscii'
            | 'minorHAnsi'
            | 'minorEastAsia'
            | 'minorBidi'
            | undefined,
          hAnsiTheme: attrs.hAnsiTheme || undefined,
          eastAsiaTheme: attrs.eastAsiaTheme || undefined,
          csTheme: attrs.csTheme || undefined,
        };
        break;
      }

      case 'superscript':
        formatting.vertAlign = 'superscript';
        break;

      case 'subscript':
        formatting.vertAlign = 'subscript';
        break;

      case 'allCaps':
        formatting.allCaps = true;
        break;

      case 'smallCaps':
        formatting.smallCaps = true;
        break;

      case 'characterSpacing': {
        if (mark.attrs.spacing != null) formatting.spacing = mark.attrs.spacing;
        if (mark.attrs.position != null) formatting.position = mark.attrs.position;
        if (mark.attrs.scale != null) formatting.scale = mark.attrs.scale;
        if (mark.attrs.kerning != null) formatting.kerning = mark.attrs.kerning;
        break;
      }

      case 'emboss':
        formatting.emboss = true;
        break;

      case 'imprint':
        formatting.imprint = true;
        break;

      case 'textShadow':
        formatting.shadow = true;
        break;

      case 'emphasisMark':
        formatting.emphasisMark = mark.attrs.type || 'dot';
        break;

      case 'textOutline':
        formatting.outline = true;
        break;

      case 'hidden':
        formatting.hidden = true;
        break;

      case 'rtl':
        formatting.rtl = true;
        break;

      case 'textEffect':
        formatting.effect = mark.attrs.effect || 'blinkBackground';
        break;

      case 'runStyle':
        if (mark.attrs.styleId) formatting.styleId = mark.attrs.styleId as string;
        break;

      // hyperlink is handled separately
    }
  }

  return formatting;
}
