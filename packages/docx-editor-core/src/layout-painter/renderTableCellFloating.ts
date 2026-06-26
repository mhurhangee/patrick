/**
 * Floating-image extraction for table cells.
 *
 * Pulls anchored/floating images out of a cell's paragraphs and computes their
 * positions relative to the cell content area. Split out of renderTable.ts so
 * that file stays focused on row/cell/fragment painting.
 */

import type {
  ImageRun,
  ParagraphBlock,
  ParagraphMeasure,
  TableCell,
  TableCellMeasure,
  TableMeasure,
} from '../layout-engine/types';
import { emuToPixels } from '../utils/units';
import { imageWrapTextFromCssFloat, isFloatingImageRun } from './floatingImageFlow';

/** Info about a floating image extracted from a cell paragraph */
export interface CellFloatingImage {
  src: string;
  width: number;
  height: number;
  alt?: string;
  transform?: string;
  x: number;
  y: number;
  side: 'left' | 'right';
  distTop: number;
  distBottom: number;
  distLeft: number;
  distRight: number;
  /** OOXML wrapText: which side(s) TEXT flows on */
  wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
  /** Wrap type (square, tight, through, behind, inFront) */
  wrapType?: string;
  pmStart?: number;
  pmEnd?: number;
}

/**
 * Extract floating images from cell paragraphs and compute their positions
 * relative to the cell content area.
 *
 * NOTE: The horizontal/vertical position logic here mirrors
 * extractFloatingImagesFromParagraph() in renderPage.ts. Kept separate
 * because the coordinate systems differ (cell-relative vs page-relative).
 */
export function extractCellFloatingImages(
  cell: TableCell,
  cellMeasure: TableCellMeasure,
  contentWidth: number
): CellFloatingImage[] {
  const result: CellFloatingImage[] = [];
  let paragraphY = 0;

  for (let blockIndex = 0; blockIndex < cell.blocks.length; blockIndex++) {
    const block = cell.blocks[blockIndex];
    if (block?.kind !== 'paragraph') {
      // Use actual measured height for Y tracking
      const blockMeasure = cellMeasure.blocks[blockIndex];
      if (blockMeasure && blockMeasure.kind === 'table') {
        paragraphY += (blockMeasure as TableMeasure).totalHeight ?? 0;
      }
      continue;
    }
    const pBlock = block as ParagraphBlock;

    for (const run of pBlock.runs) {
      if (run.kind !== 'image') continue;
      const imgRun = run as ImageRun;
      if (!isFloatingImageRun(imgRun)) continue;

      const position = imgRun.position;
      const distTop = imgRun.distTop ?? 0;
      const distBottom = imgRun.distBottom ?? 0;
      const distLeft = imgRun.distLeft ?? 12;
      const distRight = imgRun.distRight ?? 12;

      // Horizontal position within cell
      let side: 'left' | 'right' = 'left';
      let x = 0;

      if (position?.horizontal) {
        const h = position.horizontal;
        if (h.align === 'right') {
          side = 'right';
          x = contentWidth - imgRun.width;
        } else if (h.align === 'left') {
          x = 0;
        } else if (h.align === 'center') {
          x = (contentWidth - imgRun.width) / 2;
        } else if (h.posOffset !== undefined) {
          x = emuToPixels(h.posOffset);
          side = x > contentWidth / 2 ? 'right' : 'left';
        }
      } else if (imgRun.cssFloat === 'right') {
        side = 'right';
        x = contentWidth - imgRun.width;
      }

      // Vertical position within cell
      let y = paragraphY;
      if (position?.vertical) {
        const v = position.vertical;
        if (v.posOffset !== undefined) {
          y = paragraphY + emuToPixels(v.posOffset);
        } else if (v.align === 'top') {
          y = 0;
        }
      }

      // Clamp within cell bounds
      x = Math.max(0, Math.min(x, contentWidth - imgRun.width));

      result.push({
        src: imgRun.src,
        width: imgRun.width,
        height: imgRun.height,
        alt: imgRun.alt,
        transform: imgRun.transform,
        x,
        y,
        side,
        distTop,
        distBottom,
        distLeft,
        distRight,
        wrapText: imageWrapTextFromCssFloat(imgRun.cssFloat),
        wrapType: imgRun.wrapType,
        pmStart: imgRun.pmStart,
        pmEnd: imgRun.pmEnd,
      });
    }

    // Use actual measured height for Y tracking
    const blockMeasure = cellMeasure.blocks[blockIndex];
    if (blockMeasure && blockMeasure.kind === 'paragraph') {
      paragraphY += (blockMeasure as ParagraphMeasure).totalHeight;
    }
  }

  return result;
}
