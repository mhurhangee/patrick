import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { toFlowBlocks } from '../toFlowBlocks';
import type { ParagraphBlock, TextRun } from '../../layout-engine/types';

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
  },
  marks: {
    hyperlink: {
      attrs: { href: {}, tooltip: { default: null }, rId: { default: null } },
    },
    textColor: {
      attrs: { rgb: { default: null } },
    },
    underline: {
      attrs: { style: { default: 'single' }, color: { default: null } },
    },
  },
});

function buildTocLikeDoc(paragraphStyleId: string | null) {
  const marks = [
    schema.marks.hyperlink.create({ href: '#_Toc1' }),
    schema.marks.textColor.create({ rgb: '0000FF' }),
    schema.marks.underline.create({ style: 'single' }),
  ];
  const text = schema.text('Introduction', marks);
  return schema.node('doc', null, [
    schema.node('paragraph', { styleId: paragraphStyleId }, [text]),
  ]);
}

function firstTextRun(blocks: unknown[]): TextRun {
  const para = blocks.find((b) => (b as ParagraphBlock).kind === 'paragraph') as ParagraphBlock;
  return para.runs!.find((r) => r.kind === 'text') as TextRun;
}

describe('toFlowBlocks — TOC paragraph suppresses hyperlink visual styling', () => {
  test('TOC1 paragraph: hyperlink run loses color/underline and gains noDefaultStyle', () => {
    const blocks = toFlowBlocks(buildTocLikeDoc('TOC1'), {});
    const run = firstTextRun(blocks);
    expect(run.hyperlink?.href).toBe('#_Toc1');
    expect(run.hyperlink?.noDefaultStyle).toBe(true);
    expect(run.color).toBeUndefined();
    expect(run.underline).toBeUndefined();
  });

  test('Normal paragraph: hyperlink retains resolved color and underline', () => {
    const blocks = toFlowBlocks(buildTocLikeDoc('Normal'), {});
    const run = firstTextRun(blocks);
    expect(run.hyperlink?.noDefaultStyle).toBeUndefined();
    expect(run.color).toBe('#0000FF');
    expect(run.underline).toBeDefined();
  });
});
