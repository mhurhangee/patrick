import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';

import { singletonManager } from '../schema';
import { createCellDragTracker, findCellPosFromPmPos } from '../cellDragSelection';

const schema = singletonManager.getSchema();

function cell(text: string) {
  return schema.nodes.tableCell.create(
    { width: 3000, widthType: 'dxa' },
    schema.nodes.paragraph.create(null, schema.text(text))
  );
}

function row(texts: string[]) {
  return schema.nodes.tableRow.create(
    null,
    texts.map((text) => cell(text))
  );
}

function makeView() {
  const table = schema.nodes.table.create({ columnWidths: [3000, 3000] }, [
    row(['alpha', 'bravo']),
  ]);
  const doc = schema.nodes.doc.create(null, [table]);
  const view = {
    state: EditorState.create({ schema, doc }),
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr);
    },
  };
  return view as unknown as EditorView & { state: EditorState };
}

function textPos(view: EditorView, text: string) {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.isText && node.text === text) {
      found = pos;
      return false;
    }
  });
  if (found === null) throw new Error(`text "${text}" not found`);
  return found;
}

describe('createCellDragTracker', () => {
  test('keeps same-cell drags as text selection even when pointer X changes', () => {
    const view = makeView();
    const alphaPos = textPos(view, 'alpha');
    const anchorCell = findCellPosFromPmPos(view, alphaPos);
    expect(anchorCell).not.toBeNull();

    const tracker = createCellDragTracker();
    tracker.begin(anchorCell);

    expect(tracker.update(view, alphaPos, 10)).toBe(false);
    expect(tracker.update(view, alphaPos, 40)).toBe(false);
    expect(tracker.update(view, alphaPos, 80)).toBe(false);
    expect(tracker.isCellDragging).toBe(false);
    expect(view.state.selection instanceof CellSelection).toBe(false);
  });

  test('promotes to CellSelection after crossing into another cell', () => {
    const view = makeView();
    const alphaPos = textPos(view, 'alpha');
    const bravoPos = textPos(view, 'bravo');
    const anchorCell = findCellPosFromPmPos(view, alphaPos);
    expect(anchorCell).not.toBeNull();

    const tracker = createCellDragTracker();
    tracker.begin(anchorCell);

    expect(tracker.update(view, bravoPos, 80)).toBe(true);
    expect(tracker.isCellDragging).toBe(true);
    expect(view.state.selection instanceof CellSelection).toBe(true);
  });
});
