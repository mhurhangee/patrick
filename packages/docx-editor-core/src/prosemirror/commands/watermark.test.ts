import { describe, test, expect } from 'bun:test';
import { EditorState, type Transaction } from 'prosemirror-state';
import { history, undo, redo } from 'prosemirror-history';
import { schema } from '../schema';
import { setWatermark, getWatermarkFromState } from './watermark';
import { toProseDoc } from '../conversion/toProseDoc';
import { fromProseDoc } from '../conversion/fromProseDoc';
import { getDocumentWatermark } from '../../docx/watermarkApi';
import type { Document, HeaderFooter, TextWatermark } from '../../types/document';

const WM: TextWatermark = {
  kind: 'text',
  text: 'CONFIDENTIAL',
  font: 'Calibri',
  color: '#C0C0C0',
  semitransparent: true,
  layout: 'diagonal',
};

function makeState() {
  const doc = schema.node('doc', { defaultTabStopTwips: null, watermark: null }, [
    schema.node('paragraph', {}, []),
  ]);
  let state = EditorState.create({ doc, plugins: [history()] });
  const dispatch = (tr: Transaction) => {
    state = state.apply(tr);
  };
  return {
    dispatch,
    get state() {
      return state;
    },
  };
}

describe('watermark command (undoable doc attr)', () => {
  test('setWatermark sets the watermark on PM state', () => {
    const ed = makeState();
    setWatermark(WM)(ed.state, ed.dispatch);
    expect(getWatermarkFromState(ed.state)).toEqual(WM);
  });

  test('undo reverts and redo re-applies the watermark', () => {
    const ed = makeState();
    setWatermark(WM)(ed.state, ed.dispatch);
    expect(getWatermarkFromState(ed.state)).toEqual(WM);

    undo(ed.state, ed.dispatch);
    expect(getWatermarkFromState(ed.state)).toBeNull();

    redo(ed.state, ed.dispatch);
    expect(getWatermarkFromState(ed.state)).toEqual(WM);
  });

  test('setWatermark(null) clears it and is undoable', () => {
    const ed = makeState();
    setWatermark(WM)(ed.state, ed.dispatch);
    setWatermark(null)(ed.state, ed.dispatch);
    expect(getWatermarkFromState(ed.state)).toBeNull();
    undo(ed.state, ed.dispatch);
    expect(getWatermarkFromState(ed.state)).toEqual(WM);
  });
});

describe('watermark conversion round-trip', () => {
  test('toProseDoc seeds the doc attr from the header watermark', () => {
    const headers = new Map<string, HeaderFooter>([
      ['rId1', { type: 'header', hdrFtrType: 'default', content: [], watermark: WM }],
    ]);
    const doc = {
      package: { document: { content: [] }, headers, relationships: new Map() },
    } as unknown as Document;
    const pm = toProseDoc(doc, {});
    expect(pm.attrs.watermark).toEqual(WM);
  });

  test('fromProseDoc syncs the doc attr back onto the headers', () => {
    const base = {
      package: {
        document: { content: [] },
        headers: new Map<string, HeaderFooter>([
          ['rId1', { type: 'header', hdrFtrType: 'default', content: [] }],
        ]),
        relationships: new Map(),
      },
    } as unknown as Document;
    const pmDoc = schema.node('doc', { defaultTabStopTwips: null, watermark: WM }, [
      schema.node('paragraph', {}, []),
    ]);
    const result = fromProseDoc(pmDoc, base);
    expect(getDocumentWatermark(result)).toEqual(WM);
  });

  test('fromProseDoc clears the header watermark when the attr is null', () => {
    const base = {
      package: {
        document: { content: [] },
        headers: new Map<string, HeaderFooter>([
          ['rId1', { type: 'header', hdrFtrType: 'default', content: [], watermark: WM }],
        ]),
        relationships: new Map(),
      },
    } as unknown as Document;
    const pmDoc = schema.node('doc', { defaultTabStopTwips: null, watermark: null }, [
      schema.node('paragraph', {}, []),
    ]);
    const result = fromProseDoc(pmDoc, base);
    expect(getDocumentWatermark(result)).toBeUndefined();
  });
});
