import { useCallback, useState } from 'react';
import type { WrapType } from '@eigenpal/docx-editor-core/docx/wrapTypes';
import type { ImageAttrsCssFloat } from '../types/context-menu';

export interface UseImageContextMenuReturn {
  isOpen: boolean;
  position: { x: number; y: number };
  currentWrapType: WrapType;
  currentCssFloat: ImageAttrsCssFloat;
  /** PM doc position of the image being edited (for command dispatch). */
  imagePos: number | null;
  /** Captured rendered position of an inline image in EMUs, used by inline →
   *  anchor transitions to seed `wp:positionH/V`. Null for non-inline images. */
  inlinePositionEmu: { horizontalEmu: number; verticalEmu: number } | null;
  /** Open the menu at a specific viewport position for a specific image. */
  openForImage: (opts: {
    x: number;
    y: number;
    wrapType: WrapType;
    cssFloat?: ImageAttrsCssFloat;
    pos: number;
    inlinePositionEmu?: { horizontalEmu: number; verticalEmu: number };
  }) => void;
  closeMenu: () => void;
}

/** State for the image right-click menu — captures the image's layout + PM pos
 *  on open so the menu can apply wrap changes and clipboard actions to it. */
export function useImageContextMenu(): UseImageContextMenuReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [currentWrapType, setCurrentWrapType] = useState<WrapType>('inline');
  const [currentCssFloat, setCurrentCssFloat] = useState<ImageAttrsCssFloat>(null);
  const [imagePos, setImagePos] = useState<number | null>(null);
  const [inlinePositionEmu, setInlinePositionEmu] =
    useState<UseImageContextMenuReturn['inlinePositionEmu']>(null);

  const openForImage = useCallback(
    (opts: {
      x: number;
      y: number;
      wrapType: WrapType;
      cssFloat?: ImageAttrsCssFloat;
      pos: number;
      inlinePositionEmu?: { horizontalEmu: number; verticalEmu: number };
    }) => {
      setPosition({ x: opts.x, y: opts.y });
      setCurrentWrapType(opts.wrapType);
      setCurrentCssFloat(opts.cssFloat ?? null);
      setImagePos(opts.pos);
      setInlinePositionEmu(opts.inlinePositionEmu ?? null);
      setIsOpen(true);
    },
    []
  );

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setImagePos(null);
    setInlinePositionEmu(null);
  }, []);

  return {
    isOpen,
    position,
    currentWrapType,
    currentCssFloat,
    imagePos,
    inlinePositionEmu,
    openForImage,
    closeMenu,
  };
}
