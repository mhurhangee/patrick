import { describe, expect, test } from 'bun:test';
import type { XmlElement } from './xmlParser';
import { parseXmlDocument } from './xmlParser';
import { parseParagraph } from './paragraphParser';

function parseParagraphXml(xml: string) {
  const root = parseXmlDocument(xml) as XmlElement | null;
  if (!root) {
    throw new Error('Failed to parse paragraph XML fixture');
  }
  return parseParagraph(root, null, null, null, null, null);
}

describe('parseParagraph run-boundary preservation', () => {
  test('keeps adjacent same-formatting runs and leading empty runs', () => {
    const paragraph = parseParagraphXml(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:r>
          <w:rPr><w:b/></w:rPr>
        </w:r>
        <w:r>
          <w:rPr><w:b/></w:rPr>
          <w:t>one</w:t>
        </w:r>
        <w:r>
          <w:rPr><w:b/></w:rPr>
          <w:t>two</w:t>
        </w:r>
        <w:r>
          <w:rPr><w:b/></w:rPr>
          <w:t>three</w:t>
        </w:r>
      </w:p>
    `);

    const runs = paragraph.content.filter((content) => content.type === 'run');
    expect(runs).toHaveLength(4);
    expect(
      runs.map((run) => run.content.map((item) => (item.type === 'text' ? item.text : '')).join(''))
    ).toEqual(['', 'one', 'two', 'three']);
    expect(runs.every((run) => run.formatting?.bold === true)).toBe(true);
  });
});

describe('parseParagraph tracked-change hardening', () => {
  test('parses deletion text from w:delText runs', () => {
    const paragraph = parseParagraphXml(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:del w:id="7" w:author="Reviewer" w:date="2026-02-22T10:00:00Z">
          <w:r>
            <w:delText xml:space="preserve"> removed </w:delText>
          </w:r>
        </w:del>
      </w:p>
    `);

    const deletion = paragraph.content[0];
    expect(deletion?.type).toBe('deletion');
    if (!deletion || deletion.type !== 'deletion') return;

    expect(deletion.info.id).toBe(7);
    expect(deletion.info.author).toBe('Reviewer');
    expect(deletion.info.date).toBe('2026-02-22T10:00:00Z');
    expect(deletion.content).toHaveLength(1);
    const run = deletion.content[0];
    expect(run.type).toBe('run');
    if (run.type !== 'run') return;

    expect(run.content).toHaveLength(1);
    expect(run.content[0].type).toBe('text');
    if (run.content[0].type !== 'text') return;
    expect(run.content[0].text).toBe(' removed ');
    expect(run.content[0].preserveSpace).toBe(true);
  });

  test('parses deletion instruction text from w:delInstrText', () => {
    const paragraph = parseParagraphXml(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:del w:id="8" w:author="Reviewer">
          <w:r>
            <w:delInstrText> MERGEFIELD name </w:delInstrText>
          </w:r>
        </w:del>
      </w:p>
    `);

    const deletion = paragraph.content[0];
    expect(deletion?.type).toBe('deletion');
    if (!deletion || deletion.type !== 'deletion') return;

    const run = deletion.content[0];
    expect(run.type).toBe('run');
    if (run.type !== 'run') return;

    expect(run.content).toHaveLength(1);
    expect(run.content[0].type).toBe('instrText');
    if (run.content[0].type !== 'instrText') return;
    expect(run.content[0].text).toBe(' MERGEFIELD name ');
  });

  test('normalizes tracked-change metadata when attributes are invalid or blank', () => {
    const paragraph = parseParagraphXml(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:ins w:id="invalid" w:author="   " w:date="   ">
          <w:r><w:t>Added</w:t></w:r>
        </w:ins>
      </w:p>
    `);

    const insertion = paragraph.content[0];
    expect(insertion?.type).toBe('insertion');
    if (!insertion || insertion.type !== 'insertion') return;

    expect(insertion.info.id).toBe(0);
    expect(insertion.info.author).toBe('Unknown');
    expect(insertion.info.date).toBeUndefined();
  });
});

