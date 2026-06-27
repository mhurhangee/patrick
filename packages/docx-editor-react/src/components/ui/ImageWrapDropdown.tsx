/**
 * Image Wrap Dropdown — thin wrapper around IconGridDropdown.
 */

import { IconGridDropdown, type IconGridOption } from './IconGridDropdown';
import { BringToFront, PanelLeft, PanelRight, SendToBack, WrapText } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '@eigenpal/docx-editor-i18n';

// Mirrors Word's simplified Picture > Wrap Text dropdown — five options.
// Top-and-bottom and tight/through live in the right-click image menu where
// Word also surfaces the full set.
const WRAP_OPTIONS: (Omit<IconGridOption, 'label'> & { labelKey: TranslationKey })[] = [
  { value: 'inline', labelKey: 'imageWrap.inline', iconName: WrapText },
  // Square Left = image anchored on the left, text wraps on the right.
  { value: 'wrapRight', labelKey: 'imageWrap.floatLeft', iconName: PanelLeft },
  // Square Right = image anchored on the right, text wraps on the left.
  { value: 'wrapLeft', labelKey: 'imageWrap.floatRight', iconName: PanelRight },
  { value: 'behind', labelKey: 'imageWrap.behindText', iconName: SendToBack },
  { value: 'inFront', labelKey: 'imageWrap.inFrontOfText', iconName: BringToFront },
];

export interface ImageWrapDropdownProps {
  imageContext: {
    wrapType: string;
    displayMode: string;
    cssFloat: string | null;
  };
  onChange: (wrapType: string) => void;
  disabled?: boolean;
}

function getActiveWrapValue(ctx: ImageWrapDropdownProps['imageContext']): string {
  if (ctx.displayMode === 'float' && ctx.cssFloat === 'left') return 'wrapRight';
  if (ctx.displayMode === 'float' && ctx.cssFloat === 'right') return 'wrapLeft';
  return ctx.wrapType;
}

export function ImageWrapDropdown({
  imageContext,
  onChange,
  disabled = false,
}: ImageWrapDropdownProps) {
  const { t } = useTranslation();
  const translatedOptions: IconGridOption[] = WRAP_OPTIONS.map((opt) => ({
    ...opt,
    label: t(opt.labelKey),
  }));

  const activeValue = getActiveWrapValue(imageContext);
  const currentOption =
    translatedOptions.find((o) => o.value === activeValue) || translatedOptions[0];

  return (
    <IconGridDropdown
      options={translatedOptions}
      activeValue={activeValue}
      triggerIcon={currentOption.iconName}
      tooltipContent={`Wrap: ${currentOption.label}`}
      onSelect={onChange}
      disabled={disabled}
      testId="toolbar-image-wrap"
      showLabels
    />
  );
}
