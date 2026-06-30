/**
 * History hook for undo/redo functionality
 *
 * Maintains undo/redo stacks with support for:
 * - undo() and redo() operations
 * - canUndo and canRedo state
 * - Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
 * - Grouping rapid changes to avoid cluttering history
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

/**
 * History entry containing state and metadata
 */
export interface HistoryEntry<T> {
  /** The state at this point */
  state: T;
  /** Timestamp when this entry was created */
  timestamp: number;
  /** Optional description of what changed */
  description?: string;
}

/**
 * Options for the useHistory hook
 */
export interface UseHistoryOptions<T> {
  /** Maximum number of entries in history (default: 100) */
  maxEntries?: number;
  /** Time in ms to group rapid changes (default: 500) */
  groupingInterval?: number;
  /** Whether to enable keyboard shortcuts (default: true) */
  enableKeyboardShortcuts?: boolean;
  /** Custom comparison function for detecting changes */
  isEqual?: (a: T, b: T) => boolean;
  /** Callback when undo is triggered */
  onUndo?: (state: T) => void;
  /** Callback when redo is triggered */
  onRedo?: (state: T) => void;
  /** Ref to the container element for keyboard events */
  containerRef?: React.RefObject<HTMLElement>;
}

/**
 * Return type of the useHistory hook
 */
export interface UseHistoryReturn<T> {
  /** Current state */
  state: T;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of entries in undo stack */
  undoCount: number;
  /** Number of entries in redo stack */
  redoCount: number;
  /** Push a new state to history */
  push: (newState: T, description?: string) => void;
  /** Undo to previous state */
  undo: () => T | undefined;
  /** Redo to next state */
  redo: () => T | undefined;
  /** Clear all history */
  clear: () => void;
  /** Reset to initial state and clear history */
  reset: (newInitialState?: T) => void;
  /** Get all undo entries (for debugging/display) */
  getUndoStack: () => HistoryEntry<T>[];
  /** Get all redo entries (for debugging/display) */
  getRedoStack: () => HistoryEntry<T>[];
  /** Transform all stored states (current + undo/redo stacks) */
  transformAll: (fn: (state: T) => T) => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Default equality check using JSON stringify
 */
function defaultIsEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Custom hook for managing undo/redo history
 */
export function useHistory<T>(
  initialState: T,
  options: UseHistoryOptions<T> = {}
): UseHistoryReturn<T> {
  const {
    maxEntries = 100,
    groupingInterval = 500,
    enableKeyboardShortcuts = true,
    isEqual = defaultIsEqual,
    onUndo,
    onRedo,
    containerRef,
  } = options;

  // Current state
  const [state, setState] = useState<T>(initialState);

  // History stacks
  const [undoStack, setUndoStack] = useState<HistoryEntry<T>[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry<T>[]>([]);

  // Track last push time for grouping
  const lastPushTimeRef = useRef<number>(0);

  // Track if we're currently in an undo/redo operation
  const isUndoRedoRef = useRef<boolean>(false);

  /**
   * Push a new state to history
   */
  const push = useCallback(
    (newState: T, description?: string) => {
      // Skip if state hasn't changed
      if (isEqual(state, newState)) {
        return;
      }

      // If this is an undo/redo operation, don't push
      if (isUndoRedoRef.current) {
        setState(newState);
        return;
      }

      const now = Date.now();
      const timeSinceLastPush = now - lastPushTimeRef.current;

      // Check if we should group with previous entry
      if (timeSinceLastPush < groupingInterval && undoStack.length > 0) {
        // Update the most recent entry instead of creating new one
        setUndoStack((prev) => {
          const newStack = [...prev];
          newStack[newStack.length - 1] = {
            state: state, // Keep the state before the grouped changes
            timestamp: now,
            description: description || newStack[newStack.length - 1].description,
          };
          return newStack;
        });
      } else {
        // Push current state to undo stack
        setUndoStack((prev) => {
          const newEntry: HistoryEntry<T> = {
            state,
            timestamp: now,
            description,
          };

          // Limit stack size
          const newStack = [...prev, newEntry];
          if (newStack.length > maxEntries) {
            return newStack.slice(newStack.length - maxEntries);
          }
          return newStack;
        });
      }

      // Clear redo stack on new change
      setRedoStack([]);

      // Update current state
      setState(newState);

      // Update last push time
      lastPushTimeRef.current = now;
    },
    [state, isEqual, groupingInterval, maxEntries, undoStack.length]
  );

  /**
   * Undo to previous state
   */
  const undo = useCallback((): T | undefined => {
    if (undoStack.length === 0) {
      return undefined;
    }

    isUndoRedoRef.current = true;

    // Pop from undo stack
    const prevEntry = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    // Push current state to redo stack
    setRedoStack((prev) => [
      ...prev,
      {
        state,
        timestamp: Date.now(),
      },
    ]);

    // Restore previous state
    setState(prevEntry.state);

    // Reset flag after state update
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);

    // Call callback
    onUndo?.(prevEntry.state);

    return prevEntry.state;
  }, [undoStack, state, onUndo]);

  /**
   * Redo to next state
   */
  const redo = useCallback((): T | undefined => {
    if (redoStack.length === 0) {
      return undefined;
    }

    isUndoRedoRef.current = true;

    // Pop from redo stack
    const nextEntry = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));

    // Push current state to undo stack
    setUndoStack((prev) => [
      ...prev,
      {
        state,
        timestamp: Date.now(),
      },
    ]);

    // Restore next state
    setState(nextEntry.state);

    // Reset flag after state update
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);

