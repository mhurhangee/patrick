/**
 * Page Setup dialog — page size, orientation, and margins. One of the few editor
 * actions that stays a real modal (it's a deliberate, multi-field document
 * setting). Built on @patrick/ui.
 */

import type { SectionProperties } from '@eigenpal/docx-editor-core/types/document';
import { TWIPS_PER_INCH } from '@eigenpal/docx-editor-core/utils';
import { Button } from '@patrick/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patrick/ui/components/dialog';
import { Label } from '@patrick/ui/components/label';
import { NumberField } from '@patrick/ui/components/number-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@patrick/ui/components/select';
import { useEffect, useState } from 'react';

/** Common page sizes in twips (width x height in portrait orientation). */
const PAGE_SIZES = [
  { label: 'Letter', width: 12240, height: 15840 },
  { label: 'A4', width: 11906, height: 16838 },
  { label: 'Legal', width: 12240, height: 20160 },
  { label: 'A3', width: 16838, height: 23811 },
  { label: 'A5', width: 8391, height: 11906 },
  { label: 'B5', width: 9979, height: 14175 },
  { label: 'Executive', width: 10440, height: 15120 },
] as const;

const DEFAULT_WIDTH = 12240;
const DEFAULT_HEIGHT = 15840;
const DEFAULT_MARGIN = 1440;

export interface PageSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (props: Partial<SectionProperties>) => void;
  currentProps?: SectionProperties;
}

const twipsToInches = (twips: number) => Math.round((twips / TWIPS_PER_INCH) * 100) / 100;
const inchesToTwips = (inches: number) => Math.round(inches * TWIPS_PER_INCH);

/** Matching page-size preset (orientation-agnostic), or -1 for a custom size. */
function findPageSizeIndex(w: number, h: number): number {
  const pw = Math.min(w, h);
  const ph = Math.max(w, h);
  return PAGE_SIZES.findIndex((s) => Math.abs(s.width - pw) < 20 && Math.abs(s.height - ph) < 20);
}

export function PageSetupDialog({ isOpen, onClose, onApply, currentProps }: PageSetupDialogProps) {
  const [pageWidth, setPageWidth] = useState(DEFAULT_WIDTH);
  const [pageHeight, setPageHeight] = useState(DEFAULT_HEIGHT);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [marginTop, setMarginTop] = useState(DEFAULT_MARGIN);
  const [marginBottom, setMarginBottom] = useState(DEFAULT_MARGIN);
  const [marginLeft, setMarginLeft] = useState(DEFAULT_MARGIN);
  const [marginRight, setMarginRight] = useState(DEFAULT_MARGIN);

  useEffect(() => {
    if (!isOpen) return;
    const w = currentProps?.pageWidth || DEFAULT_WIDTH;
    const h = currentProps?.pageHeight || DEFAULT_HEIGHT;
    setPageWidth(w);
    setPageHeight(h);
    setOrientation(currentProps?.orientation || (w > h ? 'landscape' : 'portrait'));
    setMarginTop(currentProps?.marginTop ?? DEFAULT_MARGIN);
    setMarginBottom(currentProps?.marginBottom ?? DEFAULT_MARGIN);
    setMarginLeft(currentProps?.marginLeft ?? DEFAULT_MARGIN);
    setMarginRight(currentProps?.marginRight ?? DEFAULT_MARGIN);
  }, [isOpen, currentProps]);

  const handlePageSizeChange = (index: number) => {
    const size = PAGE_SIZES[index];
    if (!size) return;
    const [w, h] = orientation === 'landscape' ? [size.height, size.width] : [size.width, size.height];
    setPageWidth(w);
    setPageHeight(h);
  };

  const handleOrientationChange = (next: 'portrait' | 'landscape') => {
    if (next === orientation) return;
    setOrientation(next);
    setPageWidth(pageHeight);
    setPageHeight(pageWidth);
  };

  const handleApply = () => {
    onApply({ pageWidth, pageHeight, orientation, marginTop, marginBottom, marginLeft, marginRight });
    onClose();
  };

  const sizeIndex = findPageSizeIndex(pageWidth, pageHeight);

  const margin = (label: string, value: number, set: (twips: number) => void) => (
    <div className="flex items-center gap-2">
      <Label className="w-14 text-muted-foreground">{label}</Label>
      <NumberField
        value={twipsToInches(value)}
        onValueChange={(inches) => set(inchesToTwips(inches))}
        min={0}
        max={10}
        step={0.1}
        className="flex-1"
        aria-label={`${label} margin (inches)`}
      />
      <span className="w-4 text-xs text-muted-foreground">in</span>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Page setup</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Label className="w-20 text-muted-foreground">Size</Label>
            <Select
              value={String(sizeIndex)}
              onValueChange={(v) => handlePageSizeChange(Number(v))}
            >
              <SelectTrigger size="sm" className="flex-1" aria-label="Page size">
                <SelectValue>{sizeIndex >= 0 ? PAGE_SIZES[sizeIndex]?.label : 'Custom'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size, i) => (
                  <SelectItem key={size.label} value={String(i)}>
                    {size.label}
                  </SelectItem>
                ))}
                {sizeIndex < 0 && (
                  <SelectItem value="-1" disabled>
                    Custom
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label className="w-20 text-muted-foreground">Orientation</Label>
            <Select
              value={orientation}
              onValueChange={(v) => handleOrientationChange(v as 'portrait' | 'landscape')}
            >
              <SelectTrigger size="sm" className="flex-1" aria-label="Orientation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Margins
            </Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {margin('Top', marginTop, setMarginTop)}
              {margin('Bottom', marginBottom, setMarginBottom)}
              {margin('Left', marginLeft, setMarginLeft)}
              {margin('Right', marginRight, setMarginRight)}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
