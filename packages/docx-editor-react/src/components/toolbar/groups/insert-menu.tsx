import type { Watermark } from '@eigenpal/docx-editor-core/types/document';
import { Button } from '@patrick/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@patrick/ui/components/dropdown-menu';
import {
  ChevronDown,
  Image,
  ListTree,
  Plus,
  Rows2,
  SeparatorHorizontal,
  Stamp,
  Table2,
} from 'lucide-react';
import { useState } from 'react';
import { keepFocus } from '../shared';
import { TableGrid } from '../../../features/tables/table-grid';

const WATERMARK_PRESETS = ['DRAFT', 'CONFIDENTIAL'] as const;

/** A simple diagonal grey text watermark. */
function textWatermark(text: string): Watermark {
  return { kind: 'text', text, font: 'Calibri', color: '#C0C0C0', semitransparent: true, layout: 'diagonal' };
}

export interface InsertMenuProps {
  onInsertTable: (rows: number, columns: number) => void;
  onInsertImage: () => void;
  onInsertPageBreak: () => void;
  onInsertSectionBreakNextPage: () => void;
  onInsertSectionBreakContinuous: () => void;
  onInsertTOC: () => void;
  onApplyWatermark: (watermark: Watermark | null) => void;
  currentWatermark?: Watermark | undefined;
}

/** Insert ▾ — table (grid picker), image, breaks, and table of contents. */
export function InsertMenu({
  onInsertTable,
  onInsertImage,
  onInsertPageBreak,
  onInsertSectionBreakNextPage,
  onInsertSectionBreakContinuous,
  onInsertTOC,
  onApplyWatermark,
  currentWatermark,
}: InsertMenuProps) {
  // Controlled so the custom table grid (not a menu item) can close the menu.
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const presets = WATERMARK_PRESETS;
  const watermarkValue = currentWatermark?.kind === 'text' ? currentWatermark.text : 'none';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" tooltip="Insert" onMouseDown={keepFocus}>
          <Plus />
          <span className="hidden @min-[940px]:inline">Insert</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className='w-48'>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Table2 className="size-4" /> Table
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="p-2">
            <TableGrid
              onPick={(rows, cols) => {
                onInsertTable(rows, cols);
                close();
              }}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={onInsertImage}>
          <Image className="size-4" /> Image
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onInsertPageBreak}>
          <SeparatorHorizontal className="size-4" /> Page break
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onInsertSectionBreakNextPage}>
          <SeparatorHorizontal className="size-4" /> Section break (next page)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onInsertSectionBreakContinuous}>
          <Rows2 className="size-4" /> Section break (continuous)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onInsertTOC}>
          <ListTree className="size-4" /> Table of contents
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Stamp className="size-4" /> Watermark
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={watermarkValue}
              onValueChange={(v) => {
                onApplyWatermark(v === 'none' ? null : textWatermark(v));
                close();
              }}
            >
              <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
              {presets.map((p) => (
                <DropdownMenuRadioItem key={p} value={p}>
                  {p}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
