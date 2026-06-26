/**
 * Regression (hardening after #740): an explicit `w:distL="0"` / `w:distR="0"`
 * on a text-wrapping floating image — the image butted flush against the
 * wrapped text — was treated as falsy in the EMU→px conversion and collapsed to
 * `undefined`, so the float-zone fell back to its non-zero default (12px L/R),
 * opening a phantom horizontal gap Word never shows. An explicit 0 must survive;
 * only an ABSENT distance falls back. (Same falsy-zero class as the page-margin
 * and header-distance fixes.)
 */

import { describe, expect, test } from 'bun:test';
import { parseDrawing } from '../../../docx/imageParser';
import { parseXml, type XmlElement } from '../../../docx/xmlParser';
import { convertRun } from '../toProseDoc/runs';
import type { Image, Run } from '../../../types/document';

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');

/** A square-wrap floating image whose four wrap distances are `distAttrs`. */
function floatingImage(distAttrs: string): Image | null {
  const doc = parseXml(`<w:drawing ${NS}>
    <wp:anchor ${distAttrs} simplePos="0" relativeHeight="0" behindDoc="0" locked="0"
               layoutInCell="1" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="margin"><wp:align>left</wp:align></wp:positionH>
      <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
      <wp:extent cx="914400" cy="914400"/>
      <wp:wrapSquare wrapText="bothSides"/>
      <wp:docPr id="1" name="img"/>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic>
          <pic:nvPicPr><pic:cNvPr id="1" name="img"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></pic:spPr>
        </pic:pic>
      </a:graphicData></a:graphic>
    </wp:anchor>
  </w:drawing>`);
  const drawing = (doc.elements as XmlElement[])[0];
  return parseDrawing(drawing, undefined, undefined);
}

/** Convert an Image through the run pipeline and read the image node's attrs. */
function imageAttrs(image: Image): Record<string, unknown> {
  const run: Run = { type: 'run', content: [{ type: 'drawing', image }] };
  const node = convertRun(run).find((n) => n.type.name === 'image');
  if (!node) throw new Error('no image node produced');
  return node.attrs;
}

describe('image wrap distance — explicit 0 honored', () => {
  test('distL/distR="0" survive as 0 (not the float-zone 12px default)', () => {
    const img = floatingImage('distT="0" distB="0" distL="0" distR="0"');
    expect(img).not.toBeNull();
    const attrs = imageAttrs(img!);
    expect(attrs.distLeft).toBe(0);
    expect(attrs.distRight).toBe(0);
    expect(attrs.distTop).toBe(0);
    expect(attrs.distBottom).toBe(0);
  });

  test('a non-zero wrap distance still converts EMU→px', () => {
    // 114300 EMU = 0.125in = 12px (Word's default L/R wrap distance).
    const img = floatingImage('distT="0" distB="0" distL="114300" distR="114300"');
    const attrs = imageAttrs(img!);
    expect(attrs.distLeft).toBe(12);
    expect(attrs.distRight).toBe(12);
  });
});
