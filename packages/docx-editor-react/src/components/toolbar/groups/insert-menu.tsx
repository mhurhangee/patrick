import { Button } from '@patrick/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Table2,
} from 'lucide-react';
import { useState } from 'react';
import { keepFocus } from '../shared';
import { TableGrid } from './table-grid';

export interface InsertMenuProps {
  onInsertTable: (rows: number, columns: number) => void;
  onInsertImage: () => void;
  onInsertPageBreak: () => void;
  onInsertSectionBreakNextPage: () => void;
  onInsertSectionBreakContinuous: () => void;
  onInsertTOC: () => void;
}

/** Insert ▾ — table (grid picker), image, breaks, and table of contents. */
export function InsertMenu({
  onInsertTable,
  onInsertImage,
  onInsertPageBreak,
  onInsertSectionBreakNextPage,
  onInsertSectionBreakContinuous,
  onInsertTOC,
}: InsertMenuProps) {
  // Controlled so the custom table grid (not a menu item) can close the menu.
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" tooltip="Insert" onMouseDown={keepFocus}>
          <Plus />
          <span className="hidden @md:inline">Insert</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
