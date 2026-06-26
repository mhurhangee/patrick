import { describe, expect, test } from 'bun:test';
import { schema } from '../../schema';
import type { Document, Paragraph, Run } from '../../../types/document';
import { fromProseDoc } from '../fromProseDoc';
import { toProseDoc } from '../toProseDoc';

function docOf(paragraph: Paragraph): Document {
  return {
    package: {
      document: {
        content: [paragraph],
      },
    },
  };
}

function textRun(text: string): Run {
  return {
    type: 'run',
    formatting: { bold: true, italic: true, underline: { style: 'single' } },
    content: [{ type: 'text', text }],
  };
}

function runTexts(paragraph: Paragraph): string[] {
  return paragraph.content
    .filter((content): content is Run => content.type === 'run')
    .map((run) => run.content.map((item) => (item.type === 'text' ? item.text : '')).join(''));
}

describe('toProseDoc/fromProseDoc run boundaries', () => {
  test('no-op PM round-trip preserves adjacent same-formatting runs and empty runs', () => {
    const paragraph: Paragraph = {
      type: 'paragraph',
      content: [
        { type: 'run', formatting: { bold: true }, content: [] },
        textRun('one'),
        textRun('two'),
        textRun('three'),
        textRun('four'),
        textRun('five'),
        textRun('six'),
        textRun('seven'),
      ],
    };
    const input = docOf(paragraph);

    const pmDoc = toProseDoc(input);
    const pmParagraph = pmDoc.firstChild!;
    expect(pmParagraph.childCount).toBe(1);
    expect(pmParagraph.textContent).toBe('onetwothreefourfivesixseven');

    const roundTripped = fromProseDoc(pmDoc, input);
    const outParagraph = roundTripped.package.document.content[0] as Paragraph;

    expect(runTexts(outParagraph)).toEqual([
      '',
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
    ]);
    expect((outParagraph.content[0] as Run).formatting).toEqual({ bold: true });
  });

  test('stale source boundaries do not override a formatting edit', () => {
    const paragraph: Paragraph = {
      type: 'paragraph',
      content: [textRun('one'), textRun('two')],
    };
    const input = docOf(paragraph);
    const pmDoc = toProseDoc(input);
    const attrs = pmDoc.firstChild!.attrs;
    const marks = [
      schema.marks.bold.create(),
      schema.marks.italic.create(),
      schema.marks.underline.create({ style: 'single' }),
      schema.marks.strike.create(),
    ];
    const editedParagraph = schema.nodes.paragraph.create(attrs, [schema.text('onetwo', marks)]);
    const editedDoc = schema.nodes.doc.create(pmDoc.attrs, [editedParagraph]);

    const roundTripped = fromProseDoc(editedDoc, input);
    const outParagraph = roundTripped.package.document.content[0] as Paragraph;
    const runs = outParagraph.content.filter((content): content is Run => content.type === 'run');

    expect(runTexts(outParagraph)).toEqual(['onetwo']);
    expect(runs[0].formatting?.strike).toBe(true);
  });

  test('commented same-formatting runs preserve boundaries inside the comment range', () => {
    const paragraph: Paragraph = {
      type: 'paragraph',
      content: [
        { type: 'commentRangeStart', id: 42 },
        textRun('one'),
        textRun('two'),
        { type: 'commentRangeEnd', id: 42 },
      ],
    };
    const input = docOf(paragraph);

    const pmDoc = toProseDoc(input);
    const pmParagraph = pmDoc.firstChild!;
    expect(pmParagraph.childCount).toBe(1);
    expect(pmParagraph.firstChild!.marks.some((mark) => mark.type.name === 'comment')).toBe(true);

    const roundTripped = fromProseDoc(pmDoc, input);
    const outParagraph = roundTripped.package.document.content[0] as Paragraph;

    expect(outParagraph.content.map((content) => content.type)).toEqual([
      'commentRangeStart',
      'run',
      'run',
      'commentRangeEnd',
    ]);
    expect(runTexts(outParagraph)).toEqual(['one', 'two']);
  });
});
