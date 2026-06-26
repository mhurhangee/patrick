/**
 * Reconstruct numbering definitions from ProseMirror list state.
 *
 * On the round-trip path the document's `numbering.xml` is parsed into
 * `package.numbering` and preserved on save. But a document created from
 * scratch (`fromProseDoc` with no base document → `createDocx`) has no
 * original `numbering.xml`: its list paragraphs carry `numPr` + the list
 * rendering attrs, yet `package.numbering` is empty. Exporting that wrote
 * `<w:numId>` references with no backing definitions, so Word dropped every
 * list marker.
 *
 * This walks the PM tree and rebuilds a minimal {@link NumberingDefinitions}
 * from the per-paragraph list attrs so the serializer can emit a valid
 * `numbering.xml`.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type {
  NumberingDefinitions,
  AbstractNumbering,
  NumberingInstance,
  ListLevel,
  NumberFormat,
} from '../../../types/document';

/** List-related slice of a paragraph node's attrs (see `ParagraphAttrs`). */
interface ParagraphListAttrs {
  numPr?: { numId?: number; ilvl?: number };
  listNumFmt?: NumberFormat;
  listIsBullet?: boolean;
  listMarker?: string;
  listLevelNumFmts?: NumberFormat[];
  listAbstractNumId?: number;
  listStartOverride?: number;
}

/** Word's default list geometry: 0.5" indent per level, 0.25" hanging marker. */
const LEVEL_INDENT_TWIPS = 720;
const HANGING_TWIPS = 360;
const DEFAULT_BULLET = '•'; // •

function makeLevel(ilvl: number, numFmt: NumberFormat, marker: string | undefined): ListLevel {
  const isBullet = numFmt === 'bullet';
  const lvlText = isBullet ? marker?.trim() || DEFAULT_BULLET : `%${ilvl + 1}.`;
  return {
    ilvl,
    start: 1,
    numFmt,
    lvlText,
    lvlJc: 'left',
    pPr: {
      indentLeft: LEVEL_INDENT_TWIPS * (ilvl + 1),
      indentFirstLine: HANGING_TWIPS,
      hangingIndent: true,
    },
  };
}

/**
 * Build {@link NumberingDefinitions} from the list paragraphs in a PM document,
 * or `undefined` when the document contains no lists.
 */
export function collectNumberingFromPM(pmDoc: PMNode): NumberingDefinitions | undefined {
  // First pass: gather every explicitly-provided abstractNumId so synthesized
  // ids (for numIds that lack one) never collide with them.
  const usedAbstractIds = new Set<number>();
  pmDoc.descendants((node) => {
    if (node.type.name !== 'paragraph') return true;
    const id = (node.attrs as ParagraphListAttrs).listAbstractNumId;
    if (typeof id === 'number') usedAbstractIds.add(id);
    return true;
  });

  let syntheticAbstract = 0;
  const nextSyntheticAbstract = (): number => {
    while (usedAbstractIds.has(syntheticAbstract)) syntheticAbstract++;
    usedAbstractIds.add(syntheticAbstract);
    return syntheticAbstract++;
  };

  const numIdToAbstract = new Map<number, number>();
  // numId → (ilvl → startOverride): an override targets the level it was set on.
  const numIdLevelStartOverride = new Map<number, Map<number, number>>();
  // abstractNumId → (ilvl → level)
  const abstractLevels = new Map<number, Map<number, ListLevel>>();

  pmDoc.descendants((node) => {
    if (node.type.name !== 'paragraph') return true;
    const attrs = node.attrs as ParagraphListAttrs;
    const numId = attrs.numPr?.numId;
    if (typeof numId !== 'number' || numId <= 0) return true; // numId 0 = "no numbering"
    const ilvl = attrs.numPr?.ilvl ?? 0;

    let abstractNumId = numIdToAbstract.get(numId);
    if (abstractNumId === undefined) {
      abstractNumId =
        typeof attrs.listAbstractNumId === 'number'
          ? attrs.listAbstractNumId
          : nextSyntheticAbstract();
      numIdToAbstract.set(numId, abstractNumId);
    }
    if (attrs.listStartOverride !== undefined) {
      let levelOverrides = numIdLevelStartOverride.get(numId);
      if (!levelOverrides) {
        levelOverrides = new Map<number, number>();
        numIdLevelStartOverride.set(numId, levelOverrides);
      }
      if (!levelOverrides.has(ilvl)) levelOverrides.set(ilvl, attrs.listStartOverride);
    }

    let levels = abstractLevels.get(abstractNumId);
    if (!levels) {
      levels = new Map<number, ListLevel>();
      abstractLevels.set(abstractNumId, levels);
    }
    // Define every level 0..ilvl — Word expects lower levels to exist. Prefer
    // the per-level formats the renderer computed; otherwise fall back to the
    // paragraph's own kind (bullet lists are bullets at every level).
    const paraIsBullet = attrs.listIsBullet ?? attrs.listNumFmt === 'bullet';
    for (let i = 0; i <= ilvl; i++) {
      if (levels.has(i)) continue;
      const numFmt: NumberFormat =
        attrs.listLevelNumFmts?.[i] ?? (paraIsBullet ? 'bullet' : (attrs.listNumFmt ?? 'decimal'));
      const marker = i === ilvl ? attrs.listMarker : undefined;
      levels.set(i, makeLevel(i, numFmt, marker));
    }
    return true;
  });

  if (numIdToAbstract.size === 0) return undefined;

  const abstractNums: AbstractNumbering[] = [...abstractLevels.entries()]
    .map(([abstractNumId, levels]) => ({
      abstractNumId,
      multiLevelType: 'hybridMultilevel' as const,
      levels: [...levels.values()].sort((a, b) => a.ilvl - b.ilvl),
    }))
    .sort((a, b) => a.abstractNumId - b.abstractNumId);

  const nums: NumberingInstance[] = [...numIdToAbstract.entries()]
    .map(([numId, abstractNumId]) => {
      const instance: NumberingInstance = { numId, abstractNumId };
      const levelOverrides = numIdLevelStartOverride.get(numId);
      if (levelOverrides && levelOverrides.size > 0) {
        instance.levelOverrides = [...levelOverrides.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([ilvl, startOverride]) => ({ ilvl, startOverride }));
      }
      return instance;
    })
    .sort((a, b) => a.numId - b.numId);

  return { abstractNums, nums };
}
