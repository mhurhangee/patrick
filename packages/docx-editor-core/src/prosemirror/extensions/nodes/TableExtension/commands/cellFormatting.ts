/**
 * Per-cell attribute setters: fill color, vertical alignment, padding
 * margins, text direction, and the no-wrap toggle. All operate on the
 * cells targeted by the current selection (cursor cell or active
 * `CellSelection`) via `tr.setNodeMarkup` — no schema access.
 */

import { type Command } from 'prosemirror-state';
import { getTableContext } from '../context';
import { getTargetCellPositions } from './helpers';

export function setCellFillColor(color: string | null): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      const tr = state.tr;
      const cells = getTargetCellPositions(state);
      const bgColor = color ? color.replace(/^#/, '') : null;

      for (const { pos, node } of cells) {
        tr.setNodeMarkup(tr.mapping.map(pos), undefined, {
          ...node.attrs,
          backgroundColor: bgColor,
        });
      }
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function setCellVerticalAlign(align: 'top' | 'center' | 'bottom'): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      const tr = state.tr;
      const cells = getTargetCellPositions(state);
      for (const { pos, node } of cells) {
        tr.setNodeMarkup(tr.mapping.map(pos), undefined, {
          ...node.attrs,
          verticalAlign: align,
        });
      }
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function setCellMargins(margins: {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      const tr = state.tr;
      const cells = getTargetCellPositions(state);
      for (const { pos, node } of cells) {
        const currentMargins = node.attrs.margins || {};
        const newMargins = { ...currentMargins, ...margins };
        tr.setNodeMarkup(tr.mapping.map(pos), undefined, {
          ...node.attrs,
          margins: newMargins,
        });
      }
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function setCellTextDirection(direction: string | null): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      const tr = state.tr;
      const cells = getTargetCellPositions(state);
      for (const { pos, node } of cells) {
        tr.setNodeMarkup(tr.mapping.map(pos), undefined, {
          ...node.attrs,
          textDirection: direction,
        });
      }
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export const toggleNoWrap: Command = (state, dispatch) => {
  const context = getTableContext(state);
  if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

  if (dispatch) {
    const tr = state.tr;
    const cells = getTargetCellPositions(state);
    for (const { pos, node } of cells) {
      tr.setNodeMarkup(tr.mapping.map(pos), undefined, {
        ...node.attrs,
        noWrap: !node.attrs.noWrap,
      });
    }
    dispatch(tr.scrollIntoView());
  }

  return true;
};
