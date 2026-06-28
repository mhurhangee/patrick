import type { MouseEvent } from 'react';

/**
 * Active-state styling for toolbar toggles: a soft emerald tint + emerald glyph,
 * so "is this on?" reads clearly (overrides the primitive's neutral
 * data-[state=on] default). Shared across the toolbar's groups.
 */
export const TOGGLE_ACTIVE = 'data-[state=on]:bg-primary/15 data-[state=on]:text-primary';

/** Preserve the editor selection when clicking a chrome control. */
export const keepFocus = (e: MouseEvent) => e.preventDefault();
