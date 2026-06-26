/**
 * Unit tests for contributesToHeaderFooterFlowHeight (issue #705).
 *
 * Only IN-FLOW header/footer content grows the band that pushes the body
 * margin. Anchored / floating objects (page or margin-anchored shapes, e.g. a
 * letterhead) are positioned on the page and must NOT contribute.
 */

import { describe, test, expect } from 'bun:test';
import {
  contributesToHeaderFooterFlowHeight,
  calculateHeaderFooterVisualBounds,
} from '../headerFooterLayout';
import type {
  FlowBlock,
  ImageBlock,
  Measure,
  ParagraphBlock,
  TextBoxBlock,
} from '../../layout-engine/types';

const paragraph: ParagraphBlock = {
  kind: 'paragraph',
  id: 'p',
  runs: [{ kind: 'text', text: 'hi' }],
};

const table: FlowBlock = { kind: 'table', id: 't', rows: [] };

function image(anchored: boolean): ImageBlock {
  return {
    kind: 'image',
    id: 'img',
    src: 'logo.png',
    width: 100,
    height: 50,
    anchor: anchored ? { isAnchored: true } : undefined,
  };
}

function textBox(displayMode: TextBoxBlock['displayMode']): TextBoxBlock {
  return { kind: 'textBox', id: 'tb', width: 200, height: 400, content: [], displayMode };
}

describe('contributesToHeaderFooterFlowHeight', () => {
  test('paragraphs and tables always count', () => {
    expect(contributesToHeaderFooterFlowHeight(paragraph)).toBe(true);
    expect(contributesToHeaderFooterFlowHeight(table)).toBe(true);
  });

  test('inline images count; anchored images do not', () => {
    expect(contributesToHeaderFooterFlowHeight(image(false))).toBe(true);
    expect(contributesToHeaderFooterFlowHeight(image(true))).toBe(false);
  });

  test('inline text boxes count; floating / block text boxes do not', () => {
    expect(contributesToHeaderFooterFlowHeight(textBox('inline'))).toBe(true);
    expect(contributesToHeaderFooterFlowHeight(textBox(undefined))).toBe(true);
    // A page-anchored letterhead text box (the #705 trigger).
    expect(contributesToHeaderFooterFlowHeight(textBox('float'))).toBe(false);
    expect(contributesToHeaderFooterFlowHeight(textBox('block'))).toBe(false);
  });

  test('structural breaks never count', () => {
    expect(contributesToHeaderFooterFlowHeight({ kind: 'pageBreak', id: 'pb' } as FlowBlock)).toBe(
      false
    );
    expect(contributesToHeaderFooterFlowHeight({ kind: 'sectionBreak' } as FlowBlock)).toBe(false);
  });
});

/**
 * The header *container* height (and therefore the hover-highlight box) comes
 * from `visualBottom`. A floating box must extend the bounds (so it isn't
 * clipped) WITHOUT advancing the in-flow cursor — otherwise the box reads
 * taller than the painted content. Mirrors the painter (#705/#729).
 */
describe('calculateHeaderFooterVisualBounds — floating text box', () => {
  const para = (h: number): { block: ParagraphBlock; measure: Measure } => ({
    block: { kind: 'paragraph', id: 'p', runs: [] },
    measure: { kind: 'paragraph', lines: [], totalHeight: h },
  });
  const tb = (
    h: number,
    displayMode: TextBoxBlock['displayMode']
  ): { block: TextBoxBlock; measure: Measure } => ({
    block: { kind: 'textBox', id: 'tb', width: 200, height: h, content: [], displayMode },
    measure: { kind: 'textBox', width: 200, height: h, innerMeasures: [] },
  });
  const metrics = {
    section: 'header' as const,
    pageSize: { w: 744, h: 1123 },
    margins: { top: 102, right: 72, bottom: 72, left: 72, header: 48, footer: 48 },
  };
  const bounds = (items: Array<{ block: FlowBlock; measure: Measure }>) => {
    const blocks = items.map((i) => i.block);
    const measures = items.map((i) => i.measure);
    const total = measures.reduce(
      (s, m) => s + (m.kind === 'paragraph' ? m.totalHeight : m.kind === 'textBox' ? m.height : 0),
      0
    );
    return calculateHeaderFooterVisualBounds(blocks, measures, total, metrics);
  };

  test('a leading float does not push the in-flow extent down', () => {
    // float(33) first + three 18px paragraphs. The float must not advance the
    // cursor: visualBottom = in-flow extent 54, NOT the stacked total 87.
    const items = [tb(33, 'float'), para(18), para(18), para(18)];
    expect(bounds(items).visualBottom).toBe(54);
  });

  test('inline / topAndBottom boxes still advance (stacked extent)', () => {
    expect(bounds([tb(33, 'inline'), para(18)]).visualBottom).toBe(51);
    expect(bounds([tb(33, 'block'), para(18)]).visualBottom).toBe(51);
  });

  test('a tall float still extends the bounds so it is not clipped', () => {
    // A 400px float after an 18px paragraph: it does not advance the cursor, but
    // its extent (18..418, at the current cursor) still grows visualBottom so
    // the container is tall enough to show it (the #705 letterhead case).
    expect(bounds([para(18), tb(400, 'float')]).visualBottom).toBe(418);
  });
});
