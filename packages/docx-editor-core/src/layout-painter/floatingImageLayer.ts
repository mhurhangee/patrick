import { applyImageVisualAttrs, hasImageVisualAttrs } from './renderImage';

/**
 * Minimum fields the floating-image painter needs. Page-level and cell-level
 * float records both satisfy this shape.
 */
export interface FloatingImagePaintRecord {
  src: string;
  width: number;
  height: number;
  alt?: string;
  transform?: string;
  x: number;
  y: number;
  pmStart?: number;
  pmEnd?: number;
  /** wp:srcRect crop fractions in [0, 1]. */
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  /** a:alphaModFix -> CSS opacity. */
  opacity?: number;
}

export interface FloatingImagesLayerOptions {
  layerClass: string;
  itemClass: string;
  /**
   * `inset0` sizes the layer with `top/right/bottom/left = 0` (used at page level).
   * `fullSize` uses `width/height = 100%` and adds `overflow: hidden` (used inside table cells).
   */
  sizing: 'inset0' | 'fullSize';
  /** `behind` skips z-index so DOM order keeps the layer below body fragments. */
  layerMode: 'front' | 'behind';
}

/**
 * Render a layer of positioned floating images. Used at both page level and
 * inside table cells; the variant differs only in class names and sizing.
 */
export function renderFloatingImagesLayer(
  floatingImages: FloatingImagePaintRecord[],
  doc: Document,
  options: FloatingImagesLayerOptions
): HTMLElement {
  const layer = doc.createElement('div');
  layer.className = options.layerClass;
  layer.style.position = 'absolute';
  layer.style.top = '0';
  layer.style.left = '0';
  if (options.sizing === 'inset0') {
    layer.style.right = '0';
    layer.style.bottom = '0';
  } else {
    layer.style.width = '100%';
    layer.style.height = '100%';
    layer.style.overflow = 'hidden';
  }
  layer.style.pointerEvents = 'none';
  if (options.layerMode === 'front') {
    layer.style.zIndex = '10';
  }

  for (const floatImg of floatingImages) {
    const container = doc.createElement('div');
    container.className = options.itemClass;
    container.style.position = 'absolute';
    container.style.pointerEvents = 'auto';
    container.style.top = `${floatImg.y}px`;
    container.style.left = `${floatImg.x}px`;
    if (floatImg.pmStart !== undefined) container.dataset.pmStart = String(floatImg.pmStart);
    if (floatImg.pmEnd !== undefined) container.dataset.pmEnd = String(floatImg.pmEnd);

    const img = doc.createElement('img');
    img.src = floatImg.src;
    img.style.width = `${floatImg.width}px`;
    img.style.height = `${floatImg.height}px`;
    img.style.display = 'block';
    // A floating image is sized explicitly from its OOXML extent and may be
    // anchored so it bleeds into the page margin (e.g. a logo flush to the
    // right edge). Opt out of the global `img { max-width: 100% }` reset, which
    // would otherwise cap the width to the remaining content area and squash
    // the image against its fixed height.
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    if (floatImg.alt) img.alt = floatImg.alt;
    if (floatImg.transform) {
      img.style.transform = floatImg.transform;
      img.style.transformOrigin = 'center center';
    }
    if (hasImageVisualAttrs(floatImg)) applyImageVisualAttrs(img, floatImg);

    container.appendChild(img);
    layer.appendChild(container);
  }

  return layer;
}
