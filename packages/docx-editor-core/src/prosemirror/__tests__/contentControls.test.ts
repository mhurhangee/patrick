/**
 * PM-level content-control addressing (live-editor path): discover by tag,
 * fill content, and remove, against an EditorState built from the singleton
 * schema.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';

import { singletonManager } from '../schema';
import {
  findContentControlsInPM,
  findContentControlPos,
  setContentControlContentTr,
  removeContentControlTr,
  setContentControlValueTr,
  setContentControlValueAtPosTr,
} from '../contentControls';
import {
  ContentControlNotFoundError,
  ContentControlLockedError,
  ContentControlTypeError,
} from '../../agent/contentControls';

const schema = singletonManager.getSchema();

function blockSdt(attrs: Record<string, unknown>, text: string) {
  return schema.nodes.blockSdt.create(
    attrs,
    schema.nodes.paragraph.create(null, schema.text(text))
  );
}

function inlineSdt(attrs: Record<string, unknown>, text: string) {
  return schema.nodes.sdt.create(attrs, schema.text(text));
}

function makeState() {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text('before')),
    blockSdt({ sdtType: 'richText', tag: 'intro', alias: 'Intro' }, 'CONTROL #1'),
    blockSdt({ sdtType: 'richText', tag: 'locked', lock: 'sdtContentLocked' }, 'do not edit'),
    schema.nodes.paragraph.create(null, schema.text('after')),
  ]);
  return EditorState.create({ schema, doc });
}

describe('PM content-control addressing', () => {
  test('finds controls by tag and reads text', () => {
    const state = makeState();
    const all = findContentControlsInPM(state.doc);
    expect(all.map((c) => c.tag)).toEqual(['intro', 'locked']);
    expect(findContentControlsInPM(state.doc, { tag: 'intro' })[0].text).toBe('CONTROL #1');
  });

  test('finds inline content controls and preserves raw checkbox attrs', () => {
    const rawPropertiesXml =
      '<w:sdtPr><w:id w:val="77"/><w:tag w:val="option-alpha"/><w14:checkbox>' +
      '<w14:checked w14:val="0"/><w14:checkedState w14:val="2612"/>' +
      '<w14:uncheckedState w14:val="2610"/></w14:checkbox></w:sdtPr>';
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('before '),
        inlineSdt(
          {
            sdtType: 'checkbox',
            id: 77,
            tag: 'option-alpha',
            alias: 'Option alpha',
            checked: false,
            dataBinding: JSON.stringify({ xpath: '/x', storeItemId: 'item' }),
            rawPropertiesXml,
          },
          String.fromCodePoint(0x2610)
        ),
        schema.text(' after'),
      ]),
    ]);
    const state = EditorState.create({ schema, doc });
    const control = findContentControlsInPM(state.doc, { tag: 'option-alpha' })[0];

    expect(control.sdtType).toBe('checkbox');
    expect(control.id).toBe(77);
    expect(control.text).toBe(String.fromCodePoint(0x2610));
    expect(control.checked).toBe(false);
    expect(control.dataBinding?.xpath).toBe('/x');
    expect(state.doc.nodeAt(control.pos)?.attrs.rawPropertiesXml).toBe(rawPropertiesXml);
  });

  test('findContentControlPos returns the node position', () => {
    const state = makeState();
    const pos = findContentControlPos(state.doc, { tag: 'intro' });
    expect(pos).not.toBeNull();
    expect(state.doc.nodeAt(pos!)?.type.name).toBe('blockSdt');
  });

  test('setContentControlContentTr replaces content, keeping the control', () => {
    const state = makeState();
    const tr = setContentControlContentTr(state, { tag: 'intro' }, 'Filled');
    const next = state.apply(tr);
    const ctrl = findContentControlsInPM(next.doc, { tag: 'intro' })[0];
    expect(ctrl.text).toBe('Filled');
    expect(ctrl.alias).toBe('Intro');
    expect(findContentControlsInPM(next.doc).length).toBe(2); // none lost
  });

  test('locked control is refused unless forced', () => {
    const state = makeState();
    expect(() => setContentControlContentTr(state, { tag: 'locked' }, 'x')).toThrow(
      ContentControlLockedError
    );
    const tr = setContentControlContentTr(state, { tag: 'locked' }, 'forced', { force: true });
    expect(findContentControlsInPM(state.apply(tr).doc, { tag: 'locked' })[0].text).toBe('forced');
  });

  test('missing tag throws', () => {
    const state = makeState();
    expect(() => setContentControlContentTr(state, { tag: 'nope' }, 'x')).toThrow(
      ContentControlNotFoundError
    );
  });

  test('removeContentControlTr deletes; keepContent unwraps', () => {
    const state = makeState();
    const removed = state.apply(removeContentControlTr(state, { tag: 'intro' }));
    expect(findContentControlsInPM(removed.doc, { tag: 'intro' })).toHaveLength(0);

    const unwrapped = state.apply(
      removeContentControlTr(state, { tag: 'intro' }, { keepContent: true })
    );
    expect(findContentControlsInPM(unwrapped.doc, { tag: 'intro' })).toHaveLength(0);
    expect(unwrapped.doc.textContent).toContain('CONTROL #1'); // content kept
  });

  test('refuses free-text replacement of a typed (dropdown) control unless forced', () => {
    const doc = schema.nodes.doc.create(null, [
      blockSdt({ sdtType: 'dropDownList', tag: 'choice' }, 'Active'),
    ]);
    const state = EditorState.create({ schema, doc });
    expect(() => setContentControlContentTr(state, { tag: 'choice' }, 'x')).toThrow(
      ContentControlTypeError
    );
    const tr = setContentControlContentTr(state, { tag: 'choice' }, 'Archived', { force: true });
    expect(findContentControlsInPM(state.apply(tr).doc, { tag: 'choice' })[0].text).toBe(
      'Archived'
    );
  });

  test('setContentControlValueTr toggles a checkbox: content glyph + checked attr', () => {
    const doc = schema.nodes.doc.create(null, [
      blockSdt(
        {
          sdtType: 'checkbox',
          tag: 'agree',
          checked: false,
          rawPropertiesXml:
            '<w:sdtPr><w14:checkbox><w14:checked w14:val="0"/>' +
            '<w14:checkedState w14:val="2612"/><w14:uncheckedState w14:val="2610"/>' +
            '</w14:checkbox></w:sdtPr>',
        },
        String.fromCodePoint(0x2610)
      ),
    ]);
    const state = EditorState.create({ schema, doc });
    const next = state.apply(
      setContentControlValueTr(
        state,
        { tag: 'agree' },
        {
          kind: 'checkbox',
          checked: true,
        }
      )
    );
    const node = next.doc.firstChild!;
    expect(node.attrs.checked).toBe(true);
    expect(node.textContent).toBe(String.fromCodePoint(0x2612));
    expect(String(node.attrs.rawPropertiesXml)).toContain('w14:val="1"');
  });

  test('setContentControlValueAtPosTr toggles an inline checkbox in place', () => {
    const rawPropertiesXml =
      '<w:sdtPr><w:tag w:val="option-alpha"/><w14:checkbox>' +
      '<w14:checked w14:val="0"/><w14:checkedState w14:val="2612"/>' +
      '<w14:uncheckedState w14:val="2610"/></w14:checkbox></w:sdtPr>';
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('before '),
        inlineSdt(
          {
            sdtType: 'checkbox',
            tag: 'option-alpha',
            checked: false,
            rawPropertiesXml,
          },
          String.fromCodePoint(0x2610)
        ),
        schema.text(' after'),
      ]),
    ]);
    const state = EditorState.create({ schema, doc });
    const control = findContentControlsInPM(state.doc, { tag: 'option-alpha' })[0];
    const next = state.apply(
      setContentControlValueAtPosTr(state, control.pos, {
        kind: 'checkbox',
        checked: true,
      })
    );
    const node = next.doc.nodeAt(control.pos)!;

    expect(node.type.name).toBe('sdt');
    expect(node.attrs.checked).toBe(true);
    expect(node.textContent).toBe(String.fromCodePoint(0x2612));
    expect(String(node.attrs.rawPropertiesXml)).toContain('w14:val="1"');
    expect(next.doc.textContent).toBe(`before ${String.fromCodePoint(0x2612)} after`);
  });

  test('setContentControlValueTr selects a dropdown item by value', () => {
    const doc = schema.nodes.doc.create(null, [
      blockSdt(
        {
          sdtType: 'dropDownList',
          tag: 'status',
          listItems: JSON.stringify([
            { displayText: 'Draft', value: '1' },
            { displayText: 'Final', value: '2' },
          ]),
          rawPropertiesXml: '<w:sdtPr><w:dropDownList w:lastValue="1"/></w:sdtPr>',
        },
        'Draft'
      ),
    ]);
    const state = EditorState.create({ schema, doc });
    const next = state.apply(
      setContentControlValueTr(
        state,
        { tag: 'status' },
        {
          kind: 'dropdown',
          value: '2',
        }
      )
    );
    expect(next.doc.firstChild!.textContent).toBe('Final');
    expect(String(next.doc.firstChild!.attrs.rawPropertiesXml)).toContain('w:lastValue="2"');
  });

  test('clears the showingPlaceholder attr when filling a placeholder control', () => {
    const doc = schema.nodes.doc.create(null, [
      blockSdt(
        {
          sdtType: 'richText',
          tag: 'ph',
          showingPlaceholder: true,
          rawPropertiesXml: '<w:sdtPr><w:showingPlcHdr/></w:sdtPr>',
        },
        'Click to enter'
      ),
    ]);
    const state = EditorState.create({ schema, doc });
    const next = state.apply(setContentControlContentTr(state, { tag: 'ph' }, 'Real'));
    expect(next.doc.firstChild!.attrs.showingPlaceholder).toBe(false);
    expect(String(next.doc.firstChild!.attrs.rawPropertiesXml)).not.toContain('showingPlcHdr');
  });
});

describe('PM inline content controls (write/remove)', () => {
  function inlineState() {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('Dear '),
        inlineSdt({ sdtType: 'richText', tag: 'name', alias: 'Name' }, 'OLD'),
        schema.text('.'),
      ]),
    ]);
    return EditorState.create({ schema, doc });
  }

  test('fills an inline control with inline content (no paragraph), siblings intact', () => {
    const state = inlineState();
    // If this built a paragraph inside the paragraph, replaceWith/apply would throw.
    const next = state.apply(setContentControlContentTr(state, { tag: 'name' }, 'ACME'));
    const ctrl = findContentControlsInPM(next.doc, { tag: 'name' })[0];
    expect(ctrl.text).toBe('ACME');

    const node = next.doc.nodeAt(ctrl.pos)!;
    expect(node.type.name).toBe('sdt');
    node.content.forEach((child) => expect(child.isInline).toBe(true)); // no block children
    expect(next.doc.childCount).toBe(1); // paragraph not split
    expect(next.doc.textContent).toBe('Dear ACME.'); // surrounding text preserved
  });

  test('richText inline fill turns \\n into a hardBreak (not a new paragraph)', () => {
    const state = inlineState();
    const next = state.apply(setContentControlContentTr(state, { tag: 'name' }, 'a\nb'));
    const node = next.doc.nodeAt(findContentControlPos(next.doc, { tag: 'name' })!)!;
    let hasBreak = false;
    node.descendants((n) => {
      if (n.type.name === 'hardBreak') hasBreak = true;
    });
    expect(hasBreak).toBe(true);
    expect(next.doc.childCount).toBe(1);
  });

  test('keepContent unwraps inline content in place; delete removes it', () => {
    const state = inlineState();
    const unwrapped = state.apply(
      removeContentControlTr(state, { tag: 'name' }, { keepContent: true })
    );
    expect(findContentControlsInPM(unwrapped.doc, { tag: 'name' })).toHaveLength(0);
    expect(unwrapped.doc.textContent).toBe('Dear OLD.'); // runs stay inline
    expect(unwrapped.doc.childCount).toBe(1);

    const deleted = state.apply(removeContentControlTr(state, { tag: 'name' }));
    expect(findContentControlsInPM(deleted.doc, { tag: 'name' })).toHaveLength(0);
    expect(deleted.doc.textContent).toBe('Dear .'); // control content gone, siblings intact
  });
});
