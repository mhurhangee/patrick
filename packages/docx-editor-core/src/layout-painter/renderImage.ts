/**
 * Image Renderer
 *
 * Renders image fragments to DOM. Handles:
 * - Inline images
 * - Anchored/floating images with z-index layering
 * - Basic image sizing
 */

import type { ImageFragment, ImageBlock, ImageMeasure } from '../layout-engine/types';
import type { RenderContext } from './renderPage';

/**
 * CSS class names for image elements
 */
export const IMAGE_CLASS_NAMES = {
  image: 'layout-image',
  imageAnchored: 'layout-image-anchored',
};

/**
 * Structural shape required to apply Word's per-image visual attributes:
 * `wp:srcRect` crop fractions, `a:alphaModFix` opacity, and `wp:effectExtent`
 * reservation. `ImageRun`, `FloatingImagePaintRecord`, and `PageFloatingImage`
 * all satisfy this — no adapter needed at the call sites.
 *
 * effectExtent is intentionally NOT applied to CSS: per ECMA-376 §20.4.2.5
 * it's a hint to the wrap engine about the visual bounding box, not a request
 * to shift the picture. Applying it as `margin` would push the image (or its
 * siblings) instead of reserving space for a shadow that we don't draw. We
 * keep the values on the model so they round-trip cleanly; if a real shadow
 * effect ships later, the reservation becomes meaningful.
 */
export interface ImageVisualAttrs {
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  opacity?: number;
}

/**
 * True when any visual attribute is set. Cheap call-site guard so the no-op
 * common case skips the function call and template-literal allocations.
 *
 * IMPORTANT: ProseMirror schema attrs default to `null`, not `undefined`,
 * and that `null` survives the `as number | undefined` cast in the layout
 * bridge. Use `!= null` rather than `!== undefined` so a default-null
 * opacity isn't read as `0` (`null < 1` is `true`, `Math.max(0, null)` is
 * `0`) — that bug hid every image behind `opacity: 0`.
 */
export function hasImageVisualAttrs(v: ImageVisualAttrs): boolean {
  return Boolean(
    v.cropTop || v.cropRight || v.cropBottom || v.cropLeft || (v.opacity != null && v.opacity < 1)
  );
}

/** True when an OOXML `srcRect` crop is present on any edge. */
export function hasImageCrop(v: ImageVisualAttrs): boolean {
  return Boolean(v.cropTop || v.cropRight || v.cropBottom || v.cropLeft);
}

/**
 * Apply Word's per-image visual attributes (opacity AND `srcRect` crop) to an
 * `<img>`. Single entry point on purpose: an earlier split into separate
 * opacity/crop helpers let callers apply one and silently drop the other
 * (floating images lost their crop). Callers just gate with
 * {@link hasImageVisualAttrs} and call this. The img must already be sized to
 * its display box.
 */
export function applyImageVisualAttrs(img: HTMLImageElement, v: ImageVisualAttrs): void {
  if (v.opacity != null && v.opacity < 1) {
    img.style.opacity = String(Math.max(0, v.opacity));
  }
  applyImageCrop(img, v);
}

/**
 * Render an OOXML `srcRect` crop on the `<img>` itself, keeping its element box
 * at the display size so selection/resize overlays (which measure the `<img>`'s
 * bounding rect) keep working.
 *
 * `srcRect` trims fractions off each edge of the SOURCE; the remaining region is
 * displayed at the box size. `object-fit: cover` scales the source uniformly (no
 * distortion) to cover that box and crops the overflow; `object-position` picks
 * the kept region — `left / (left + right)` of the horizontal overflow goes off
 * the left edge, likewise top/bottom. Plain "size the img to the box" stretched
 * the whole source in (squashed); cover preserves the source's proportions.
 *
 * Limitation: this is exact only when the display-box aspect matches the cropped
 * region's aspect — which holds for the normal "crop only" case (`wp:extent` is
 * the cropped display size). When the frame was resized to a different aspect
 * after cropping, Word stretches the region non-uniformly; cover instead keeps
 * the aspect and clips, so the framing can differ. A faithful non-uniform crop
 * needs a scaled inner img in an overflow-hidden wrapper, but that detaches the
 * img's box from the display size and breaks selection/resize — so cover is the
 * deliberate tradeoff.
 */
export function applyImageCrop(img: HTMLImageElement, v: ImageVisualAttrs): void {
  const top = v.cropTop ?? 0;
  const right = v.cropRight ?? 0;
  const bottom = v.cropBottom ?? 0;
  const left = v.cropLeft ?? 0;
  if (!(top || right || bottom || left)) return;
  const posX = left + right > 0 ? (left / (left + right)) * 100 : 50;
  const posY = top + bottom > 0 ? (top / (top + bottom)) * 100 : 50;
  img.style.objectFit = 'cover';
  img.style.objectPosition = `${posX}% ${posY}%`;
}

/**
 * Options for rendering an image fragment
 */
export interface RenderImageFragmentOptions {
  document?: Document;
}

/**
 * Render an image fragment to DOM
 *
 * @param fragment - The image fragment to render
 * @param block - The full image block
 * @param measure - The image measure
 * @param context - Rendering context
 * @param options - Rendering options
 * @returns The image DOM element
 */
export function renderImageFragment(
  fragment: ImageFragment,
  block: ImageBlock,
  _measure: ImageMeasure,
  _context: RenderContext,
  options: RenderImageFragmentOptions = {}
): HTMLElement {
  const doc = options.document ?? document;

  // Create container div
  const containerEl = doc.createElement('div');
  containerEl.className = IMAGE_CLASS_NAMES.image;

  if (fragment.isAnchored) {
    containerEl.classList.add(IMAGE_CLASS_NAMES.imageAnchored);
  }

  // Basic styling
  containerEl.style.position = 'absolute';
  containerEl.style.width = `${fragment.width}px`;
  containerEl.style.height = `${fragment.height}px`;
  containerEl.style.overflow = 'hidden';

  // Z-index for layering
  if (fragment.zIndex !== undefined) {
    containerEl.style.zIndex = String(fragment.zIndex);
  }

  // Behind document flag
  if (block.anchor?.behindDoc) {
    containerEl.style.zIndex = '-1';
  }

  // Store metadata
  containerEl.dataset.blockId = String(fragment.blockId);

  if (fragment.pmStart !== undefined) {
    containerEl.dataset.pmStart = String(fragment.pmStart);
  }
  if (fragment.pmEnd !== undefined) {
    containerEl.dataset.pmEnd = String(fragment.pmEnd);
  }

  // Create the actual image element
  const imgEl = doc.createElement('img');
  imgEl.src = block.src;
  imgEl.alt = block.alt ?? '';

  // Image sizing
  imgEl.style.width = '100%';
  imgEl.style.height = '100%';
  imgEl.style.objectFit = 'contain';
  imgEl.style.display = 'block';

  // Apply transform if present (rotation, flip)
  if (block.transform) {
    imgEl.style.transform = block.transform;
  }

  // Prevent dragging
  imgEl.draggable = false;

  // Wrap in hyperlink if image has a link
  if (block.hlinkHref) {
    const linkEl = doc.createElement('a');
    linkEl.href = block.hlinkHref;
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
    linkEl.style.display = 'block';
    linkEl.style.width = '100%';
    linkEl.style.height = '100%';
    linkEl.appendChild(imgEl);
    containerEl.appendChild(linkEl);
  } else {
    containerEl.appendChild(imgEl);
  }

  return containerEl;
}
