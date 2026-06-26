/**
 * Conditional Format Style Serializer - Serialize w:cnfStyle
 *
 * Table-style conditional formatting flags (header row, banding, corner cells)
 * appear on rows (w:trPr) and cells (w:tcPr). Shared so both paths emit the
 * same 12-bit `w:val` mask.
 *
 * OOXML Reference: CT_Cnf (ECMA-376 §17.4.7).
 */

import type { ConditionalFormatStyle } from '../../types/document';

/**
 * Serialize conditional format style (w:cnfStyle)
 */
export function serializeConditionalFormatStyle(style: ConditionalFormatStyle | undefined): string {
  if (!style) return '';

  // Build the 12-character binary string
  const bits = [
    style.firstRow ? '1' : '0',
    style.lastRow ? '1' : '0',
    style.firstColumn ? '1' : '0',
    style.lastColumn ? '1' : '0',
    style.oddVBand ? '1' : '0',
    style.evenVBand ? '1' : '0',
    style.oddHBand ? '1' : '0',
    style.evenHBand ? '1' : '0',
    style.nwCell ? '1' : '0',
    style.neCell ? '1' : '0',
    style.swCell ? '1' : '0',
    style.seCell ? '1' : '0',
  ];

  const val = bits.join('');

  // Only serialize if any bits are set
  if (val === '000000000000') return '';

  return `<w:cnfStyle w:val="${val}"/>`;
}
