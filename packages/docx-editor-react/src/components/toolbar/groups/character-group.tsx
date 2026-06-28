import {
  type FontOption,
  normalizeFontFamilies,
} from '@eigenpal/docx-editor-core/utils/fontOptions';
import type { Style } from '@eigenpal/docx-editor-core/types/document';
import { halfPointsToPoints } from '@eigenpal/docx-editor-core/utils/units';
import { Button } from '@patrick/ui/components/button';
import { NumberField } from '@patrick/ui/components/number-field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@patrick/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@patrick/ui/components/select';
import { Separator } from '@patrick/ui/components/separator';
import { Toggle } from '@patrick/ui/components/toggle';
import {
  Baseline,
  Bold,
  ChevronDown,
  Highlighter,
  Italic,
  Link2,
  RemoveFormatting,
  type LucideIcon,
  Strikethrough,
  Subscript,
  Superscript,
  Type,
  Underline,
} from 'lucide-react';
import { useMemo } from 'react';
import type { FormattingAction, SelectionFormatting } from '../../Toolbar';
import { ColorControl } from '../color-control';
import { TOGGLE_ACTIVE, keepFocus } from '../shared';
import { StyleMenu } from './style-menu';

// Grayscale + Office standard colours (hex without #).
const TEXT_SWATCHES = [
  '000000', '434343', '666666', '999999', 'B7B7B7', 'CCCCCC', 'D9D9D9', 'EFEFEF', 'F3F3F3', 'FFFFFF',
  'C00000', 'FF0000', 'FFC000', 'FFFF00', '92D050', '00B050', '00B0F0', '0070C0', '002060', '7030A0',
] as const;
// Word's named highlight palette (each maps to an OOXML highlight name).
const HIGHLIGHT_SWATCHES = [
  'FFFF00', '00FF00', '00FFFF', 'FF00FF', '0000FF', 'FF0000', '000080', '008080', '008000', '800080',
  '800000', '808000', '808080', 'C0C0C0',
] as const;

const DEFAULT_FONTS: FontOption[] = [
  { name: 'Arial', fontFamily: 'Arial', category: 'sans-serif' },
  { name: 'Calibri', fontFamily: 'Calibri', category: 'sans-serif' },
  { name: 'Helvetica', fontFamily: 'Helvetica', category: 'sans-serif' },
  { name: 'Verdana', fontFamily: 'Verdana', category: 'sans-serif' },
  { name: 'Roboto', fontFamily: 'Roboto', category: 'sans-serif' },
  { name: 'Times New Roman', fontFamily: 'Times New Roman', category: 'serif' },
  { name: 'Georgia', fontFamily: 'Georgia', category: 'serif' },
  { name: 'Cambria', fontFamily: 'Cambria', category: 'serif' },
  { name: 'Garamond', fontFamily: 'Garamond', category: 'serif' },
  { name: 'Courier New', fontFamily: 'Courier New', category: 'monospace' },
  { name: 'Consolas', fontFamily: 'Consolas', category: 'monospace' },
];

const CATEGORY_LABEL: Record<NonNullable<FontOption['category']>, string> = {
  'sans-serif': 'Sans serif',
  serif: 'Serif',
  monospace: 'Monospace',
  other: 'Other',
};
const CATEGORY_ORDER: NonNullable<FontOption['category']>[] = ['sans-serif', 'serif', 'monospace', 'other'];

export interface CharacterGroupProps {
  currentFormatting: SelectionFormatting;
  onFormat: (action: FormattingAction) => void;
  documentFonts?: readonly FontOption[] | undefined;
  fontFamilies?: ReadonlyArray<string | FontOption> | undefined;
  documentStyles?: Style[] | undefined;
}

/**
 * Character-scope controls (incl. the paragraph Style picker, grouped with the
 * typography). B/I/U/S stay inline (top of the priority order). The rest fold
 * separately as the toolbar narrows (container queries): the least-used extras
 * (super/sub, colour, highlight, link, clear) first → `Aa ▾`, then style + font +
 * size into a popover. The popovers double as the apply-beforehand surface;
 * control elements are shared between the inline strip and the popovers.
 */
