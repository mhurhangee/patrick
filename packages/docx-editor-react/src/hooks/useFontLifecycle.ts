import { useEffect, useRef } from 'react';
import {
  onFontError,
  loadFontDefinitions,
  type FontDefinition,
} from '@eigenpal/docx-editor-core/utils';

/**
 * Owns the editor's font lifecycle wires:
 *
 * 1. Re-register custom faces from the `fonts` prop on identity change.
 *    The loader dedupes by `family|weight`, so re-runs are cheap.
 * 2. Forward font-load failures to the consumer's `onError` prop. The
 *    subscription is mounted once and reads `onError` through a ref so an
 *    inline `onError={(e) => …}` does not churn the subscriber Set on every
 *    parent render.
 */
export function useFontLifecycle(
  fonts: ReadonlyArray<FontDefinition> | undefined,
  onError: ((error: Error) => void) | undefined
): void {
  useEffect(() => {
    void loadFontDefinitions(fonts);
  }, [fonts]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    return onFontError((err) => onErrorRef.current?.(err));
  }, []);
}
