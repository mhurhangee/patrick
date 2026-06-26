/**
 * Table Extension — 4 node specs + plugins + commands
 *
 * Uses separate NodeExtension instances for each table node type, plus an
 * Extension that registers the prosemirror-tables editing plugins, the
 * Backspace/Delete keymap chain, and the full 32-command surface.
 *
 * NodeSpecs (declarative attrs + parseDOM + toDOM) and the CSS-paste
 * helpers shared by td/th live in ./{specs,paste}.ts. The table-context
 * query / cell-navigation helpers live in ./context.ts. The plugin
 * runtime itself lives under ./commands/ — one file per command domain
 * (insert, delete, selection, borders, cellFormatting, sizing,
 * tableStyle), plus shared helpers and the active-cell decoration plugin.
 * @packageDocumentation
 * @public
 */

import { createNodeExtension, createExtension } from '../../create';
import type { AnyExtension } from '../../types';
import { tableSpec, tableRowSpec, tableCellSpec, tableHeaderSpec } from './specs';
import { setupTableRuntime } from './commands';

export type { TableContextInfo } from './context';
export type { BorderPreset, BorderSpec } from './commands';

// ============================================================================
// NODE EXTENSIONS (4 separate ones for schema contribution)
// ============================================================================

export const TableNodeExtension = createNodeExtension({
  name: 'table',
  schemaNodeName: 'table',
  nodeSpec: tableSpec,
});

export const TableRowExtension = createNodeExtension({
  name: 'tableRow',
  schemaNodeName: 'tableRow',
  nodeSpec: tableRowSpec,
});

export const TableCellExtension = createNodeExtension({
  name: 'tableCell',
  schemaNodeName: 'tableCell',
  nodeSpec: tableCellSpec,
});

export const TableHeaderExtension = createNodeExtension({
  name: 'tableHeader',
  schemaNodeName: 'tableHeader',
  nodeSpec: tableHeaderSpec,
});

// ============================================================================
// TABLE PLUGIN/COMMANDS EXTENSION
// ============================================================================

export const TablePluginExtension = createExtension({
  name: 'tablePlugin',
  onSchemaReady: setupTableRuntime,
});

// ============================================================================
// CONVENIENCE: all table extensions grouped
// ============================================================================

export function createTableExtensions(): AnyExtension[] {
  return [
    TableNodeExtension(),
    TableRowExtension(),
    TableCellExtension(),
    TableHeaderExtension(),
    TablePluginExtension(),
  ];
}

export { getTableContext, isInTableCell as isInTable, goToNextCell, goToPrevCell } from './context';
