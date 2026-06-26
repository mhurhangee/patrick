/**
 * Numbering serializer — emit a `word/numbering.xml` part from
 * {@link NumberingDefinitions}. The inverse of `numberingParser`.
 *
 * Used when exporting a document that references list `numId`s but whose
 * package has no original `numbering.xml` to preserve (e.g. the empty-template
 * `createDocx()` path). Without this part Word can't resolve the `<w:numId>`
 * references and silently drops every list marker.
 */

import type {
  NumberingDefinitions,
  AbstractNumbering,
  NumberingInstance,
  ListLevel,
} from '../../types/document';
import { escapeXml, intAttr } from './xmlUtils';
import { serializeIndentation } from './paragraphSerializer/properties';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * Serialize one `w:lvl` (a single indentation level of an abstract numbering).
 */
function serializeLevel(level: ListLevel): string {
  const parts: string[] = [];

  if (level.start !== undefined) {
    parts.push(`<w:start w:val="${intAttr(level.start)}"/>`);
  }
  parts.push(`<w:numFmt w:val="${escapeXml(level.numFmt)}"/>`);
  // ECMA-376 §17.9.6 CT_Lvl child order: start, numFmt, …, suff, lvlText, …,
  // lvlJc, pPr, rPr — so w:suff must precede w:lvlText and w:lvlJc follows it.
  if (level.suffix) {
    parts.push(`<w:suff w:val="${level.suffix}"/>`);
  }
  parts.push(`<w:lvlText w:val="${escapeXml(level.lvlText)}"/>`);
  if (level.lvlJc) {
    parts.push(`<w:lvlJc w:val="${level.lvlJc}"/>`);
  }
  // Reuse the paragraph indentation serializer — a level's `pPr` is a
  // ParagraphFormatting, so `<w:ind>` comes out identical to body paragraphs.
  const ind = level.pPr ? serializeIndentation(level.pPr) : '';
  if (ind) {
    parts.push(`<w:pPr>${ind}</w:pPr>`);
  }

  return `<w:lvl w:ilvl="${intAttr(level.ilvl)}">${parts.join('')}</w:lvl>`;
}

/**
 * Serialize one `w:abstractNum` (the reusable list template).
 */
function serializeAbstractNum(abstractNum: AbstractNumbering): string {
  const parts: string[] = [];
  if (abstractNum.multiLevelType) {
    parts.push(`<w:multiLevelType w:val="${abstractNum.multiLevelType}"/>`);
  }
  const levels = [...abstractNum.levels].sort((a, b) => a.ilvl - b.ilvl);
  for (const level of levels) {
    parts.push(serializeLevel(level));
  }
  return `<w:abstractNum w:abstractNumId="${intAttr(abstractNum.abstractNumId)}">${parts.join('')}</w:abstractNum>`;
}

/**
 * Serialize one `w:num` (a concrete numbering instance referenced by `numId`).
 */
function serializeNum(instance: NumberingInstance): string {
  const parts: string[] = [`<w:abstractNumId w:val="${intAttr(instance.abstractNumId)}"/>`];
  for (const override of instance.levelOverrides ?? []) {
    const overrideParts: string[] = [];
    if (override.startOverride !== undefined) {
      overrideParts.push(`<w:startOverride w:val="${intAttr(override.startOverride)}"/>`);
    }
    if (override.lvl) {
      overrideParts.push(serializeLevel(override.lvl));
    }
    parts.push(
      `<w:lvlOverride w:ilvl="${intAttr(override.ilvl)}">${overrideParts.join('')}</w:lvlOverride>`
    );
  }
  return `<w:num w:numId="${intAttr(instance.numId)}">${parts.join('')}</w:num>`;
}

/**
 * Serialize {@link NumberingDefinitions} to a complete `word/numbering.xml`
 * string. `w:abstractNum` elements are emitted before `w:num` elements as the
 * schema (ECMA-376 §17.9) requires.
 */
export function serializeNumberingXml(numbering: NumberingDefinitions): string {
  const abstractNums = numbering.abstractNums.map(serializeAbstractNum).join('');
  const nums = numbering.nums.map(serializeNum).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W_NS}">${abstractNums}${nums}</w:numbering>`;
}
