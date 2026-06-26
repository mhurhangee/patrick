import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocx } from '../../../docx/parser';
import { toProseDoc } from '../toProseDoc';
import { fromProseDoc } from '../fromProseDoc';
import { textBoxAnchorAttrsFromDocx } from '../textBoxAnchors';

const FIXTURE = resolve(process.cwd(), 'e2e/fixtures/issue-472-floating-textbox.docx');

describe('issue #472 anchored text box conversion', () => {
  test('preserves anchor and wrap metadata on import', async () => {
    const buffer = readFileSync(FIXTURE);
    const doc = await parseDocx(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
    const pmDoc = toProseDoc(doc, { styles: doc.package.styles });

    const nodes: Array<{ type: string; text: string; attrs: Record<string, unknown> }> = [];
    pmDoc.forEach((node) => {
      nodes.push({ type: node.type.name, text: node.textContent, attrs: node.attrs });
    });

    expect(nodes[1]?.type).toBe('textBox');
    expect(nodes[2]?.type).toBe('paragraph');
    expect(nodes[2]?.text).toContain('Northwind Sample Works');
    expect(nodes[1]?.attrs).toMatchObject({
      displayMode: 'float',
      cssFloat: 'none',
      wrapType: 'square',
      wrapText: 'bothSides',
      anchorTarget: 'followingBlock',
      distTop: 0,
      distBottom: 0,
      distLeft: 12,
      distRight: 12,
      position: {
        horizontal: { relativeTo: 'margin', posOffset: 2076450 },
        vertical: { relativeTo: 'page', posOffset: 2279650 },
      },
    });
  });

  test('exports anchored text box back into its following paragraph', async () => {
    const buffer = readFileSync(FIXTURE);
    const doc = await parseDocx(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
    const pmDoc = toProseDoc(doc, { styles: doc.package.styles });
    const roundTripped = fromProseDoc(pmDoc, doc);
    const body = roundTripped.package.document.content;

    expect(body[1]?.type).toBe('paragraph');
    const paragraph = body[1];
    if (paragraph?.type !== 'paragraph') {
      throw new Error('Expected second body block to be paragraph');
    }

    const firstRun = paragraph.content[0];
    expect(firstRun?.type).toBe('run');
    if (firstRun?.type !== 'run') {
      throw new Error('Expected first content item to be a run');
    }

    const shapeContent = firstRun.content[0];
    expect(shapeContent?.type).toBe('shape');
    if (shapeContent?.type !== 'shape') {
      throw new Error('Expected first run content to be a shape');
    }

    expect(shapeContent.shape.wrap).toMatchObject({
      type: 'square',
      wrapText: 'bothSides',
      distT: 0,
      distB: 0,
      distL: 114300,
      distR: 114300,
    });
    expect(shapeContent.shape.position).toMatchObject({
      horizontal: { relativeTo: 'margin', posOffset: 2076450 },
      vertical: { relativeTo: 'page', posOffset: 2279650 },
    });
    expect(paragraph.content[1]?.type).toBe('run');
  });

  test('marks every non-inline DOCX text box as anchored for export', () => {
    const attrs = textBoxAnchorAttrsFromDocx({
      type: 'textBox',
      size: { width: 100, height: 100 },
      wrap: { type: 'topAndBottom' },
      content: [],
    });

    expect(attrs.displayMode).toBe('block');
    expect(attrs.anchorTarget).toBe('followingBlock');
  });
});
