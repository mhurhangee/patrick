import type { ParagraphAlignment } from '@eigenpal/docx-editor-core/types/document';
import { Button } from '@patrick/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@patrick/ui/components/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@patrick/ui/components/popover';
import { Separator } from '@patrick/ui/components/separator';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalSpaceAround,
  ChevronDown,
  IndentDecrease,
  IndentIncrease,
  List,
  ListOrdered,
  Pilcrow,
} from 'lucide-react';
import type { FormattingAction, SelectionFormatting } from '../../Toolbar';
import { keepFocus } from '../shared';

const ALIGN_OPTIONS: { value: ParagraphAlignment; label: string; icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'Left', icon: AlignLeft },
  { value: 'center', label: 'Center', icon: AlignCenter },
  { value: 'right', label: 'Right', icon: AlignRight },
  { value: 'both', label: 'Justify', icon: AlignJustify },
];

// twips: 240 = single line spacing.
const SPACING_OPTIONS: { label: string; twips: number }[] = [
  { label: 'Single', twips: 240 },
  { label: '1.15', twips: 276 },
  { label: '1.5', twips: 360 },
  { label: 'Double', twips: 480 },
];

export interface ParagraphGroupProps {
  currentFormatting: SelectionFormatting;
  onFormat: (action: FormattingAction) => void;
}

/**
 * Paragraph-scope controls — list, indent, alignment, line spacing, each a
 * single-button dropdown (uniform with one another). Inline when wide; the whole
 * group folds into a `¶ ▾` popover below ~780px of toolbar width.
 */
export function ParagraphGroup({ currentFormatting, onFormat }: ParagraphGroupProps) {
  const listType = currentFormatting.listState?.type;
  const listValue = listType === 'bullet' ? 'bullet' : listType === 'numbered' ? 'numbered' : 'none';
  const ListIcon = listType === 'numbered' ? ListOrdered : List;
  const alignValue = currentFormatting.alignment ?? 'left';
  const AlignIcon = (ALIGN_OPTIONS.find((o) => o.value === alignValue) ?? ALIGN_OPTIONS[0]).icon;
  const canOutdent = (currentFormatting.indentLeft ?? 0) > 0 || Boolean(currentFormatting.listState);
  const spacingTwips = currentFormatting.lineSpacing ?? 240;

  // The list actions are toggles; map a radio choice to the right toggle.
  const setList = (v: string) => {
    if (v === listValue) return;
    if (v === 'bullet') onFormat('bulletList');
    else if (v === 'numbered') onFormat('numberedList');
    else if (listValue === 'bullet') onFormat('bulletList');
    else if (listValue === 'numbered') onFormat('numberedList');
  };

  const listMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" tooltip="List" onMouseDown={keepFocus}>
          <ListIcon />
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={listValue} onValueChange={setList}>
          <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="bullet">
            <List className="size-4" /> Bulleted
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="numbered">
            <ListOrdered className="size-4" /> Numbered
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const indent = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        tooltip="Decrease indent"
        disabled={!canOutdent}
        onMouseDown={keepFocus}
        onClick={() => onFormat('outdent')}
      >
        <IndentDecrease />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        tooltip="Increase indent"
        onMouseDown={keepFocus}
        onClick={() => onFormat('indent')}
      >
        <IndentIncrease />
      </Button>
    </>
  );
  const alignMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" tooltip="Alignment" onMouseDown={keepFocus}>
          <AlignIcon />
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={alignValue}
          onValueChange={(v) => onFormat({ type: 'alignment', value: v as ParagraphAlignment })}
        >
          {ALIGN_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              <o.icon className="size-4" />
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const spacingMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" tooltip="Line spacing" onMouseDown={keepFocus}>
          <AlignVerticalSpaceAround />
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={String(spacingTwips)}
          onValueChange={(v) => onFormat({ type: 'lineSpacing', value: Number(v) })}
        >
          {SPACING_OPTIONS.map((s) => (
            <DropdownMenuRadioItem key={s.twips} value={String(s.twips)}>
              {s.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const inline = (
    <>
      {listMenu}
      {indent}
      <Separator orientation="vertical" className="mx-1 h-5" />
      {alignMenu}
      {spacingMenu}
    </>
  );

  return (
    <>
      <div className="hidden items-center gap-0.5 @min-[780px]:flex">{inline}</div>
      <div className="@min-[780px]:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" tooltip="Paragraph" onMouseDown={keepFocus}>
              <Pilcrow />
              <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto flex-row items-center gap-0.5">
            {inline}
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
