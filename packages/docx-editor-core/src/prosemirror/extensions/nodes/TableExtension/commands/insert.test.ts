/**
 * insertTable adopts the document's default table style.
 *
 * When the document declares a default table style (settings
 * `w:defaultTableStyle`, else the type-default table style), a toolbar-inserted
 * table is built through `convertTable` so it carries that styleId and renders
 * with the style's baked borders / shading / conditional formatting. With no
 * usable default style, insert keeps the legacy thin black-border grid.
 */

import { describe, test, expect } from 'bun:test';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { singletonManager } from '../../../../schema';
import { createStyleResolver, type StyleResolver } from '../../../../styles';
import {
  createDocumentStylesPlugin,
  createDocumentContextPlugin,
} from '../../../../plugins/documentStyles';
import type { StyleDefinitions } from '../../../../../types/document';
import { convertPMTable } from '../../../../conversion/fromProseDoc/tables';
// Loading the conversion layer registers `convertTable` with the lazy
// converter registry that `insertTable` resolves at runtime — the app does
// this via `toProseDoc` on every editor mount.
import '../../../../conversion/toProseDoc/tables';
import { makeInsertTable } from './insert';

const schema = singletonManager.getSchema();

const RED = { rgb: 'FF0000' } as const;
const BLUE = { rgb: '4472C4' } as const;

/** A branded table style: red grid, blue first-row shading, 40-twip margins. */
const BRANDED_STYLES: StyleDefinitions = {
  styles: [
    {
      styleId: 'Branded',
      type: 'table',
      name: 'Branded',
      tblPr: {
        borders: {
          top: { style: 'single', size: 8, color: RED },
          bottom: { style: 'single', size: 8, color: RED },
          left: { style: 'single', size: 8, color: RED },
          right: { style: 'single', size: 8, color: RED },
          insideH: { style: 'single', size: 8, color: RED },
          insideV: { style: 'single', size: 8, color: RED },
        },
        cellMargins: {
          top: { value: 40, type: 'dxa' },
          bottom: { value: 40, type: 'dxa' },
          left: { value: 120, type: 'dxa' },
          right: { value: 120, type: 'dxa' },
        },
      },
      tblStylePr: [{ type: 'firstRow', tcPr: { shading: { fill: BLUE } } }],
    },
  ],
};

function stateWith(
  resolver: StyleResolver | null,
  defaultTableStyleId: string | null
): EditorState {
  const doc = schema.node('doc', null, [schema.node('paragraph')]);
  const plugins = [
    ...singletonManager.getPlugins(),
    createDocumentStylesPlugin(resolver),
    createDocumentContextPlugin({ theme: null, defaultTableStyleId }),
  ];
  const state = EditorState.create({ doc, schema, plugins });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
}

function insert(state: EditorState, rows: number, cols: number): PMNode {
  let captured: Transaction | null = null;
  makeInsertTable(schema)(rows, cols)(state, (tr) => {
    captured = tr;
  });
  if (!captured) throw new Error('insertTable did not dispatch');
  const next = state.apply(captured);
  let table: PMNode | null = null;
  next.doc.descendants((node) => {
    if (node.type.name === 'table') {
      table = node;
      return false;
    }
    return true;
  });
  if (!table) throw new Error('no table inserted');
  return table;
}

/** Walk to the cell at (row, col), ignoring nested tables. */
function cellAt(table: PMNode, row: number, col: number): PMNode {
  const rowNode = table.child(row);
  return rowNode.child(col);
}

describe('insertTable — default table style adoption', () => {
  test('adopts settings w:defaultTableStyle: styleId + baked style formatting', () => {
    const resolver = createStyleResolver(BRANDED_STYLES);
    const table = insert(stateWith(resolver, 'Branded'), 2, 2);

    expect(table.attrs.styleId).toBe('Branded');
    expect(table.attrs.look).toMatchObject({ firstRow: true, noVBand: true });

    // A body (second-row) cell inherits the style's red grid borders.
    const bodyCell = cellAt(table, 1, 0);
    expect(bodyCell.attrs.borders?.top?.color?.rgb?.toLowerCase()).toContain('ff0000');

    // The default look enables firstRow styling → row 0 gets the blue shading.
    const headerCell = cellAt(table, 0, 0);
    expect(String(headerCell.attrs.backgroundColor).toLowerCase()).toContain('4472c4');

    // The style's cell margins are baked onto the table.
    expect(table.attrs.cellMargins).toMatchObject({ top: 40, left: 120 });
  });

  test('adopts the type-default table style when settings has none', () => {
    const styles: StyleDefinitions = {
      styles: BRANDED_STYLES.styles!.map((s) => ({ ...s, default: true })),
    };
    const resolver = createStyleResolver(styles);
    const table = insert(stateWith(resolver, null), 2, 2);
    expect(table.attrs.styleId).toBe('Branded');
  });

  test('falls back to a plain black-border grid when no default style exists', () => {
    const resolver = createStyleResolver({ styles: [] });
    const table = insert(stateWith(resolver, null), 2, 2);

    expect(table.attrs.styleId).toBeFalsy();
    const cell = cellAt(table, 0, 0);
    expect(cell.attrs.borders?.top?.color?.rgb?.toLowerCase()).toContain('000000');
  });

  test('produces a valid grid (correct row/column counts)', () => {
    const resolver = createStyleResolver(BRANDED_STYLES);
    const table = insert(stateWith(resolver, 'Branded'), 3, 4);
    expect(table.childCount).toBe(3);
    expect(table.child(0).childCount).toBe(4);
  });

  test('styleId survives the round-trip back to the document model', () => {
    const resolver = createStyleResolver(BRANDED_STYLES);
    const table = insert(stateWith(resolver, 'Branded'), 2, 2);
    // PM node → Document model (the path `save()` takes before serializing
    // `<w:tblStyle>`).
    const model = convertPMTable(table);
    expect(model.formatting?.styleId).toBe('Branded');
  });
});
