import { Button } from '@patrick/ui/components/button';
import { Input } from '@patrick/ui/components/input';
import { Label } from '@patrick/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@patrick/ui/components/select';
import { useState } from 'react';
import type { TablePropertiesValue } from './types';

/**
 * Table-properties form shown in a cursor-anchored popover (off the table menu):
 * preferred width (auto / fixed twips / percentage) + alignment.
 */
export function TablePropertiesForm({
  current,
  onApply,
  onClose,
}: {
  current?: Record<string, unknown> | undefined;
  onApply: (props: TablePropertiesValue) => void;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(typeof current?.width === 'number' ? current.width : 0);
  const [widthType, setWidthType] = useState(
    typeof current?.widthType === 'string' ? current.widthType : 'auto',
  );
  const [justification, setJustification] = useState(
    typeof current?.justification === 'string' ? current.justification : 'left',
  );

  const apply = () => {
    onApply({
      width: widthType === 'auto' ? null : width,
      widthType,
      justification: justification as 'left' | 'center' | 'right',
    });
    onClose();
  };

  return (
    <div className="flex w-60 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Label className="w-16 text-muted-foreground">Width</Label>
        <Select value={widthType} onValueChange={setWidthType}>
          <SelectTrigger size="sm" className="flex-1" aria-label="Width type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="dxa">Fixed</SelectItem>
            <SelectItem value="pct">Percent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {widthType !== 'auto' && (
        <div className="flex items-center gap-2">
          <Label className="w-16 text-muted-foreground">{widthType === 'pct' ? '×50ths' : 'Twips'}</Label>
          <Input
            inputMode="numeric"
            value={String(width)}
            onChange={(e) => setWidth(Number(e.target.value) || 0)}
            className="h-8 flex-1 text-sm"
            aria-label="Width value"
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Label className="w-16 text-muted-foreground">Align</Label>
        <Select value={justification} onValueChange={setJustification}>
          <SelectTrigger size="sm" className="flex-1" aria-label="Alignment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="right">Right</SelectItem>
          </SelectContent>
        </Select>
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
