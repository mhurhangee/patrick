/**
 * Integration tests — run-level OOXML attributes survive the bridge.
 *
 * Regression guards for cases where the layout-painter pipeline silently
 * dropped formatting the hidden ProseMirror toDOM rendered correctly:
 *  - #410: `extractRunFormatting` had no `case` for several run-level marks
 *    (`allCaps`, `smallCaps`, `position`, `horizontalScale`, `kerning`,
 *    `characterSpacing`'s position/scale/kerning attrs).
 *  - #392: runs inherited none of the paragraph's `defaultTextFormatting`.
 *  - Field nodes (PAGE etc.) carried marks the bridge never extracted, so a
 *    page number painted at the painter's defaults instead of its run's rPr.
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { toFlowBlocks } from '../toFlowBlocks';
import type { ParagraphBlock, TextRun, FieldRun } from '../../layout-engine/types';

// Minimal schema with the marks/nodes we exercise. Mirrors the actual
// ParagraphExtension + FieldExtension + the marks added in #410's fix; we
// don't need the full StarterKit here. Like the real `field` NodeSpec, the
// node declares no `marks` property, so ProseMirror allows all marks on it —
// the behavior the field-formatting tests depend on.
const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      attrs: {
        styleId: { default: null },
        defaultTextFormatting: { default: null },
      },
    },
    text: { group: 'inline' },
    field: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: {
        fieldType: { default: 'UNKNOWN' },
        instruction: { default: '' },
        displayText: { default: '' },
        fieldKind: { default: 'simple' },
        fldLock: { default: false },
        dirty: { default: false },
      },
    },
  },
  marks: {
    bold: {},
    fontSize: {
      attrs: { size: { default: 22 } },
    },
    textColor: {
      attrs: {
        rgb: { default: null },
        themeColor: { default: null },
        themeTint: { default: null },
        themeShade: { default: null },
      },
    },
    hyperlink: {
      attrs: { href: { default: '' }, tooltip: { default: undefined } },
    },
    allCaps: {},
    smallCaps: {},
    emboss: {},
    imprint: {},
    textShadow: {},
    textOutline: {},
    emphasisMark: {
      attrs: { type: { default: 'dot' } },
    },
    footnoteRef: {
      attrs: { id: { default: 0 }, noteType: { default: 'footnote' } },
    },
    characterSpacing: {
      attrs: {
        spacing: { default: null },
        position: { default: null },
        scale: { default: null },
        kerning: { default: null },
      },
    },
  },
});

function buildSingleRunDoc(text: string, markName: string, attrs?: Record<string, unknown>) {
  const mark = schema.marks[markName].create(attrs);
  const node = schema.text(text, [mark]);
  return schema.node('doc', null, [schema.node('paragraph', null, [node])]);
}

function firstRun(blocks: unknown[]): TextRun {
  const para = blocks.find((b) => (b as ParagraphBlock).kind === 'paragraph') as ParagraphBlock;
  return para.runs![0] as TextRun;
}

function firstFieldRun(blocks: unknown[]): FieldRun {
  const para = blocks.find((b) => (b as ParagraphBlock).kind === 'paragraph') as ParagraphBlock;
  const run = para.runs![0];
  expect(run.kind).toBe('field');
  return run as FieldRun;
}

describe('toFlowBlocks — run-level marks reach RunFormatting (#410)', () => {
  test('allCaps mark sets formatting.allCaps', () => {
    const doc = buildSingleRunDoc('hello', 'allCaps');
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).allCaps).toBe(true);
  });

  test('smallCaps mark sets formatting.smallCaps', () => {
    const doc = buildSingleRunDoc('Hello', 'smallCaps');
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).smallCaps).toBe(true);
  });

  test('characterSpacing.spacing → letterSpacing in pixels', () => {
    const doc = buildSingleRunDoc('text', 'characterSpacing', { spacing: 16 });
    const blocks = toFlowBlocks(doc, {});
    // 16 twips = 16 / 1440 inch * 96 px = 1.066... px
    expect(firstRun(blocks).letterSpacing).toBeCloseTo(1.0667, 3);
  });

  test('characterSpacing.position → positionPx in CSS pixels', () => {
    // 12 half-points = 6 pt = 8 px (at 96 dpi, 6/72 * 96 = 8)
    const doc = buildSingleRunDoc('text', 'characterSpacing', { position: 12 });
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).positionPx).toBeCloseTo(8, 3);
  });

  test('characterSpacing.scale → horizontalScale percent', () => {
    const doc = buildSingleRunDoc('text', 'characterSpacing', { scale: 90 });
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).horizontalScale).toBe(90);
  });

  test('characterSpacing.kerning (half-points) → kerningMinPt', () => {
    // 16 half-points = 8 pt threshold
    const doc = buildSingleRunDoc('text', 'characterSpacing', { kerning: 16 });
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).kerningMinPt).toBe(8);
  });

  test('zero/identity values are not propagated (avoid emitting no-op CSS)', () => {
    const doc = buildSingleRunDoc('text', 'characterSpacing', {
      spacing: 0,
      position: 0,
      scale: 100, // identity
      kerning: 0,
    });
    const blocks = toFlowBlocks(doc, {});
    const run = firstRun(blocks);
    expect(run.letterSpacing).toBeUndefined();
    expect(run.positionPx).toBeUndefined();
    expect(run.horizontalScale).toBeUndefined();
    expect(run.kerningMinPt).toBeUndefined();
  });

  test('emboss / imprint / textShadow / textOutline marks reach RunFormatting', () => {
    for (const markName of ['emboss', 'imprint', 'textShadow', 'textOutline'] as const) {
      const doc = buildSingleRunDoc('hi', markName);
      const blocks = toFlowBlocks(doc, {});
      const run = firstRun(blocks);
      expect(run[markName]).toBe(true);
    }
  });

  test('emphasisMark mark forwards its variant attribute', () => {
    for (const variant of ['dot', 'comma', 'circle', 'underDot'] as const) {
      const doc = buildSingleRunDoc('hi', 'emphasisMark', { type: variant });
      const blocks = toFlowBlocks(doc, {});
      expect(firstRun(blocks).emphasisMark).toBe(variant);
    }
  });

  test('emphasisMark with unknown variant falls back to dot', () => {
    const doc = buildSingleRunDoc('hi', 'emphasisMark', { type: 'unknownXyz' });
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).emphasisMark).toBe('dot');
  });

  test('footnoteRef mark implies superscript (Word raises the anchor mark)', () => {
    // The footnote reference anchor renders superscript by default — Word's
    // built-in FootnoteReference char style sets w:vertAlign="superscript".
    // Many docs (e.g. Pandoc output) omit an explicit rStyle on the anchor
    // run, so the bridge must apply the superscript implicitly rather than
    // depend on the mark being present.
    const doc = buildSingleRunDoc('1', 'footnoteRef', { id: 5, noteType: 'footnote' });
    const run = firstRun(toFlowBlocks(doc, {}));
    expect(run.footnoteRefId).toBe(5);
    expect(run.superscript).toBe(true);
  });

  test('endnoteRef mark implies superscript', () => {
    const doc = buildSingleRunDoc('1', 'footnoteRef', { id: 3, noteType: 'endnote' });
    const run = firstRun(toFlowBlocks(doc, {}));
    expect(run.endnoteRefId).toBe(3);
    expect(run.superscript).toBe(true);
  });
});

describe('toFlowBlocks — paragraph defaultTextFormatting cascades to runs (#392)', () => {
  test('runs with no fontFamily mark inherit fontFamily from paragraph defaults', () => {
    // Simulate the #392 fixture: paragraph carries the resolved style font
    // via attrs.defaultTextFormatting; the run itself has no fontFamily mark.
    const doc = schema.node('doc', null, [
      schema.node(
        'paragraph',
        {
          defaultTextFormatting: {
            fontFamily: { ascii: 'Arial Narrow', hAnsi: 'Arial Narrow' },
          },
        },
        [schema.text('body text')]
      ),
    ]);
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).fontFamily).toBe('Arial Narrow');
  });

  test('paragraph defaultTextFormatting.fontSize cascades as points', () => {
    const doc = schema.node('doc', null, [
      schema.node(
        'paragraph',
        {
          defaultTextFormatting: { fontSize: 22 }, // half-points → 11pt
        },
        [schema.text('body text')]
      ),
    ]);
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).fontSize).toBe(11);
  });

  test('field nodes inherit paragraph defaultTextFormatting (font/size)', () => {
    const field = schema.node('field', {
      fieldType: 'PAGE',
      instruction: 'PAGE',
      displayText: '1',
    });
    const doc = schema.node('doc', null, [
      schema.node(
        'paragraph',
        {
          defaultTextFormatting: {
            fontFamily: { ascii: 'Arial Narrow', hAnsi: 'Arial Narrow' },
            fontSize: 18, // half-points → 9pt footer size
          },
        },
        [field]
      ),
    ]);
    const run = firstFieldRun(toFlowBlocks(doc, {}));
    expect(run.fontFamily).toBe('Arial Narrow');
    expect(run.fontSize).toBe(9);
  });

  test('field nodes carry their own character marks (size/color/allCaps)', () => {
    const field = schema.node(
      'field',
      { fieldType: 'PAGE', instruction: 'PAGE', displayText: '1' },
      undefined,
      [
        schema.marks.fontSize.create({ size: 18 }),
        schema.marks.textColor.create({ rgb: '404040' }),
        schema.marks.allCaps.create(),
      ]
    );
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [field])]);
    const run = firstFieldRun(toFlowBlocks(doc, {}));
    expect(run.fontSize).toBe(9);
    expect(run.color).toBe('#404040');
    expect(run.allCaps).toBe(true);
  });

  test('field nodes in a TOC paragraph drop hyperlink default styling', () => {
    // A TOC entry's page number is a PAGEREF field inside the entry's
    // hyperlink. Word paints it in the TOC paragraph color, not link blue.
    const field = schema.node(
      'field',
      { fieldType: 'PAGEREF', instruction: 'PAGEREF _Toc1 \\h', displayText: '3' },
      undefined,
      [
        schema.marks.hyperlink.create({ href: '#_Toc1' }),
        schema.marks.textColor.create({ rgb: '0563C1' }),
      ]
    );
    const doc = schema.node('doc', null, [schema.node('paragraph', { styleId: 'TOC1' }, [field])]);
    const run = firstFieldRun(toFlowBlocks(doc, {}));
    expect(run.color).toBeUndefined();
    expect(run.hyperlink?.noDefaultStyle).toBe(true);
  });

  test('explicit run-level mark overrides paragraph default', () => {
    // Run sets letterSpacing via its own mark; paragraph default for fontFamily
    // still cascades. Both should appear, run mark wins on conflict.
    const mark = schema.marks.characterSpacing.create({ spacing: 16 });
    const node = schema.text('body', [mark]);
    const doc = schema.node('doc', null, [
      schema.node(
        'paragraph',
        {
          defaultTextFormatting: {
            fontFamily: { ascii: 'Cambria', hAnsi: 'Cambria' },
          },
        },
        [node]
      ),
    ]);
    const blocks = toFlowBlocks(doc, {});
    const run = firstRun(blocks);
    expect(run.fontFamily).toBe('Cambria');
    expect(run.letterSpacing).toBeCloseTo(1.0667, 3);
  });
});
