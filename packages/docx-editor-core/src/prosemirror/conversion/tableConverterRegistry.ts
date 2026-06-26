/**
 * Lazy registry for the Document→PM table converter.
 *
 * `convertTable` lives in the conversion layer, which imports the schema
 * singleton — and the schema is built from the extensions (StarterKit). So an
 * extension command importing `convertTable` directly would close a module
 * cycle (schema → extensions → command → conversion → schema). That cycle is
 * harmless under lazy ESM in dev but breaks initialization order in the
 * production bundle.
 *
 * To keep the table-insert command able to reuse the canonical converter
 * without that static edge, the conversion layer registers `convertTable`
 * here when it loads (the host always loads it — `toProseDoc` runs on every
 * editor mount), and the command resolves it lazily at call time. This module
 * has only type imports, so it is a dependency-free leaf both layers can share.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { Table, Theme } from '../../types/document';
import type { StyleResolver } from '../styles/styleResolver';

/** Signature of `convertTable` (Document table → PM table node). */
export type TableConverter = (
  table: Table,
  styleResolver: StyleResolver | null,
  theme?: Theme | null
) => PMNode;

let converter: TableConverter | null = null;

/** Called by the conversion layer at load time to publish `convertTable`. */
export function registerTableConverter(fn: TableConverter): void {
  converter = fn;
}

/** Resolve the registered converter, or null if the conversion layer hasn't loaded. */
export function getTableConverter(): TableConverter | null {
  return converter;
}
