/**
 * Alignment Dropdown Component (Google Docs style)
 *
 * A single dropdown button for paragraph alignment controls:
 * - Shows current alignment icon + chevron
 * - Opens a floating panel with Left, Center, Right, Justify options
 * - Active option is highlighted
 */

import React, { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { ParagraphAlignment } from '@eigenpal/docx-editor-core/types/document';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@patrick/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@patrick/ui/components/popover';
import { ToggleGroup, ToggleGroupItem } from '@patrick/ui/components/toggle-group';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '@eigenpal/docx-editor-i18n';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Alignment option for the buttons
 */
export interface AlignmentOption {
  /** Alignment value */
  value: ParagraphAlignment;
  /** Display label */
  label: string;
  /** Icon to display */
  icon: ReactNode;
  /** lucide icon component */
  iconName: LucideIcon;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Translation key for label */
  labelKey: TranslationKey;
  /** Translation key for shortcut */
  shortcutKey?: TranslationKey;
}

/**
 * Props for the AlignmentButtons component
 */
export interface AlignmentButtonsProps {
  /** Current alignment value */
  value?: ParagraphAlignment;
  /** Callback when alignment is changed */
  onChange?: (alignment: ParagraphAlignment) => void;
  /** Whether the buttons are disabled */
  disabled?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
  /** Show labels next to icons */
  showLabels?: boolean;
  /** Compact mode (smaller buttons) */
  compact?: boolean;
  /** Return focus to the editor after the popover closes */
  onRefocusEditor?: () => void;
}

/**
 * Props for individual alignment button
 */
export interface AlignmentButtonProps {
  /** Whether the button is active/selected */
  active?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button title/tooltip */
  title?: string;
  /** Click handler */
  onClick?: () => void;
  /** Button content */
  children: ReactNode;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
}

// ============================================================================
// ICON SIZE CONSTANT
// ============================================================================

const ICON_SIZE = 20;

// ============================================================================
// ALIGNMENT OPTIONS
// ============================================================================

const ALIGNMENT_OPTIONS: AlignmentOption[] = [
  {
    value: 'left',
    label: 'Align Left',
    labelKey: 'alignment.alignLeft',
    shortcutKey: 'alignment.alignLeftShortcut',
    icon: <AlignLeft size={ICON_SIZE} />,
    iconName: AlignLeft,
    shortcut: 'Ctrl+L',
  },
  {
    value: 'center',
    label: 'Center',
    labelKey: 'alignment.center',
    shortcutKey: 'alignment.centerShortcut',
    icon: <AlignCenter size={ICON_SIZE} />,
    iconName: AlignCenter,
    shortcut: 'Ctrl+E',
  },
  {
    value: 'right',
    label: 'Align Right',
    labelKey: 'alignment.alignRight',
    shortcutKey: 'alignment.alignRightShortcut',
    icon: <AlignRight size={ICON_SIZE} />,
    iconName: AlignRight,
    shortcut: 'Ctrl+R',
  },
  {
    value: 'both',
    label: 'Justify',
    labelKey: 'alignment.justify',
    shortcutKey: 'alignment.justifyShortcut',
    icon: <AlignJustify size={ICON_SIZE} />,
    iconName: AlignJustify,
    shortcut: 'Ctrl+J',
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Alignment dropdown — one toolbar button (current alignment + chevron) that
 * opens a popover with a single-select ToggleGroup of the four alignments.
 */
export function AlignmentButtons({
  value = 'left',
  onChange,
  disabled = false,
  onRefocusEditor,
}: AlignmentButtonsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const currentOption =
    ALIGNMENT_OPTIONS.find((opt) => opt.value === value) || ALIGNMENT_OPTIONS[0];
  const currentLabel = t(currentOption.labelKey);
  const currentShortcut = currentOption.shortcutKey ? t(currentOption.shortcutKey) : undefined;
  const ariaText = `${currentLabel}${currentShortcut ? ` (${currentShortcut})` : ''}`;
  const CurrentIcon = currentOption.iconName;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          tooltip={ariaText}
          aria-label={ariaText}
          data-testid="toolbar-alignment"
          className="text-muted-foreground"
        >
          <CurrentIcon size={ICON_SIZE} />
          <ChevronDown size={14} className="-ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-1"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onRefocusEditor?.();
        }}
      >
        <ToggleGroup
          type="single"
          value={value}
          onValueChange={(v) => {
            if (v) {
              onChange?.(v as ParagraphAlignment);
              setOpen(false);
            }
          }}
        >
          {ALIGNMENT_OPTIONS.map((option) => {
            const OptIcon = option.iconName;
            const optLabel = t(option.labelKey);
            const optShortcut = option.shortcutKey ? t(option.shortcutKey) : undefined;
            return (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                size="sm"
                aria-label={optLabel}
                title={`${optLabel}${optShortcut ? ` (${optShortcut})` : ''}`}
                data-testid={`alignment-${option.value}`}
              >
                <OptIcon size={18} />
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get default alignment options
 */
export function getAlignmentOptions(): AlignmentOption[] {
  return [...ALIGNMENT_OPTIONS];
}

/**
 * Check if an alignment value is valid
 */
export function isValidAlignment(value: string): value is ParagraphAlignment {
  return ['left', 'center', 'right', 'both', 'distribute'].includes(value);
}

/**
 * Get alignment label from value
 */
export function getAlignmentLabel(value: ParagraphAlignment): string {
  const option = ALIGNMENT_OPTIONS.find((opt) => opt.value === value);
  return option?.label || 'Left';
}

/**
 * Get alignment icon from value
 */
export function getAlignmentIcon(value: ParagraphAlignment): ReactNode {
  const option = ALIGNMENT_OPTIONS.find((opt) => opt.value === value);
  return option?.icon || <AlignLeft size={ICON_SIZE} />;
}

/**
 * Get alignment shortcut from value
 */
export function getAlignmentShortcut(value: ParagraphAlignment): string | undefined {
  const option = ALIGNMENT_OPTIONS.find((opt) => opt.value === value);
  return option?.shortcut;
}

/**
 * Get CSS text-align value from OOXML alignment
 */
export function alignmentToCss(alignment: ParagraphAlignment): string {
  switch (alignment) {
    case 'left':
      return 'left';
    case 'center':
      return 'center';
    case 'right':
      return 'right';
    case 'both':
    case 'distribute':
      return 'justify';
    default:
      return 'left';
  }
}

/**
 * Get OOXML alignment value from CSS text-align
 */
export function cssToAlignment(textAlign: string): ParagraphAlignment {
  switch (textAlign) {
    case 'left':
    case 'start':
      return 'left';
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    case 'justify':
      return 'both';
    default:
      return 'left';
  }
}

/**
 * Cycle to next alignment (left -> center -> right -> justify -> left)
 */
export function cycleAlignment(current: ParagraphAlignment): ParagraphAlignment {
  const order: ParagraphAlignment[] = ['left', 'center', 'right', 'both'];
  const currentIndex = order.indexOf(current);
  const nextIndex = (currentIndex + 1) % order.length;
  return order[nextIndex];
}

/**
 * Handle keyboard shortcut for alignment
 * Returns the alignment if matched, undefined otherwise
 */
export function handleAlignmentShortcut(
  event: KeyboardEvent | React.KeyboardEvent
): ParagraphAlignment | undefined {
  if (!event.ctrlKey && !event.metaKey) {
    return undefined;
  }

  const key = event.key.toLowerCase();

  switch (key) {
    case 'l':
      return 'left';
    case 'e':
      return 'center';
    case 'r':
      return 'right';
    case 'j':
      return 'both';
    default:
      return undefined;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AlignmentButtons;
