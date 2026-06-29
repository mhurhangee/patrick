/**
 * Manager Types
 *
 * Framework-agnostic interfaces for the editor's manager classes.
 * @packageDocumentation
 * @public
 */

import type { EditorView } from 'prosemirror-view';

// ============================================================================
// PLUGIN LIFECYCLE
// ============================================================================

/** Plugin lifecycle configuration */
export interface PluginLifecycleConfig {
  id: string;
  styles?: string;
  initialize?: (editorView: EditorView) => unknown;
  onStateChange?: (editorView: EditorView) => unknown;
  destroy?: () => void;
}

/** PluginLifecycleManager snapshot */
export interface PluginLifecycleSnapshot {
  /** Map of plugin ID to plugin state */
  states: Map<string, unknown>;
  /** Version counter (incremented on any state change) */
  version: number;
}
