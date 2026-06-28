import { Button } from '@patrick/ui/components/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@patrick/ui/components/popover';
import { cn } from '@patrick/ui/lib/utils';
import { Ban, Check, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { keepFocus } from './shared';

const HEX6 = /^#?[0-9a-fA-F]{6}$/;
const withHash = (hex: string) => (hex.startsWith('#') ? hex : `#${hex}`);
const bare = (hex: string) => hex.replace(/^#/, '').toUpperCase();

export interface ColorControlProps {
  icon: LucideIcon;
  tooltip: string;
  /** Current colour for the indicator bar under the icon (hex, with/without #). */
  currentColor?: string | undefined;
  /** Swatch hexes (without #). */
  swatches: readonly string[];
  /** Label for the clear row (e.g. "Automatic" / "No highlight"). */
  clearLabel: string;
  /** Picked a swatch / custom hex (bare hex, no #). */
  onPick: (hex: string) => void;
  /** Cleared to the default (automatic text / no highlight). */
  onClear: () => void;
}

/**
 * A colour picker trigger + popover, reused for text colour and highlight (and,
 * later, table border/fill). The icon shows a thin bar of the current colour;
 * the popover offers a clear row, a swatch grid, and a custom hex input.
 */
export function ColorControl({
  icon: Icon,
  tooltip,
  currentColor,
  swatches,
  clearLabel,
  onPick,
  onClear,
}: ColorControlProps) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState('');
  const current = currentColor ? bare(currentColor) : undefined;

  const pick = (h: string) => {
    onPick(bare(h));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={tooltip}
          onMouseDown={keepFocus}
          className="relative"
        >
          <Icon />
          <span
            className="absolute inset-x-1.5 bottom-1 h-[3px] rounded-full"
            style={{
              // hex → #hex; a named highlight (e.g. "yellow") is already valid CSS.
              backgroundColor: currentColor
                ? HEX6.test(currentColor)
                  ? withHash(currentColor)
                  : currentColor
                : 'transparent',
            }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => {
            onClear();
            setOpen(false);
          }}
          className="mb-2 flex w-full items-center gap-2 rounded-sm px-2 py-1 text-xs hover:bg-muted"
        >
          <Ban className="size-3.5 text-muted-foreground" />
          {clearLabel}
        </button>
        <div className="grid grid-cols-10 gap-1">
          {swatches.map((s) => {
            const selected = current === bare(s);
            return (
              <button
                key={s}
                type="button"
                aria-label={`#${s}`}
                onMouseDown={keepFocus}
                onClick={() => pick(s)}
                className={cn(
                  'flex size-4 items-center justify-center rounded-sm ring-1 ring-border ring-inset',
                  selected && 'ring-2 ring-ring',
                )}
                style={{ backgroundColor: withHash(s) }}
              >
                {selected && <Check className="size-3 text-white mix-blend-difference" />}
              </button>
            );
          })}
        </div>
        <form
          className="mt-2 flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (HEX6.test(hex)) pick(hex);
          }}
        >
          <span className="text-xs text-muted-foreground">#</span>
          <input
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            placeholder="RRGGBB"
            spellCheck={false}
            className="h-6 w-20 rounded-sm border border-border bg-transparent px-1.5 text-xs uppercase tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!HEX6.test(hex)}>
            Apply
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
