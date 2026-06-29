/**
 * Manager Classes — Framework-Agnostic Business Logic
 *
 * These classes contain the state machines and coordination logic
 * extracted from React components and hooks. They can be consumed
 * by any UI framework via the subscribe/getSnapshot pattern.
 */

// Base class
export { Subscribable } from './Subscribable';

// Types
export type { PluginLifecycleConfig, PluginLifecycleSnapshot } from './types';

export { PluginLifecycleManager, injectStyles } from './PluginLifecycleManager';

export { LayoutCoordinator } from './LayoutCoordinator';
export type {
  SelectionRect,
  CaretPosition,
  ImageSelectionInfo,
  ColumnResizeState,
  LayoutCoordinatorSnapshot,
} from './LayoutCoordinator';

export { EditorCoordinator } from './EditorCoordinator';
export type {
  EditorLoadingState,
  EditorCoordinatorOptions,
  EditorCoordinatorSnapshot,
} from './EditorCoordinator';
