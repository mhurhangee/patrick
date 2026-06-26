/**
 * documentStyles plugin — makes the document's StyleResolver reachable from
 * ProseMirror commands.
 *
 * Styles otherwise flow one way (Document → PM) at load time: `toProseDoc`
 * bakes resolved formatting into nodes and discards the resolver. Some
 * commands need the live style table though — the Enter handler looks up a
 * paragraph style's `w:next` to switch to body text after a heading. This
 * plugin parks the resolver in plugin state so those commands can read it
 * via `getDocumentStyleResolver(state)`.
 *
 * A sibling `documentContext` plugin (below) carries the extra document-level
 * context the table-insert command needs — the theme and the settings
 * `w:defaultTableStyle` — without changing this resolver plugin's shape.
 *
 * The host (React `HiddenProseMirror` / `HiddenHeaderFooterPMs`, Vue
 * `useDocxEditor`) passes the same styles it hands to `toProseDoc` and adds
 * these plugins when creating the EditorState. When absent, style-aware
 * commands fall back to their style-agnostic behavior.
 */

import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import type { StyleDefinitions, Theme } from '../../types/document';
import { StyleResolver, createStyleResolver } from '../styles/styleResolver';

export const documentStylesKey = new PluginKey<StyleResolver | null>('documentStyles');

/**
 * Create the plugin holding a StyleResolver for the document's `styles` for
 * the lifetime of the EditorState. The resolver is fixed per document load;
 * loading a new document recreates the state (and thus this plugin) with a
 * fresh resolver. Accepts a pre-built resolver too, for callers that already
 * have one.
 */
export function createDocumentStylesPlugin(
  styles: StyleDefinitions | StyleResolver | null | undefined
): Plugin {
  const resolver =
    styles instanceof StyleResolver ? styles : styles ? createStyleResolver(styles) : null;
  return new Plugin<StyleResolver | null>({
    key: documentStylesKey,
    state: {
      init: () => resolver,
      apply: (_tr, value) => value,
    },
  });
}

/** Read the document's StyleResolver, or null when the plugin isn't installed. */
export function getDocumentStyleResolver(state: EditorState): StyleResolver | null {
  return documentStylesKey.getState(state) ?? null;
}

// ============================================================================
// Document context — theme + default-table-style id for style-aware commands.
// ============================================================================

/** Extra document-level context parked alongside the StyleResolver. */
export interface DocumentContext {
  /** The document theme, for resolving themed colors in commands. */
  theme: Theme | null;
  /** `w:defaultTableStyle` (settings.xml) — styleId for newly created tables. */
  defaultTableStyleId: string | null;
}

export const documentContextKey = new PluginKey<DocumentContext>('documentContext');

/**
 * Create the plugin holding {@link DocumentContext} for the lifetime of the
 * EditorState. Separate from the resolver plugin so the resolver's public
 * `documentStylesKey` shape stays stable. The table-insert command reads the
 * theme + default-table styleId from here to bake an inserted table the same
 * way `convertTable` does on import.
 */
export function createDocumentContextPlugin(options?: Partial<DocumentContext>): Plugin {
  const context: DocumentContext = {
    theme: options?.theme ?? null,
    defaultTableStyleId: options?.defaultTableStyleId ?? null,
  };
  return new Plugin<DocumentContext>({
    key: documentContextKey,
    state: {
      init: () => context,
      apply: (_tr, value) => value,
    },
  });
}

/** Read the document theme, or null when the context plugin isn't installed. */
export function getDocumentTheme(state: EditorState): Theme | null {
  return documentContextKey.getState(state)?.theme ?? null;
}

/** Read `w:defaultTableStyle` (styleId for new tables), or null. */
export function getDefaultTableStyleId(state: EditorState): string | null {
  return documentContextKey.getState(state)?.defaultTableStyleId ?? null;
}
