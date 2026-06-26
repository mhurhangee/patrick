/**
 * Regression — text boxes in headers and footers must be parsed the same way
 * as text boxes in the document body. Headers/footers carry the same
 * block-level content model (ECMA-376 CT_HdrFtr ≈ CT_Body), so they flow
 * through the shared `parseBlockContent` and reach the text-box pipeline.
 *
 * Before the shared block-content parser, `parseHeaderFooterContent` called
 * `parseParagraph` directly and never ran the text-box enrichment pass, so
 * any text box in a header or footer was silently dropped (issue #318).
 */

import { describe, expect, test } from 'bun:test';
import { parseHeader, parseFooter } from '../headerFooterParser';
import type { HeaderFooter, Paragraph } from '../../types/document';

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';

/** A wps:wsp text box, optionally wrapped in mc:AlternateContent. */
function textBoxRun(label: string, wrapInAlternateContent: boolean): string {
  const drawing = `
    <w:drawing>
      <wp:anchor distT="45720" distB="45720" distL="114300" distR="114300"
        simplePos="0" relativeHeight="251695104" behindDoc="0" locked="0"
        layoutInCell="1" allowOverlap="1">
        <wp:simplePos x="0" y="0"/>
        <wp:positionH relativeFrom="margin"><wp:align>right</wp:align></wp:positionH>
        <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
        <wp:extent cx="1390650" cy="278130"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:wrapNone/>
        <wp:docPr id="1" name="Text Box 1"/>
        <wp:cNvGraphicFramePr/>
        <a:graphic>
          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
            <wps:wsp>
              <wps:cNvSpPr txBox="1"/>
              <wps:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="1390650" cy="278130"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </wps:spPr>
              <wps:txbx>
                <w:txbxContent>
                  <w:p><w:r><w:t>${label}</w:t></w:r></w:p>
                </w:txbxContent>
              </wps:txbx>
              <wps:bodyPr/>
            </wps:wsp>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;
  const inner = wrapInAlternateContent
    ? `<mc:AlternateContent>
         <mc:Choice Requires="wps">${drawing}</mc:Choice>
         <mc:Fallback><w:pict/></mc:Fallback>
       </mc:AlternateContent>`
    : drawing;
  return `<w:r>${inner}</w:r>`;
}

function headerXml(roots: 'hdr' | 'ftr', label: string, wrapInAC: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:${roots} ${NS}>
      <w:p>${textBoxRun(label, wrapInAC)}</w:p>
    </w:${roots}>`;
}

/** Pull every ShapeContent's first inner text out of a header/footer. */
function shapeTexts(hf: HeaderFooter): string[] {
  return hf.content
    .filter((b): b is Paragraph => b.type === 'paragraph')
    .flatMap((p) =>
      p.content.flatMap((c) =>
        c.type === 'run' ? c.content.filter((rc) => rc.type === 'shape') : []
      )
    )
    .map((shape) => {
      if (shape.type !== 'shape') throw new Error('expected shape');
      const innerPara = shape.shape.textBody?.content[0];
      if (innerPara?.type !== 'paragraph') throw new Error('expected paragraph');
      const innerRun = innerPara.content[0];
      if (innerRun?.type !== 'run') throw new Error('expected run');
      const innerText = innerRun.content[0];
      if (innerText?.type !== 'text') throw new Error('expected text');
      return innerText.text;
    });
}

describe('header/footer text boxes', () => {
  test('header: AlternateContent-wrapped wps:wsp text box is parsed', () => {
    const header = parseHeader(headerXml('hdr', 'Header Box', true));
    expect(shapeTexts(header)).toEqual(['Header Box']);
  });

  test('header: bare w:drawing wps:wsp text box is parsed', () => {
    const header = parseHeader(headerXml('hdr', 'Bare Header Box', false));
    expect(shapeTexts(header)).toEqual(['Bare Header Box']);
  });

  test('footer: AlternateContent-wrapped wps:wsp text box is parsed', () => {
    const footer = parseFooter(headerXml('ftr', 'Footer Box', true));
    expect(shapeTexts(footer)).toEqual(['Footer Box']);
  });
});