export function CharacterGroup({
  currentFormatting,
  onFormat,
  documentFonts,
  fontFamilies,
  documentStyles,
}: CharacterGroupProps) {
  const currentFont = currentFormatting.fontFamily || 'Arial';
  const sizePt =
    currentFormatting.fontSize !== undefined ? halfPointsToPoints(currentFormatting.fontSize) : 11;

  const groups = useMemo(() => {
    const propFonts = normalizeFontFamilies(fontFamilies) ?? [];
    const seen = new Set<string>();
    const document: FontOption[] = [];
    for (const f of [...(documentFonts ?? []), ...propFonts]) {
      if (seen.has(f.fontFamily)) continue;
      seen.add(f.fontFamily);
      document.push(f);
    }
    const byCategory = new Map<NonNullable<FontOption['category']>, FontOption[]>();
    for (const f of DEFAULT_FONTS) {
      if (seen.has(f.fontFamily)) continue;
      const cat = f.category ?? 'other';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)?.push(f);
      seen.add(f.fontFamily);
    }
    if (!seen.has(currentFont)) {
      document.unshift({ name: currentFont, fontFamily: currentFont, category: 'other' });
    }
    const result: { label: string; fonts: FontOption[] }[] = [];
    if (document.length) result.push({ label: 'Document', fonts: document });
    for (const cat of CATEGORY_ORDER) {
      const fonts = byCategory.get(cat);
      if (fonts?.length) result.push({ label: CATEGORY_LABEL[cat], fonts });
    }
    return result;
  }, [documentFonts, fontFamilies, currentFont]);

  const fmtToggle = (label: string, Icon: LucideIcon, on: boolean, action: FormattingAction) => (
    <Toggle
      size="icon-sm"
      className={TOGGLE_ACTIVE}
      tooltip={label}
      pressed={on}
      onMouseDown={keepFocus}
      onPressedChange={() => onFormat(action)}
    >
      <Icon />
    </Toggle>
  );

  // Shared control elements — placed in the inline strip AND the popovers.
  const styleMenu = (
    <StyleMenu currentFormatting={currentFormatting} onFormat={onFormat} documentStyles={documentStyles} />
  );
  const fontSelect = (
    <Select value={currentFont} onValueChange={(v) => onFormat({ type: 'fontFamily', value: v })}>
      <SelectTrigger size="sm" className="h-7 w-[7.5rem] text-xs" aria-label="Font" onMouseDown={keepFocus}>
        <SelectValue placeholder="Font" />
      </SelectTrigger>
      <SelectContent>
        {groups.map((g) => (
          <SelectGroup key={g.label}>
            <SelectLabel>{g.label}</SelectLabel>
            {g.fonts.map((f) => (
              <SelectItem key={f.fontFamily} value={f.fontFamily} style={{ fontFamily: f.fontFamily }}>
                {f.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
  const sizeField = (
    <NumberField
      value={sizePt}
      onValueChange={(pt) => onFormat({ type: 'fontSize', value: pt })}
      min={1}
      max={400}
      className="w-14"
      aria-label="Font size"
    />
  );
  const superSub = (
    <>
      {fmtToggle('Superscript', Superscript, !!currentFormatting.superscript, 'superscript')}
      {fmtToggle('Subscript', Subscript, !!currentFormatting.subscript, 'subscript')}
    </>
  );
  const colorCtrl = (
    <ColorControl
      icon={Baseline}
      tooltip="Text colour"
      currentColor={currentFormatting.color}
      swatches={TEXT_SWATCHES}
      clearLabel="Automatic"
      onPick={(hex) => onFormat({ type: 'textColor', value: `#${hex}` })}
      onClear={() => onFormat({ type: 'textColor', value: { auto: true } })}
    />
  );
  const highlightCtrl = (
    <ColorControl
      icon={Highlighter}
      tooltip="Highlight"
      currentColor={currentFormatting.highlight}
      swatches={HIGHLIGHT_SWATCHES}
      clearLabel="No highlight"
      onPick={(hex) => onFormat({ type: 'highlightColor', value: hex })}
      onClear={() => onFormat({ type: 'highlightColor', value: 'none' })}
    />
  );
  const linkBtn = (
    <Button variant="ghost" size="icon-sm" tooltip="Insert link" onMouseDown={keepFocus} onClick={() => onFormat('insertLink')}>
      <Link2 />
    </Button>
  );
  const clearBtn = (
    <Button variant="ghost" size="icon-sm" tooltip="Clear formatting" onMouseDown={keepFocus} onClick={() => onFormat('clearFormatting')}>
      <RemoveFormatting />
    </Button>
  );

  return (
    <div className="flex items-center gap-1">
      {/* Typography (style, font, size): inline when wide → fold together into a
          popover below ~900px container. (Literal breakpoint classes so Tailwind
          generates them; absolute px — revisit in rem if UI-scale ≠ 100%.) */}
      <div className="hidden items-center gap-1 @min-[900px]:flex">
        {styleMenu}
        {fontSelect}
        {sizeField}
      </div>
      <div className="@min-[900px]:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" tooltip="Style, font & size" onMouseDown={keepFocus}>
              <Type />
              <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto flex-row items-center gap-2">
            {styleMenu}
            {fontSelect}
            {sizeField}
          </PopoverContent>
        </Popover>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* B/I/U/S — always inline */}
      <div className="flex items-center gap-0.5">
        {fmtToggle('Bold', Bold, !!currentFormatting.bold, 'bold')}
        {fmtToggle('Italic', Italic, !!currentFormatting.italic, 'italic')}
        {fmtToggle('Underline', Underline, !!currentFormatting.underline, 'underline')}
        {fmtToggle('Strikethrough', Strikethrough, !!currentFormatting.strike, 'strikethrough')}
      </div>

      {/* Extras (super/sub, colour, highlight, link, clear): the least-used
          character controls — fold first, into Aa▾ below ~1000px. */}
      <div className="hidden items-center gap-0.5 @min-[1000px]:flex">
        {superSub}
        {colorCtrl}
        {highlightCtrl}
        {linkBtn}
        {clearBtn}
      </div>
      <div className="@min-[1000px]:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" tooltip="Text formatting" onMouseDown={keepFocus}>
              <span className="font-medium">Aa</span>
              <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto flex-row items-center gap-0.5">
            {superSub}
            <Separator orientation="vertical" className="mx-0.5 h-5" />
            {colorCtrl}
            {highlightCtrl}
            {linkBtn}
            <Separator orientation="vertical" className="mx-0.5 h-5" />
            {clearBtn}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
