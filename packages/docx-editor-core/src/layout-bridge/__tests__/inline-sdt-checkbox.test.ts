import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';

import { singletonManager } from '../../prosemirror/schema';
import { toFlowBlocks } from '../toFlowBlocks';
import type { ParagraphBlock, TextRun } from '../../layout-engine/types';

const schema = singletonManager.getSchema();

function inlineCheckbox(attrs: Record<string, unknown>, text: string) {
  return schema.nodes.sdt.create(attrs, schema.text(text));
}

function firstTextRun(blocks: unknown[]): TextRun {
  const para = blocks.find((b) => (b as ParagraphBlock).kind === 'paragraph') as ParagraphBlock;
  const run = para.runs!.find(
    (r) => r.kind === 'text' && r.text.includes(String.fromCodePoint(0x2610))
  );
  expect(run?.kind).toBe('text');
  return run as TextRun;
}

describe('toFlowBlocks — inline checkbox SDT widgets', () => {
  test('marks the visible checkbox glyph run with inline widget metadata', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('generic option '),
        inlineCheckbox(
          {
            sdtType: 'checkbox',
            tag: 'option-alpha',
            alias: 'Option alpha',
            checked: false,
            rawPropertiesXml:
              '<w:sdtPr><w:tag w:val="option-alpha"/><w14:checkbox>' +
              '<w14:checked w14:val="0"/><w14:checkedState w14:val="2612"/>' +
              '<w14:uncheckedState w14:val="2610"/></w14:checkbox></w:sdtPr>',
          },
          String.fromCodePoint(0x2610)
        ),
      ]),
    ]);
    const state = EditorState.create({ schema, doc });
    const blocks = toFlowBlocks(state.doc, {});
    const run = firstTextRun(blocks);

    expect(run.inlineSdtWidget).toEqual({
      kind: 'checkbox',
      groupId: `sdt@${run.inlineSdtWidget!.pos}`,
      pos: run.inlineSdtWidget!.pos,
      tag: 'option-alpha',
      alias: 'Option alpha',
      checked: false,
    });
  });

  test('does not expose locked inline checkbox controls as widgets', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        inlineCheckbox(
          {
            sdtType: 'checkbox',
            tag: 'locked',
            lock: 'sdtContentLocked',
            checked: false,
            rawPropertiesXml:
              '<w:sdtPr><w:tag w:val="locked"/><w:lock w:val="sdtContentLocked"/>' +
              '<w14:checkbox><w14:checked w14:val="0"/></w14:checkbox></w:sdtPr>',
          },
          String.fromCodePoint(0x2610)
        ),
      ]),
    ]);
    const state = EditorState.create({ schema, doc });
    const blocks = toFlowBlocks(state.doc, {});
    expect(firstTextRun(blocks).inlineSdtWidget).toBeUndefined();
  });
});
