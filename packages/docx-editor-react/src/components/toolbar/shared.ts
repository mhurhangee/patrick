import type { MouseEvent } from 'react';

/**
 * Active-state styling for toolbar toggles: a soft emerald tint + emerald glyph,
 * so "is this on?" reads clearly (overrides the primitive's neutral
 * data-[state=on] default). Shared across the toolbar's groups.
 */
export const TOGGLE_ACTIVE = 'data-[state=on]:bg-primary/15 data-[state=on]:text-primary';

/** Preserve the editor selection when clicking a chrome control. */
export const keepFocus = (e: MouseEvent) => e.preventDefault();

/**
 * The standard colour palette (grayscale + Office standard colours, hex without
 * #) — shared by the text-colour control and the table border/fill controls so
 * every colour picker offers the same swatches.
 */
export const STANDARD_SWATCHES = [
  '000000', '434343', '666666', '999999', 'B7B7B7', 'CCCCCC', 'D9D9D9', 'EFEFEF', 'F3F3F3', 'FFFFFF',
  'C00000', 'FF0000', 'FFC000', 'FFFF00', '92D050', '00B050', '00B0F0', '0070C0', '002060', '7030A0',
] as const;

/**
 * Word's named highlight palette. Every hex MUST be a key in the core
 * HIGHLIGHT_HEX_TO_NAME table (pinned by shared.test.ts) — a hex that isn't
 * serialises as run shading instead of a true `w:highlight`.
 */
export const HIGHLIGHT_SWATCHES = [
  'FFFF00', '00FF00', '00FFFF', 'FF00FF', '0000FF', 'FF0000', '00008B', '008080', '008000', '800080',
  '8B0000', '808000', '808080', 'C0C0C0',
] as const;