describe('parseParagraph rendered page break markers', () => {
  test('marks a paragraph when Word rendered-page-break appears before visible text', () => {
    const paragraph = parseParagraphXml(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:proofErr w:type="spellStart"/>
        <w:r>
          <w:lastRenderedPageBreak/>
          <w:t>Moved to next page</w:t>
        </w:r>
      </w:p>
    `);

    expect(paragraph.renderedPageBreakBefore).toBe(true);
  });

  test('marks a paragraph when a page break appears before visible text', () => {
    const paragraph = parseParagraphXml(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:r>
          <w:br w:type="page"/>
          <w:t>After hard break</w:t>
        </w:r>
      </w:p>
    `);

    expect(paragraph.renderedPageBreakBefore).toBe(true);
  });

  test('does not mark a paragraph when rendered page break follows visible text', () => {
    const paragraph = parseParagraphXml(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:r>
          <w:t>Previous page text</w:t>
          <w:lastRenderedPageBreak/>
        </w:r>
      </w:p>
    `);

    expect(paragraph.renderedPageBreakBefore).toBeUndefined();
  });
});

describe('parseParagraph SDT content preservation', () => {
  test('keeps a simple field that lives inside an inline SDT', () => {
    const paragraph = parseParagraphXml(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:sdt>
          <w:sdtPr><w:alias w:val="title-control"/></w:sdtPr>
          <w:sdtContent>
            <w:fldSimple w:instr="TITLE">
              <w:r><w:t>Cached title</w:t></w:r>
            </w:fldSimple>
          </w:sdtContent>
        </w:sdt>
      </w:p>
    `);

    expect(paragraph.content).toHaveLength(1);
    const sdt = paragraph.content[0];
    expect(sdt.type).toBe('inlineSdt');
    if (sdt.type !== 'inlineSdt') return;
    expect(sdt.content).toHaveLength(1);
    expect(sdt.content[0].type).toBe('simpleField');
  });

  test('keeps a nested inline SDT inside an inline SDT', () => {
    const paragraph = parseParagraphXml(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:sdt>
          <w:sdtPr><w:alias w:val="outer"/></w:sdtPr>
          <w:sdtContent>
            <w:sdt>
              <w:sdtPr><w:alias w:val="inner"/></w:sdtPr>
              <w:sdtContent>
                <w:r><w:t>Nested text</w:t></w:r>
              </w:sdtContent>
            </w:sdt>
          </w:sdtContent>
        </w:sdt>
      </w:p>
    `);

    const outer = paragraph.content[0];
    expect(outer.type).toBe('inlineSdt');
    if (outer.type !== 'inlineSdt') return;
    expect(outer.content).toHaveLength(1);
    expect(outer.content[0].type).toBe('inlineSdt');
  });
});

describe('parseParagraph complex field formatting', () => {
  test('captures run formatting from a PAGE field collapsed into one run with no result', () => {
    // Footer pattern: begin/instrText/separate/end all in a single run carrying
    // the w:rPr, with no separate result run. The formatting must survive on the
    // ComplexField so the rendered page number keeps the footer's size/color.
    const paragraph = parseParagraphXml(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:r>
          <w:rPr><w:color w:val="595959"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr>
          <w:fldChar w:fldCharType="begin"/>
          <w:instrText xml:space="preserve">PAGE</w:instrText>
          <w:fldChar w:fldCharType="separate"/>
          <w:fldChar w:fldCharType="end"/>
        </w:r>
      </w:p>
    `);

    const field = paragraph.content.find((c) => c.type === 'complexField');
    expect(field?.type).toBe('complexField');
    if (!field || field.type !== 'complexField') return;
    expect(field.fieldType).toBe('PAGE');
    expect(field.fieldResult).toHaveLength(0);
    expect(field.formatting?.color).toEqual({ rgb: '595959' });
    expect(field.formatting?.fontSize).toBe(14); // raw w:sz half-points (7pt)
  });
});
