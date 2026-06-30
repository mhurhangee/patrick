import { Button } from '@patrick/ui/components/button';
import { Input } from '@patrick/ui/components/input';
import { Label } from '@patrick/ui/components/label';
import { Switch } from '@patrick/ui/components/switch';
import { Textarea } from '@patrick/ui/components/textarea';
import { useEffect, useState } from 'react';
import { useAspectLockedSize } from './use-aspect-locked-size';
import type { ImageContext, ImagePropertiesData } from './types';

/**
 * The image-properties form (alt text + dimensions with an aspect-ratio lock).
 * Border is not editable here; existing border attrs are preserved on apply.
 * Mounts fresh each open, so it seeds from the current image on mount.
 */
export function ImagePropertiesForm({
  imageContext,
  onApply,
  onClose,
}: {
  imageContext: ImageContext;
  onApply: (data: ImagePropertiesData) => void;
  onClose: () => void;
}) {
  const [alt, setAlt] = useState(imageContext.alt ?? '');
  const { width, height, lockAspect, setLockAspect, handleWidthChange, handleHeightChange, seed } =
    useAspectLockedSize();

  // biome-ignore lint/correctness/useExhaustiveDependencies: seed once on mount (the popover remounts this on each open)
  useEffect(() => {
    setAlt(imageContext.alt ?? '');
    seed(imageContext.width, imageContext.height);
  }, []);

  const apply = () => {
    onApply({
      alt: alt || undefined,
      // Border isn't editable here; preserve whatever the image already has.
      borderWidth: imageContext.borderWidth ?? undefined,
      borderColor: imageContext.borderColor ?? undefined,
      borderStyle: imageContext.borderStyle ?? undefined,
      width: typeof width === 'number' && width > 0 ? width : undefined,
      height: typeof height === 'number' && height > 0 ? height : undefined,
    });
    onClose();
  };

  return (
    <div className="flex w-60 flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="img-alt" className="text-xs text-muted-foreground">
          Alt text
        </Label>
        <Textarea
          id="img-alt"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          rows={2}
          className="resize-none text-sm"
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="img-w" className="text-xs text-muted-foreground">
            Width
          </Label>
          <Input
            id="img-w"
            inputMode="numeric"
            value={width === '' ? '' : String(width)}
            onChange={(e) => handleWidthChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="img-h" className="text-xs text-muted-foreground">
            Height
          </Label>
          <Input
            id="img-h"
            inputMode="numeric"
            value={height === '' ? '' : String(height)}
            onChange={(e) => handleHeightChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="img-lock" className="text-xs text-muted-foreground">
          Lock aspect ratio
        </Label>
        <Switch id="img-lock" checked={lockAspect} onCheckedChange={setLockAspect} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={apply}>
          Apply
        </Button>
      </div>
    </div>
  );
}
