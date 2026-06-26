import { describe, test, expect } from 'bun:test';
import { parseNumbering, formatNumber, createNumberingMap } from '../numberingParser';
import { parseParagraph } from '../paragraphParser';
import { parseStyles } from '../styleParser';
import { parseXmlDocument, type XmlElement } from '../xmlParser';
import { resolveListTemplate } from '../../layout-bridge/toFlowBlocks/listMarkers';
import { listAttrsFromResolvedStyle } from '../../prosemirror/styles/resolvedStyleAttrs';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

// Word emits custom number formats (here: zero-padded to 4 digits) wrapped in
// mc:AlternateContent — the Choice carries the custom format, the Fallback a
// plain decimal for pre-w14 readers. Mirrors the numbering.xml from issue #765.
const NUMBERING_CUSTOM = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W} ${MC}>
  <w:abstractNum w:abstractNumId="6">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <mc:AlternateContent>
        <mc:Choice Requires="w14">
          <w:numFmt w:val="custom" w:format="0001, 0002, 0003, ..."/>
        </mc:Choice>
        <mc:Fallback>
          <w:numFmt w:val="decimal"/>
        </mc:Fallback>
      </mc:AlternateContent>
      <w:lvlText w:val="[%1]"/>
      <w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="10">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="[Claim %1]"/>
      <w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="6"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="10"/></w:num>
</w:numbering>`;

// AppBody-Claim mirrors the issue-#765 style: numbering attached via the
// style's pPr, with the style defining its own (wider) indentation.
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:pPr><w:ind w:left="720"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="AppBody-Claim">
    <w:name w:val="AppBody-Claim"/>
    <w:basedOn w:val="ListParagraph"/>
    <w:pPr>
      <w:numPr><w:numId w:val="2"/></w:numPr>
      <w:spacing w:after="120" w:line="360" w:lineRule="auto"/>
      <w:ind w:left="1134" w:hanging="1134"/>
    </w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="NoIndentNumbered">
    <w:name w:val="NoIndentNumbered"/>
    <w:pPr>
      <w:numPr><w:numId w:val="2"/></w:numPr>
    </w:pPr>
  </w:style>
</w:styles>`;

function paragraphXml(inner: string): XmlElement {
  const root = parseXmlDocument(`<w:p ${W}>${inner}</w:p>`);
  if (!root) throw new Error('Failed to parse paragraph XML');
  return root;
}

describe('custom numFmt inside mc:AlternateContent (#765)', () => {
  const numbering = parseNumbering(NUMBERING_CUSTOM);

  test('parses w:numFmt val="custom" format="0001, ..." as decimalZero4', () => {
    expect(numbering.getLevel(1, 0)?.numFmt).toBe('decimalZero4');
  });

  test('renders zero-padded markers through the lvlText template', () => {
    expect(resolveListTemplate('[%1]', [1], ['decimalZero4'])).toBe('[0001]');
    expect(resolveListTemplate('[%1]', [12], ['decimalZero4'])).toBe('[0012]');
    expect(resolveListTemplate('[%1]', [12345], ['decimalZero4'])).toBe('[12345]');
  });

  test('uses the mc:Fallback when the Choice format is not implemented', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W} ${MC}>
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <mc:AlternateContent>
        <mc:Choice Requires="w16du">
          <w:numFmt w:val="futureFmt"/>
        </mc:Choice>
        <mc:Fallback>
          <w:numFmt w:val="lowerRoman"/>
        </mc:Fallback>
      </mc:AlternateContent>
      <w:lvlText w:val="%1."/>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;
    expect(parseNumbering(xml).getLevel(1, 0)?.numFmt).toBe('lowerRoman');
  });

  test('formatNumber pads the decimalZero family', () => {
    expect(formatNumber(7, 'decimalZero')).toBe('07');
    expect(formatNumber(7, 'decimalZero3')).toBe('007');
    expect(formatNumber(7, 'decimalZero4')).toBe('0007');
    expect(formatNumber(7, 'decimalZero5')).toBe('00007');
  });
});

