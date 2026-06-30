import { cn } from '@patrick/ui/lib/utils';
import { useState } from 'react';

/**
 * A hover-to-size table grid picker for the Insert menu. Tailwind + global
 * shadcn tokens, so it works inside a portalled dropdown. Pick = click a cell.
 */
export function TableGrid({
  onPick,
  rows = 8,
  cols = 8,
}: {
  onPick: (rows: number, cols: number) => void;
  rows?: number;
  cols?: number;
}) {
  const [r, setR] = useState(0);
  const [c, setC] = useState(0);

  return (
    <div onMouseLeave={() => { setR(0); setC(0); }}>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${cols}, 1rem)` }}
        role="grid"
        aria-label="Table size"
      >
        {Array.from({ length: rows * cols }, (_, i) => {
          const row = Math.floor(i / cols) + 1;
          const col = (i % cols) + 1;
          const on = row <= r && col <= c;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${col} × ${row}`}
              onMouseEnter={() => { setR(row); setC(col); }}
              onClick={() => onPick(row, col)}
              className={cn(
                'size-4 rounded-[3px] border transition-colors',
                on ? 'border-primary bg-primary' : 'border-border bg-background hover:border-primary/50',
              )}
            />
          );
        })}
      </div>
      <div className="mt-1.5 text-center text-xs text-muted-foreground tabular-nums">
        {r > 0 && c > 0 ? `${c} × ${r}` : 'Select size'}
      </div>
    </div>
  );
}
