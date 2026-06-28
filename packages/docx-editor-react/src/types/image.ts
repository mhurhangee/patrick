/**
 * Image contract — the selected-image state the glue tracks, the toolbar's image
 * controls read, and the editable properties they apply. React-package types only.
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

/** The editable image properties applied from the image-properties popover. */
export interface ImagePropertiesData {
  alt?: string;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: string;
  width?: number;
  height?: number;
}
