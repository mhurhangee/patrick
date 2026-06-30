import type { WrapType } from '@eigenpal/docx-editor-core/docx/wrapTypes';
import {
  IMAGE_LAYOUT_OPTIONS,
  deriveLayoutChoice,
  type ImageLayoutIconHint,
  isImageLayoutOptionEnabled,
} from '@eigenpal/docx-editor-core/layout-painter';
import type { ImageLayoutTarget } from '@eigenpal/docx-editor-core/prosemirror/commands';
import { DropdownMenuItem, DropdownMenuSeparator } from '@patrick/ui/components/dropdown-menu';
import {
  BringToFront,
  Check,
  type LucideIcon,
  PanelLeft,
  PanelRight,
  SendToBack,
  Settings2,
  WrapText,
} from 'lucide-react';
import { Fragment, useMemo } from 'react';
import type {
  ImageAttrsCssFloat,
  ImageContextMenuTextAction,
  TextContextAction,
} from './types';
import { ActionMenuItem } from './action-menu-item';
import { PositionedMenu } from './positioned-menu';

/** Core's icon-hint vocabulary → lucide icon components. */
const ICON_BY_HINT: Record<ImageLayoutIconHint, LucideIcon> = {
  inline: WrapText,
  squareLeft: PanelLeft,
  squareRight: PanelRight,
  behind: SendToBack,
  inFront: BringToFront,
};

// Labels + descriptions for the IMAGE_LAYOUT_OPTIONS, keyed by their stable
// option key (matches each option's i18nLabelKey / i18nDescKey).
const WRAP_LABEL: Record<string, string> = {
  inLineWithText: 'In Line with Text',
  squareLeft: 'Square Left',
  squareRight: 'Square Right',
  behindText: 'Behind Text',
  inFrontOfText: 'In Front of Text',
};

const WRAP_DESC: Record<string, string> = {
  inLineWithText: 'Image flows in the line as a glyph',
  squareLeft: 'Image floats left, text wraps on the right',
  squareRight: 'Image floats right, text wraps on the left',
  behindText: 'Image paints behind body text',
  inFrontOfText: 'Image paints over body text',
};

export interface ImageContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  /** Current wrap type of the right-clicked image (drives the ✓ on the current option). */
  currentWrapType: WrapType;
  /** Current cssFloat — disambiguates square-left vs square-right. */
  currentCssFloat?: ImageAttrsCssFloat;
  /** Apply a layout choice. Disabled (no-op) options never fire. */
  onApplyLayout: (target: ImageLayoutTarget) => void;
  /** Clipboard actions appended below the layout group (Cut/Copy/Paste/Delete). */
  textActions?: ImageContextMenuTextAction[];
  onTextAction?: (action: TextContextAction) => void;
  /** When provided, an "Image properties…" item is rendered at the top. */
  onOpenProperties?: () => void;
  onClose: () => void;
}

/**
 * Right-click image menu — mirrors Word's: layout/wrap options (highlighting the
 * current one), optional "Image properties…", then the standard clipboard
 * actions. Layout options + their enabled/current logic come from core
 * (`IMAGE_LAYOUT_OPTIONS` / `deriveLayoutChoice` / `isImageLayoutOptionEnabled`).
 */
export function ImageContextMenu({
  isOpen,
  position,
  currentWrapType,
  currentCssFloat,
  onApplyLayout,
  textActions,
  onTextAction,
  onOpenProperties,
  onClose,
}: ImageContextMenuProps) {
  const currentChoice = useMemo(
    () => deriveLayoutChoice(currentWrapType, currentCssFloat ?? null),
    [currentWrapType, currentCssFloat]
  );

  return (
    <PositionedMenu
      open={isOpen}
      x={position.x}
      y={position.y}
      onClose={onClose}
      ariaLabel={'Image layout options'}
      contentClassName="min-w-60"
    >
      {isOpen && (
        <>
          {onOpenProperties && (
            <>
              <DropdownMenuItem onSelect={() => onOpenProperties()}>
                <Settings2 className="size-4" />
                <span className="flex-1">{'Image properties…'}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {IMAGE_LAYOUT_OPTIONS.map((option) => {
            const isCurrent = option.choice === currentChoice;
            const HintIcon = ICON_BY_HINT[option.iconHint];
            const enabled = isImageLayoutOptionEnabled(option, currentWrapType);
            return (
              <DropdownMenuItem
                key={option.choice}
                disabled={!enabled}
                onSelect={() => onApplyLayout(option.choice as ImageLayoutTarget)}
                title={WRAP_DESC[option.i18nDescKey]}
              >
                <HintIcon className="size-4" />
                <span className="flex-1">{WRAP_LABEL[option.i18nLabelKey]}</span>
                {isCurrent && <Check className="size-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}
          {textActions && textActions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {textActions.map((item, index) => (
                <Fragment key={`${item.action}-${index}`}>
                  <ActionMenuItem item={item} onSelect={() => onTextAction?.(item.action)} />
                  {item.dividerAfter && <DropdownMenuSeparator />}
                </Fragment>
              ))}
            </>
          )}
        </>
      )}
    </PositionedMenu>
  );
}
