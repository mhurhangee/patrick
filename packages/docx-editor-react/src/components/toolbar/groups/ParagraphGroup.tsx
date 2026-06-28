import type { ParagraphAlignment } from '@eigenpal/docx-editor-core/types/document';
import { Button } from '@patrick/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@patrick/ui/components/dropdown-menu';
import { Separator } from '@patrick/ui/components/separator';
import { Toggle } from '@patrick/ui/components/toggle';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalSpaceAround,
  IndentDecrease,
  IndentIncrease,
  List,
  ListOrdered,
} from 'lucide-react';
import type { FormattingAction, SelectionFormatting } from '../../Toolbar';
import { TOGGLE_ACTIVE, keepFocus } from '../shared';

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
 * Paragraph-scope controls: lists + indent (prominent inline — heavily used for
 * claims), alignment (single-choice → a dropdown, collapsed by default), and
 * line spacing. Folds into a `¶ ▾` button at narrow widths in a later phase.
 */
export function ParagraphGroup({ currentFormatting, onFormat }: ParagraphGroupProps) {
  const listType = currentFormatting.listState?.type;
  const alignValue = currentFormatting.alignment ?? 'left';
  const currentAlign =
    ALIGN_OPTIONS.find((o) => o.value === alignValue) ?? ALIGN_OPTIONS[0];
  const AlignIcon = currentAlign.icon;
  const canOutdent = (currentFormatting.indentLeft ?? 0) > 0 || Boolean(currentFormatting.listState);
  const spacingTwips = currentFormatting.lineSpacing ?? 240;

  return (
    <div className="flex items-center gap-0.5">
      <Toggle
        size="icon-sm"
        className={TOGGLE_ACTIVE}
        tooltip="Bulleted list"
        pressed={listType === 'bullet'}
        onMouseDown={keepFocus}
        onPressedChange={() => onFormat('bulletList')}
      >
        <List />
      </Toggle>
      <Toggle
        size="icon-sm"
        className={TOGGLE_ACTIVE}
        tooltip="Numbered list"
        pressed={listType === 'numbered'}
        onMouseDown={keepFocus}
        onPressedChange={() => onFormat('numberedList')}
      >
        <ListOrdered />
      </Toggle>

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

      <Separator orientation="vertical" className="mx-1 h-5" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" tooltip="Alignment" onMouseDown={keepFocus}>
            <AlignIcon />
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" tooltip="Line spacing" onMouseDown={keepFocus}>
            <AlignVerticalSpaceAround />
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
    </div>
  );
}
