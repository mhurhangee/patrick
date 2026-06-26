/**
 * Cell-border commands. Each command applies a preset / individual side /
 * color / width to the cells targeted by the current selection (single
 * cursor cell or active `CellSelection`).
 *
 * All four commands use the shared `buildTableGrid` lookup to find each
 * cell's neighbours in the grid, then sync the matching edge on the
 * adjacent cell — Google-Docs style edge-symmetric border editing.
 *
 * Schema-free: only attribute updates via `tr.setNodeMarkup`.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import { getTableContext } from '../context';
import { buildTableGrid, getTargetCellPositions } from './helpers';

export type BorderPreset = 'all' | 'outside' | 'inside' | 'none';
export type BorderSpec = { style: string; size: number; color: { rgb: string } };

// For a given border side, where is the adjacent cell whose facing edge
// must stay in sync? Used by setCellBorder / setTableBorderColor /
// setTableBorderWidth to keep edge-symmetric (Google-Docs style) borders.
const ADJACENT_EDGE: Record<
  'top' | 'bottom' | 'left' | 'right',
  { adjSide: 'top' | 'bottom' | 'left' | 'right'; dRow: number; dCol: number }
> = {
  top: { adjSide: 'bottom', dRow: -1, dCol: 0 },
  bottom: { adjSide: 'top', dRow: 1, dCol: 0 },
  left: { adjSide: 'right', dRow: 0, dCol: -1 },
  right: { adjSide: 'left', dRow: 0, dCol: 1 },
};

export function setTableBorders(preset: BorderPreset, borderSpec?: BorderSpec): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      const tr = state.tr;
      const table = context.table;
      const tableStart = context.tablePos;

      // Use provided spec or default to thin black border
      const solidBorder = borderSpec ?? { style: 'single', size: 4, color: { rgb: '000000' } };
      const noBorder = { style: 'none' as const };

      const { cellByPos, cellByRC } = buildTableGrid(table, tableStart);

      // Get target cells — selection or cursor cell
      const targetCells = getTargetCellPositions(state);

      // Determine grid bounds of the target cells for outside/inside presets
      let minRow = Infinity,
        maxRow = -1,
        minCol = Infinity,
        maxCol = -1;
      for (const { pos } of targetCells) {
        const info = cellByPos.get(pos);
        if (info) {
          minRow = Math.min(minRow, info.rowIdx);
          maxRow = Math.max(maxRow, info.rowIdx);
          minCol = Math.min(minCol, info.colIdx);
          maxCol = Math.max(maxCol, info.colIdx + info.colspan - 1);
        }
      }

      // Track which cells we've already modified (avoid double-modify)
      const modified = new Map<number, Record<string, unknown>>();
      const getAttrs = (pos: number, node: PMNode) => {
        return modified.get(pos) ?? { ...node.attrs };
      };
      const setAttrs = (pos: number, attrs: Record<string, unknown>) => {
        modified.set(pos, attrs);
      };

      // Apply borders to each target cell + update adjacent cells on shared edges
      for (const { pos } of targetCells) {
        const info = cellByPos.get(pos);
        if (!info) continue;

        const isTopEdge = info.rowIdx === minRow;
        const isBottomEdge = info.rowIdx === maxRow;
        const isLeftEdge = info.colIdx === minCol;
        const isRightEdge = info.colIdx + info.colspan - 1 === maxCol;

        // Determine which borders to set on this cell
        let cellBorders: Record<string, typeof solidBorder | typeof noBorder>;
        switch (preset) {
          case 'all':
            cellBorders = {
              top: solidBorder,
              bottom: solidBorder,
              left: solidBorder,
              right: solidBorder,
            };
            break;
          case 'outside':
            cellBorders = {
              top: isTopEdge ? solidBorder : noBorder,
              bottom: isBottomEdge ? solidBorder : noBorder,
              left: isLeftEdge ? solidBorder : noBorder,
              right: isRightEdge ? solidBorder : noBorder,
            };
            break;
          case 'inside':
            cellBorders = {
              top: isTopEdge ? noBorder : solidBorder,
              bottom: isBottomEdge ? noBorder : solidBorder,
              left: isLeftEdge ? noBorder : solidBorder,
              right: isRightEdge ? noBorder : solidBorder,
            };
            break;
          case 'none':
            cellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
            break;
        }

        // Update target cell
        const attrs = getAttrs(pos, info.node);
        const existingBorders = (attrs.borders as Record<string, unknown>) || {};
        setAttrs(pos, { ...attrs, borders: { ...existingBorders, ...cellBorders } });

        // Update adjacent cells' matching edges (Google-Docs style edge sync)
        for (const side of ['top', 'bottom', 'left', 'right'] as const) {
          const value = cellBorders[side];
          if (!value) continue;
          const adj = ADJACENT_EDGE[side];
          const adjColIdx = side === 'right' ? info.colIdx + info.colspan : info.colIdx + adj.dCol;
          const adjPos = cellByRC.get(`${info.rowIdx + adj.dRow},${adjColIdx}`);
          if (adjPos === undefined) continue;
          const adjInfo = cellByPos.get(adjPos)!;
          const adjAttrs = getAttrs(adjPos, adjInfo.node);
          const adjBorders = (adjAttrs.borders as Record<string, unknown>) || {};
          setAttrs(adjPos, {
            ...adjAttrs,
            borders: { ...adjBorders, [adj.adjSide]: value },
          });
        }
      }

      // Apply all accumulated changes to the transaction
      for (const [pos, attrs] of modified) {
        tr.setNodeMarkup(tr.mapping.map(pos), undefined, attrs);
      }
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function setCellBorder(
  side: 'top' | 'bottom' | 'left' | 'right' | 'all',
  spec: { style: string; size?: number; color?: { rgb: string } } | null,
  clearOthers?: boolean
): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      const tr = state.tr;
      const cells = getTargetCellPositions(state);
      const borderValue = spec || { style: 'none' };
      const noBorder = { style: 'none' as const };
      const allSides = ['top', 'bottom', 'left', 'right'] as const;
      const { cellByPos, cellByRC } = buildTableGrid(context.table, context.tablePos);

      const modified = new Map<number, Record<string, unknown>>();
      const getAttrs = (p: number, n: PMNode) => modified.get(p) ?? { ...n.attrs };
      const setAttrs = (p: number, a: Record<string, unknown>) => modified.set(p, a);

      for (const { pos, node } of cells) {
        const info = cellByPos.get(pos);
        const attrs = getAttrs(pos, node);
        const currentBorders = (attrs.borders as Record<string, unknown>) || {};

        const sides = side === 'all' ? allSides : [side];
        // When clearOthers is true, start with all sides cleared (preset behavior)
        const newBorders: Record<string, unknown> = clearOthers
          ? { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }
          : { ...currentBorders };
        for (const s of sides) {
          newBorders[s] = borderValue;
        }

        // Sync adjacent cells — for all sides that changed
        if (info) {
          const sidesToSync = clearOthers ? allSides : sides;
          for (const s of sidesToSync) {
            const syncValue = (newBorders as Record<string, unknown>)[s];
            const adj = ADJACENT_EDGE[s];
            const adjColIdx = s === 'right' ? info.colIdx + info.colspan : info.colIdx + adj.dCol;
            const adjPos = cellByRC.get(`${info.rowIdx + adj.dRow},${adjColIdx}`);
            if (adjPos !== undefined) {
              const adjInfo = cellByPos.get(adjPos)!;
              const adjAttrs = getAttrs(adjPos, adjInfo.node);
              const adjBorders = (adjAttrs.borders as Record<string, unknown>) || {};
              setAttrs(adjPos, {
                ...adjAttrs,
                borders: { ...adjBorders, [adj.adjSide]: syncValue },
              });
            }
          }
        }
        setAttrs(pos, { ...attrs, borders: newBorders });
      }

      for (const [p, a] of modified) {
        tr.setNodeMarkup(tr.mapping.map(p), undefined, a);
      }
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function setTableBorderColor(color: string): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      const tr = state.tr;
      const cells = getTargetCellPositions(state);
      const rgb = color.replace(/^#/, '');
      const defaultBorder = { style: 'single', size: 4 };
      const { cellByPos, cellByRC } = buildTableGrid(context.table, context.tablePos);

      const modified = new Map<number, Record<string, unknown>>();
      const getAttrs = (p: number, n: PMNode) => modified.get(p) ?? { ...n.attrs };
      const setAttrs = (p: number, a: Record<string, unknown>) => modified.set(p, a);

      for (const { pos, node } of cells) {
        const info = cellByPos.get(pos);
        const attrs = getAttrs(pos, node);
        const currentBorders = (attrs.borders as Record<string, Record<string, unknown>>) || {};
        const newBorders: Record<string, unknown> = {};

        for (const side of ['top', 'bottom', 'left', 'right'] as const) {
          const borderVal = { ...defaultBorder, ...currentBorders[side], color: { rgb } };
          newBorders[side] = borderVal;

          // Sync adjacent cell's matching edge
          if (info) {
            const adj = ADJACENT_EDGE[side];
            const adjColIdx =
              side === 'right' ? info.colIdx + info.colspan : info.colIdx + adj.dCol;
            const adjPos = cellByRC.get(`${info.rowIdx + adj.dRow},${adjColIdx}`);
            if (adjPos !== undefined) {
              const adjInfo = cellByPos.get(adjPos)!;
              const adjAttrs = getAttrs(adjPos, adjInfo.node);
              const adjBorders = (adjAttrs.borders as Record<string, unknown>) || {};
              setAttrs(adjPos, {
                ...adjAttrs,
                borders: { ...adjBorders, [adj.adjSide]: borderVal },
              });
            }
          }
        }
        setAttrs(pos, { ...attrs, borders: { ...currentBorders, ...newBorders } });
      }

      for (const [p, a] of modified) {
        tr.setNodeMarkup(tr.mapping.map(p), undefined, a);
      }
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function setTableBorderWidth(size: number): Command {
  return (state, dispatch) => {
    const context = getTableContext(state);
    if (!context.isInTable || context.tablePos === undefined || !context.table) return false;

    if (dispatch) {
      const tr = state.tr;
      const cells = getTargetCellPositions(state);
      const defaultBorder = { style: 'single', color: { rgb: '000000' } };
      const { cellByPos, cellByRC } = buildTableGrid(context.table, context.tablePos);

      const modified = new Map<number, Record<string, unknown>>();
      const getAttrs = (p: number, n: PMNode) => modified.get(p) ?? { ...n.attrs };
      const setAttrs = (p: number, a: Record<string, unknown>) => modified.set(p, a);

      for (const { pos, node } of cells) {
        const info = cellByPos.get(pos);
        const attrs = getAttrs(pos, node);
        const currentBorders = (attrs.borders as Record<string, Record<string, unknown>>) || {};
        const newBorders: Record<string, unknown> = {};

        for (const side of ['top', 'bottom', 'left', 'right'] as const) {
          const borderVal = { ...defaultBorder, ...currentBorders[side], size };
          newBorders[side] = borderVal;

          // Sync adjacent cell's matching edge
          if (info) {
            const adj = ADJACENT_EDGE[side];
            const adjColIdx =
              side === 'right' ? info.colIdx + info.colspan : info.colIdx + adj.dCol;
            const adjPos = cellByRC.get(`${info.rowIdx + adj.dRow},${adjColIdx}`);
            if (adjPos !== undefined) {
              const adjInfo = cellByPos.get(adjPos)!;
              const adjAttrs = getAttrs(adjPos, adjInfo.node);
              const adjBorders = (adjAttrs.borders as Record<string, unknown>) || {};
              setAttrs(adjPos, {
                ...adjAttrs,
                borders: { ...adjBorders, [adj.adjSide]: borderVal },
              });
            }
          }
        }
        setAttrs(pos, { ...attrs, borders: { ...currentBorders, ...newBorders } });
      }

      for (const [p, a] of modified) {
        tr.setNodeMarkup(tr.mapping.map(p), undefined, a);
      }
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}
