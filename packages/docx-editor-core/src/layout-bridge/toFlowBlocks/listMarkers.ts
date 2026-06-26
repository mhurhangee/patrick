/**
 * List Marker Resolution
 *
 * Helpers for rendering OOXML list markers from the counter stack:
 *   - format numbers as decimal/roman/letter per ECMA-376 §17.9.16 numFmt
 *   - resolve lvlText templates ("%1.%2.") against the counter stack
 *   - drive the per-paragraph counter increment, including startOverride.
 */

import type { NumberFormat } from '../../types/document';
import type { ParagraphAttrs as PMParagraphAttrs } from '../../prosemirror/schema/nodes';
import { convertBulletToUnicode } from '../../docx/blockContentParser';
import { padDecimal } from '../../docx/numberingParser';

export function formatNumberedMarker(counters: number[], level: number): string {
  const parts: number[] = [];
  for (let i = 0; i <= level; i += 1) {
    const value = counters[i] ?? 0;
    if (value <= 0) break;
    parts.push(value);
  }
  if (parts.length === 0) return '1.';
  return `${parts.join('.')}.`;
}

const ROMAN_PAIRS: Array<[number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

function toRoman(n: number, upper: boolean): string {
  if (n <= 0) return '';
  let value = n;
  let out = '';
  for (const [num, sym] of ROMAN_PAIRS) {
    while (value >= num) {
      out += sym;
      value -= num;
    }
  }
  return upper ? out : out.toLowerCase();
}

// Spreadsheet-style: 1→A, 26→Z, 27→AA, 28→AB, ...
function toLetter(n: number, upper: boolean): string {
  if (n <= 0) return '';
  let value = n;
  let out = '';
  while (value > 0) {
    const rem = (value - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    value = Math.floor((value - 1) / 26);
  }
  return upper ? out : out.toLowerCase();
}

function formatCounter(value: number, fmt: NumberFormat | undefined): string {
  if (value <= 0) return '';
  switch (fmt) {
    case 'upperRoman':
      return toRoman(value, true);
    case 'lowerRoman':
      return toRoman(value, false);
    case 'upperLetter':
      return toLetter(value, true);
    case 'lowerLetter':
      return toLetter(value, false);
    case 'decimalZero':
      return padDecimal(value, 2);
    case 'decimalZero3':
      return padDecimal(value, 3);
    case 'decimalZero4':
      return padDecimal(value, 4);
    case 'decimalZero5':
      return padDecimal(value, 5);
    case 'none':
      return '';
    default:
      // decimal and unsupported formats fall back to decimal
      return String(value);
  }
}

/**
 * Resolve an OOXML lvlText template like "%1.%2." against the counter stack
 * and per-level numFmt list (ECMA-376 §17.9.11).
 *
 * When a referenced counter has no value yet (e.g. "%2" referenced from a
 * level-0 paragraph), the placeholder AND the punctuation immediately
 * following it are dropped — matches Word's behavior so "%1.%2." renders
 * "1." rather than "1..".
 *
 * Exported for unit testing.
 */
export function resolveListTemplate(
  template: string,
  counters: number[],
  levelNumFmts: NumberFormat[] | undefined
): string {
  return template.replace(/%(\d)([.):\]])?/g, (_, digit, punct = '') => {
    const idx = parseInt(digit, 10) - 1;
    if (idx < 0) return '';
    const value = counters[idx] ?? 0;
    const fmt = levelNumFmts?.[idx] ?? 'decimal';
    const formatted = formatCounter(value, fmt);
    return formatted ? formatted + punct : '';
  });
}

/**
 * Advance the counter stack for a list paragraph and return the rendered
 * marker. Mutates `counters` in place. Returns null when no marker should
 * be drawn (numId is missing or 0 — "no numbering" per ECMA-376).
 */
export function computeListMarker(
  pmAttrs: PMParagraphAttrs,
  listCounters: Map<number, number[]>,
  seenNumIds: Set<string>
): string | null {
  const numPr = pmAttrs.numPr;
  if (!numPr) return null;
  const numId = numPr.numId;
  if (numId == null || numId === 0) return null;

  // Bullets don't consume a numbering slot — they share a numId with numbered
  // levels in some templates, and incrementing here would skip numbers.
  // Run the Symbol-font glyph mapper here too so bullets in table cells and
  // text boxes get the same Unicode conversion that body bullets get from
  // the parser-side resolveBulletMarker (idempotent for already-Unicode chars).
  if (pmAttrs.listIsBullet) {
    return convertBulletToUnicode(pmAttrs.listMarker || '');
  }

  const level = numPr.ilvl ?? 0;

  // numFmt="none" (ECMA-376 §17.18.59): the level shows no auto-number — its
  // `lvlText` is taken literally (empty `lvlText` ⇒ no marker at all). Word
  // renders such paragraphs as plain text, so don't fall through to the
  // generic decimal formatter below and fabricate a "1." marker. (#718)
  const levelFmt = pmAttrs.listLevelNumFmts?.[level] ?? pmAttrs.listNumFmt;
  if (levelFmt === 'none') {
    return pmAttrs.listMarker ? pmAttrs.listMarker : null;
  }

  const counterKey = pmAttrs.listAbstractNumId ?? numId;
  const counters = listCounters.get(counterKey) ?? new Array(9).fill(0);

  const seenKey = `${numId}:${level}`;
  if (!seenNumIds.has(seenKey)) {
    seenNumIds.add(seenKey);
    if (pmAttrs.listStartOverride != null) {
      // Set to (start - 1) so the increment below produces `start` itself.
      counters[level] = pmAttrs.listStartOverride - 1;
    }
  }

  counters[level] = (counters[level] ?? 0) + 1;
  for (let i = level + 1; i < counters.length; i += 1) {
    counters[i] = 0;
  }
  listCounters.set(counterKey, counters);

  // Parsed lvlText template (e.g. "%1." or "%1.%2.") resolves against the
  // counter stack. Editor-created lists with no template fall back to the
  // generic decimal formatter.
  if (pmAttrs.listMarker && pmAttrs.listMarker.includes('%')) {
    return resolveListTemplate(pmAttrs.listMarker, counters, pmAttrs.listLevelNumFmts ?? undefined);
  }
  if (pmAttrs.listMarker) {
    return pmAttrs.listMarker;
  }
  return formatNumberedMarker(counters, level);
}
