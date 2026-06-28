import type { TableContextInfo } from '@eigenpal/docx-editor-core/prosemirror';
import { Button } from '@patrick/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@patrick/ui/components/dropdown-menu';
import {
  ChevronDown,
  Columns3,
  Grid2x2,
  Merge,
  PaintBucket,
  Rows3,
  Settings2,
  Split,
  Square,
  Table2,
  Trash2,
} from 'lucide-react';
import type { TableAction } from '../../ui/TableToolbar';
import { ColorControl } from '../color-control';
import { keepFocus } from '../shared';

// Grayscale + Office standard colours (hex without #) — shared shape with the
// character colour controls.
const SWATCHES = [
  '000000', '434343', '666666', '999999', 'B7B7B7', 'CCCCCC', 'D9D9D9', 'EFEFEF', 'F3F3F3', 'FFFFFF',
  'C00000', 'FF0000', 'FFC000', 'FFFF00', '92D050', '00B050', '00B0F0', '0070C0', '002060', '7030A0',
] as const;

const BORDER_PRESETS: { action: TableAction; label: string }[] = [
  { action: 'borderAll', label: 'All borders' },
  { action: 'borderOutside', label: 'Outside borders' },
  { action: 'borderInside', label: 'Inside borders' },
  { action: 'borderNone', label: 'No borders' },
];
// size = eighths of a point.
const BORDER_WIDTHS: { size: number; label: string }[] = [
  { size: 4, label: '0.5 pt' },
  { size: 8, label: '1 pt' },
  { size: 12, label: '1.5 pt' },
  { size: 16, label: '2 pt' },
  { size: 24, label: '3 pt' },
];

export interface TableGroupProps {
  tableContext: TableContextInfo;
  onTableAction: (action: TableAction) => void;
}

/** Contextual table controls — appear in the format band when the cursor is in a table. */
export function TableGroup({ tableContext, onTableAction }: TableGroupProps) {
  const canMerge = Boolean(tableContext.hasMultiCellSelection);
  const canSplit = Boolean(tableContext.canSplitCell);

  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" tooltip="Borders" onMouseDown={keepFocus}>
            <Grid2x2 />
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {BORDER_PRESETS.map((p) => (
            <DropdownMenuItem key={p.label} onSelect={() => onTableAction(p.action)}>
              {p.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Width</DropdownMenuLabel>
          {BORDER_WIDTHS.map((w) => (
            <DropdownMenuItem key={w.size} onSelect={() => onTableAction({ type: 'borderWidth', size: w.size })}>
              {w.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ColorControl
        icon={Square}
        tooltip="Border colour"
        currentColor={tableContext.cellBorderColor?.rgb}
        swatches={SWATCHES}
        clearLabel="Default (black)"
        onPick={(hex) => onTableAction({ type: 'borderColor', color: hex })}
        onClear={() => onTableAction({ type: 'borderColor', color: '000000' })}
      />
      <ColorControl
        icon={PaintBucket}
        tooltip="Cell fill"
        currentColor={tableContext.cellBackgroundColor}
        swatches={SWATCHES}
        clearLabel="No fill"
        onPick={(hex) => onTableAction({ type: 'cellFillColor', color: hex })}
        onClear={() => onTableAction({ type: 'cellFillColor', color: null })}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" tooltip="Table" onMouseDown={keepFocus}>
            <Table2 />
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => onTableAction('addRowAbove')}>
            <Rows3 className="size-4" /> Insert row above
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onTableAction('addRowBelow')}>
            <Rows3 className="size-4" /> Insert row below
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onTableAction('addColumnLeft')}>
            <Columns3 className="size-4" /> Insert column left
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onTableAction('addColumnRight')}>
            <Columns3 className="size-4" /> Insert column right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onTableAction('deleteRow')}>
            <Rows3 className="size-4" /> Delete row
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onTableAction('deleteColumn')}>
            <Columns3 className="size-4" /> Delete column
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canMerge} onSelect={() => onTableAction('mergeCells')}>
            <Merge className="size-4" /> Merge cells
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canSplit} onSelect={() => onTableAction('splitCell')}>
            <Split className="size-4" /> Split cell
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onTableAction({ type: 'openTableProperties' })}>
            <Settings2 className="size-4" /> Table properties
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onTableAction('deleteTable')}>
            <Trash2 className="size-4" /> Delete table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