    // Call callback
    onRedo?.(nextEntry.state);

    return nextEntry.state;
  }, [redoStack, state, onRedo]);

  /**
   * Clear all history
   */
  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  /**
   * Reset to initial state and clear history
   */
  const reset = useCallback(
    (newInitialState?: T) => {
      setState(newInitialState ?? initialState);
      setUndoStack([]);
      setRedoStack([]);
      lastPushTimeRef.current = 0;
    },
    [initialState]
  );

  /**
   * Get undo stack (for debugging)
   */
  const getUndoStack = useCallback((): HistoryEntry<T>[] => {
    return [...undoStack];
  }, [undoStack]);

  /**
   * Get redo stack (for debugging)
   */
  const getRedoStack = useCallback((): HistoryEntry<T>[] => {
    return [...redoStack];
  }, [redoStack]);

  /**
   * Transform all stored states (current + undo/redo stacks).
   * Useful for bulk cleanup such as stripping cached snapshots.
   */
  const transformAll = useCallback((fn: (s: T) => T) => {
    setState((prev) => fn(prev));
    setUndoStack((prev) => prev.map((entry) => ({ ...entry, state: fn(entry.state) })));
    setRedoStack((prev) => prev.map((entry) => ({ ...entry, state: fn(entry.state) })));
  }, []);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      // Ctrl+Y or Cmd+Shift+Z for redo
      if (
        ((event.ctrlKey || event.metaKey) && event.key === 'y') ||
        ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey)
      ) {
        event.preventDefault();
        redo();
        return;
      }
    };

    // Add listener to container or document
    const target = containerRef?.current || document;
    target.addEventListener('keydown', handleKeyDown as EventListener);

    return () => {
      target.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [enableKeyboardShortcuts, undo, redo, containerRef]);

  return {
    state,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoCount: undoStack.length,
    redoCount: redoStack.length,
    push,
    undo,
    redo,
    clear,
    reset,
    getUndoStack,
    getRedoStack,
    transformAll,
  };
}

// ============================================================================
// CONVENIENCE HOOKS
// ============================================================================

/**
 * Hook for document history with specialized comparison
 */
export function useDocumentHistory<
  T extends {
    package?: { document?: unknown; headers?: unknown; footers?: unknown } | null;
  } | null,
>(document: T, options: Omit<UseHistoryOptions<T>, 'isEqual'> = {}): UseHistoryReturn<T> {
  // Compare document content, headers, and footers for detecting changes
  const isEqual = useCallback((a: T, b: T): boolean => {
    if (a?.package?.document !== b?.package?.document) {
      if (JSON.stringify(a?.package?.document) !== JSON.stringify(b?.package?.document)) {
        return false;
      }
    }
    // Also compare headers/footers (stored as Maps, use reference equality first)
    if (a?.package?.headers !== b?.package?.headers) return false;
    if (a?.package?.footers !== b?.package?.footers) return false;
    return true;
  }, []);

  return useHistory(document, { ...options, isEqual });
}

export default useHistory;
