/**
 * Image Transform Dropdown — thin wrapper around IconGridDropdown.
 */

import { IconGridDropdown, type IconGridOption } from './IconGridDropdown';
import { ArrowLeftRight, ArrowUpDown, RotateCcw, RotateCw } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '@eigenpal/docx-editor-i18n';

type TransformAction = 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV';

const TRANSFORM_OPTIONS: (Omit<IconGridOption<TransformAction>, 'label'> & {
  labelKey: TranslationKey;
})[] = [
  { value: 'rotateCW', labelKey: 'imageTransform.rotateClockwise', iconName: RotateCw },
  {
    value: 'rotateCCW',
    labelKey: 'imageTransform.rotateCounterClockwise',
    iconName: RotateCcw,
  },
  { value: 'flipH', labelKey: 'imageTransform.flipHorizontal', iconName: ArrowLeftRight },
  { value: 'flipV', labelKey: 'imageTransform.flipVertical', iconName: ArrowUpDown },
];

export interface ImageTransformDropdownProps {
  onTransform: (action: TransformAction) => void;
  disabled?: boolean;
}

export function ImageTransformDropdown({
  onTransform,
  disabled = false,
}: ImageTransformDropdownProps) {
  const { t } = useTranslation();
  const translatedOptions: IconGridOption<TransformAction>[] = TRANSFORM_OPTIONS.map((opt) => ({
    ...opt,
    label: t(opt.labelKey),
  }));

  return (
    <IconGridDropdown<TransformAction>
      options={translatedOptions}
      triggerIcon={RotateCw}
      tooltipContent={t('imageTransform.tooltip')}
      onSelect={onTransform}
      disabled={disabled}
      testId="toolbar-image-transform"
    />
  );
}
