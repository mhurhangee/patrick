import { Button } from '@patrick/ui/components/button';
import { Label } from '@patrick/ui/components/label';
import { NumberField } from '@patrick/ui/components/number-field';
import { useState } from 'react';

/**
 * Split-cell form shown in a cursor-anchored popover (off the table menu) — the
 * number of rows/columns to split the current cell into.
 */
export function SplitCellForm({
  initialRows,
  initialCols,
  minRows,
  minCols,
  onApply,
  onClose,
}: {
  initialRows: number;
  initialCols: number;
  minRows: number;
  minCols: number;
  onApply: (rows: number, cols: number) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState(initialRows);
  const [cols, setCols] = useState(initialCols);
  const invalid = rows < minRows || cols < minCols || (rows === 1 && cols === 1);

  const apply = () => {
    if (invalid) return;
    onApply(rows, cols);
    onClose();
  };

  return (
    <div className="flex w-52 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Label className="w-16 text-muted-foreground">Rows</Label>
        <NumberField value={rows} onValueChange={setRows} min={minRows} max={20} className="flex-1" aria-label="Rows" />
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-16 text-muted-foreground">Columns</Label>
        <NumberField value={cols} onValueChange={setCols} min={minCols} max={20} className="flex-1" aria-label="Columns" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={apply} disabled={invalid}>
          Split
        </Button>
      </div>
    </div>
  );
}
