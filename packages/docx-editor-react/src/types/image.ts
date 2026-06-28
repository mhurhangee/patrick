/**
 * Image contract — the selected-image state the glue tracks and the toolbar's
 * image controls read. React-package types only.
 */

/** Full image context the glue resolves for the selected image node. */
export interface ImageContext {
  pos: number;
  wrapType: string;
  displayMode: string;
  cssFloat: string | null;
  transform: string | null;
  alt: string | null;
  borderWidth: number | null;
  borderColor: string | null;
  borderStyle: string | null;
  width: number | null;
  height: number | null;
}

/** The subset the toolbar's image group needs to resolve wrap state. */
export type ToolbarImageContext = Pick<ImageContext, 'wrapType' | 'displayMode' | 'cssFloat'>;