describe('style-attached numbering and indentation (#765)', () => {
  const numbering = parseNumbering(NUMBERING_CUSTOM);
  const styles = parseStyles(STYLES_XML, null);

  test('style ind wins over numbering level ind when numPr comes from the style', () => {
    const para = parseParagraph(
      paragraphXml('<w:pPr><w:pStyle w:val="AppBody-Claim"/></w:pPr>'),
      styles,
      null,
      numbering
    );
    expect(para.listRendering?.marker).toBe('[Claim %1]');
    // The level's 360/360 must NOT be baked into the paragraph formatting;
    // the style's 1134/1134 flows in via the style fallback downstream.
    expect(para.formatting?.indentLeft).toBeUndefined();
    expect(para.formatting?.indentFirstLine).toBeUndefined();
  });

  test('numbering level ind still applies when the style chain defines none', () => {
    const para = parseParagraph(
      paragraphXml('<w:pPr><w:pStyle w:val="NoIndentNumbered"/></w:pPr>'),
      styles,
      null,
      numbering
    );
    expect(para.formatting?.indentLeft).toBe(360);
    expect(para.formatting?.indentFirstLine).toBe(-360);
  });

  test('numbering level ind still applies for direct (non-style) numPr', () => {
    const para = parseParagraph(
      paragraphXml('<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>'),
      null,
      null,
      numbering
    );
    expect(para.formatting?.indentLeft).toBe(360);
  });

  test('style-attached numbering records numPrFromStyle provenance', () => {
    const para = parseParagraph(
      paragraphXml('<w:pPr><w:pStyle w:val="AppBody-Claim"/></w:pPr>'),
      styles,
      null,
      numbering
    );
    expect(para.formatting?.numPr).toEqual({ numId: 2 });
    expect(para.formatting?.numPrFromStyle).toEqual({ numId: 2 });
  });

  test('direct numPr records no provenance', () => {
    const para = parseParagraph(
      paragraphXml('<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>'),
      styles,
      null,
      numbering
    );
    expect(para.formatting?.numPrFromStyle).toBeUndefined();
  });
});

describe('style vs direct w:ind merge in toProseDoc', () => {
  const styleDefs = {
    styles: [
      {
        styleId: 'Body',
        type: 'paragraph' as const,
        pPr: { indentFirstLine: 567 },
      },
      {
        styleId: 'Numbered',
        type: 'paragraph' as const,
        pPr: { numPr: { numId: 1 }, indentLeft: 357, indentFirstLine: -357, hangingIndent: true },
      },
    ],
  };

  function pmAttrsFor(formatting: Record<string, unknown>) {
    const doc = {
      package: {
        document: {
          content: [{ type: 'paragraph' as const, content: [], formatting }],
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pmDoc = toProseDoc(doc as any, { styles: styleDefs as any });
    let attrs: Record<string, unknown> = {};
    pmDoc.descendants((node) => {
      if (node.type.name === 'paragraph') attrs = node.attrs;
      return false;
    });
    return attrs;
  }

  test('direct left-only ind keeps the style firstLine (Word Increase Indent)', () => {
    const attrs = pmAttrsFor({ styleId: 'Body', indentLeft: 720 });
    expect(attrs.indentLeft).toBe(720);
    expect(attrs.indentFirstLine).toBe(567);
  });

  test('removing style numbering (numId 0) drops the style hanging too', () => {
    const attrs = pmAttrsFor({
      styleId: 'Numbered',
      numPr: { numId: 0, ilvl: 0 },
      indentLeft: 357,
    });
    expect(attrs.indentLeft).toBe(357);
    expect(attrs.indentFirstLine ?? null).toBeNull();
    expect(attrs.hangingIndent ?? false).toBe(false);
  });
});

describe('listAttrsFromResolvedStyle (#765 applyStyle)', () => {
  const numbering = parseNumbering(NUMBERING_CUSTOM);
  const map = createNumberingMap({
    abstractNums: numbering.definitions.abstractNums,
    nums: numbering.definitions.nums,
  });

  test('projects the style numPr into numPr + marker attrs', () => {
    const attrs = listAttrsFromResolvedStyle(
      { paragraphFormatting: { numPr: { numId: 2 }, indentLeft: 1134 } },
      map
    );
    expect(attrs).not.toBeNull();
    expect(attrs?.numPr).toEqual({ numId: 2, ilvl: 0 });
    expect(attrs?.listMarker).toBe('[Claim %1]');
    expect(attrs?.listNumFmt).toBe('decimal');
    expect(attrs?.listAbstractNumId).toBe(10);
    // Style defines its own indent — the level's must not be projected.
    expect(attrs?.indentLeft).toBeUndefined();
  });

  test('falls back to the numbering level indents when the style has none', () => {
    const attrs = listAttrsFromResolvedStyle({ paragraphFormatting: { numPr: { numId: 2 } } }, map);
    expect(attrs?.indentLeft).toBe(360);
    expect(attrs?.indentFirstLine).toBe(-360);
    expect(attrs?.hangingIndent).toBe(true);
  });

  test('returns null for styles without numbering or with numId 0', () => {
    expect(
      listAttrsFromResolvedStyle({ paragraphFormatting: { indentLeft: 100 } }, map)
    ).toBeNull();
    expect(
      listAttrsFromResolvedStyle({ paragraphFormatting: { numPr: { numId: 0 } } }, map)
    ).toBeNull();
  });
});
