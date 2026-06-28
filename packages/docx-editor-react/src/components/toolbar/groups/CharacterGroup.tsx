import { halfPointsToPoints } from '@eigenpal/docx-editor-core/utils/units';
import { Button } from '@patrick/ui/components/button';
import { NumberField } from '@patrick/ui/components/number-field';
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
  Highlighter,
  Italic,
  Link2,
  RemoveFormatting,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  type FontOption,
  normalizeFontFamilies,
} from '@eigenpal/docx-editor-core/utils/fontOptions';
import type { FormattingAction, SelectionFormatting } from '../../Toolbar';
import { ColorControl } from '../ColorControl';
import { TOGGLE_ACTIVE, keepFocus } from '../shared';

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
const CATEGORY_ORDER: NonNullable<FontOption['category']>[] = [
  'sans-serif',
  'serif',
  'monospace',
  'other',
];

export interface CharacterGroupProps {
  currentFormatting: SelectionFormatting;
  onFormat: (action: FormattingAction) => void;
  documentFonts?: readonly FontOption[] | undefined;
  fontFamilies?: ReadonlyArray<string | FontOption> | undefined;
}

/**
 * Character-scope controls: font family + size, the B/I/U/S toggles, super/sub,
 * and clear formatting. Colour / highlight / link land in P2c (and the whole
 * group collapses into an `Aa ▾` popover at narrow widths then).
 */
export function CharacterGroup({
  currentFormatting,
  onFormat,
  documentFonts,
  fontFamilies,
}: CharacterGroupProps) {
  const currentFont = currentFormatting.fontFamily || 'Arial';
  const sizePt =
    currentFormatting.fontSize !== undefined ? halfPointsToPoints(currentFormatting.fontSize) : 11;

  // Document fonts first, then a curated default set; deduped by name, with the
  // current selection guaranteed present so the Select can show it.
  const groups = useMemo(() => {
    const docFonts = (documentFonts ?? []).map((f) => ({ ...f }));
    const propFonts = normalizeFontFamilies(fontFamilies) ?? [];
    const seen = new Set<string>();
    const document: FontOption[] = [];
    for (const f of [...docFonts, ...propFonts]) {
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

  return (
    <div className="flex items-center gap-1">
      <Select value={currentFont} onValueChange={(v) => onFormat({ type: 'fontFamily', value: v })}>
        <SelectTrigger
          size="sm"
          className="h-7 w-[7.5rem] text-xs"
          aria-label="Font"
          onMouseDown={keepFocus}
        >
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

      <NumberField
        value={sizePt}
        onValueChange={(pt) => onFormat({ type: 'fontSize', value: pt })}
        min={1}
        max={400}
        className="w-14"
        aria-label="Font size"
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <div className="flex items-center gap-0.5">
        <Toggle
          size="icon-sm"
          className={TOGGLE_ACTIVE}
          tooltip="Bold"
          pressed={!!currentFormatting.bold}
          onMouseDown={keepFocus}
          onPressedChange={() => onFormat('bold')}
        >
          <Bold />
        </Toggle>
        <Toggle
          size="icon-sm"
          className={TOGGLE_ACTIVE}
          tooltip="Italic"
          pressed={!!currentFormatting.italic}
          onMouseDown={keepFocus}
          onPressedChange={() => onFormat('italic')}
        >
          <Italic />
        </Toggle>
        <Toggle
          size="icon-sm"
          className={TOGGLE_ACTIVE}
          tooltip="Underline"
          pressed={!!currentFormatting.underline}
          onMouseDown={keepFocus}
          onPressedChange={() => onFormat('underline')}
        >
          <Underline />
        </Toggle>
        <Toggle
          size="icon-sm"
          className={TOGGLE_ACTIVE}
          tooltip="Strikethrough"
          pressed={!!currentFormatting.strike}
          onMouseDown={keepFocus}
          onPressedChange={() => onFormat('strikethrough')}
        >
          <Strikethrough />
        </Toggle>
        <Toggle
          size="icon-sm"
          className={TOGGLE_ACTIVE}
          tooltip="Superscript"
          pressed={!!currentFormatting.superscript}
          onMouseDown={keepFocus}
          onPressedChange={() => onFormat('superscript')}
        >
          <Superscript />
        </Toggle>
        <Toggle
          size="icon-sm"
          className={TOGGLE_ACTIVE}
          tooltip="Subscript"
          pressed={!!currentFormatting.subscript}
          onMouseDown={keepFocus}
          onPressedChange={() => onFormat('subscript')}
        >
          <Subscript />
        </Toggle>

        <ColorControl
          icon={Baseline}
          tooltip="Text colour"
          currentColor={currentFormatting.color}
          swatches={TEXT_SWATCHES}
          clearLabel="Automatic"
          onPick={(hex) => onFormat({ type: 'textColor', value: `#${hex}` })}
          onClear={() => onFormat({ type: 'textColor', value: { auto: true } })}
        />
        <ColorControl
          icon={Highlighter}
          tooltip="Highlight"
          currentColor={currentFormatting.highlight}
          swatches={HIGHLIGHT_SWATCHES}
          clearLabel="No highlight"
          onPick={(hex) => onFormat({ type: 'highlightColor', value: hex })}
          onClear={() => onFormat({ type: 'highlightColor', value: 'none' })}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip="Insert link"
          onMouseDown={keepFocus}
          onClick={() => onFormat('insertLink')}
        >
          <Link2 />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          tooltip="Clear formatting"
          onMouseDown={keepFocus}
          onClick={() => onFormat('clearFormatting')}
        >
          <RemoveFormatting />
        </Button>
      </div>
    </div>
  );
}
