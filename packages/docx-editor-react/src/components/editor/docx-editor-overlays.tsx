import { ImageContextMenu } from '../../features/context-menu/image-context-menu';
import { TextContextMenu } from '../../features/context-menu/text-context-menu';
import type { useImageContextMenu } from '../../features/context-menu/use-image-context-menu';
import type { TextContextMenuItem } from '../../features/context-menu/types';

interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  hasSelection: boolean;
}

/**
 * Floating overlays painted on top of the editor: the right-click text
 * menu and the image right-click menu. Pulled out as a single component
 * because they always render as a sibling block at the end of the editor tree.
 *
 * The hyperlink popup lives inside PagedEditor's root container — it
 * needs to share a scroll context with the link so CSS handles the
 * follow-on-scroll for free, with no JS listener.
 */
export function DocxEditorOverlays({
  // Right-click text menu
  contextMenu,
  contextMenuItems,
  onContextMenuAction,
  onContextMenuClose,
  // Image right-click menu
  imageContextMenu,
  onImageWrapApply,
  imageContextMenuTextActions,
  onOpenImageProperties,
  // Shared
  readOnly,
}: {
  contextMenu: ContextMenuState;
  contextMenuItems: TextContextMenuItem[];
  onContextMenuAction: React.ComponentProps<typeof TextContextMenu>['onAction'];
  onContextMenuClose: () => void;
  imageContextMenu: ReturnType<typeof useImageContextMenu>;
  onImageWrapApply: React.ComponentProps<typeof ImageContextMenu>['onApplyLayout'];
  imageContextMenuTextActions: React.ComponentProps<typeof ImageContextMenu>['textActions'];
  onOpenImageProperties?: () => void;
  readOnly: boolean;
}) {
  return (
    <>
      <TextContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        hasSelection={contextMenu.hasSelection}
        isEditable={!readOnly}
        items={contextMenuItems}
        onAction={onContextMenuAction}
        onClose={onContextMenuClose}
      />
      <ImageContextMenu
        isOpen={imageContextMenu.isOpen}
        position={imageContextMenu.position}
        currentWrapType={imageContextMenu.currentWrapType}
        currentCssFloat={imageContextMenu.currentCssFloat}
        onApplyLayout={onImageWrapApply}
        textActions={imageContextMenuTextActions}
        onTextAction={onContextMenuAction}
        onOpenProperties={onOpenImageProperties}
        onClose={imageContextMenu.closeMenu}
      />
    </>
  );
}
