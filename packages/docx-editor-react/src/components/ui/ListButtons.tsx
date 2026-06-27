/**
 * List controls — one toolbar button that opens a popover with bullet/numbered
 * toggles and indent/outdent actions. Slims the four-button inline group down to
 * a single dropdown.
 */

import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import type { NumberFormat } from '@eigenpal/docx-editor-core/types/document';
import { ChevronDown, IndentDecrease, IndentIncrease, List, ListOrdered } from 'lucide-react';
import { Button } from '@patrick/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@patrick/ui/components/popover';
import { Toggle } from '@patrick/ui/components/toggle';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../i18n';

// ============================================================================
// TYPES
// ============================================================================

// List-state types live in core; re-exported here for backwards compat.
export type { ListType, ListState } from '@eigenpal/docx-editor-core/utils/listState';
import type { ListState } from '@eigenpal/docx-editor-core/utils/listState';

/**
 * Props for the ListButtons component
 */
export interface ListButtonsProps {
  /** Current list state of the selection */
  listState?: ListState;
  /** Callback when bullet list is toggled */
  onBulletList?: () => void;
  /** Callback when numbered list is toggled */
  onNumberedList?: () => void;
  /** Callback to increase list indent */
  onIndent?: () => void;
  /** Callback to decrease list indent */
  onOutdent?: () => void;
  /** Whether the buttons are disabled */
  disabled?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
  /** Show indent/outdent buttons */
  showIndentButtons?: boolean;
  /** Compact mode (smaller buttons) */
  compact?: boolean;
  /** Whether the current paragraph has left indentation (for enabling outdent) */
  hasIndent?: boolean;
  /** Return focus to the editor after the popover closes */
  onRefocusEditor?: () => void;
}

const ICON_SIZE = 18;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * List dropdown — one button (current list type + chevron) opening a popover
 * with bullet/numbered toggles and indent/outdent.
 */
export function ListButtons({
  listState,
  onBulletList,
  onNumberedList,
  onIndent,
  onOutdent,
  disabled = false,
  showIndentButtons = true,
  hasIndent = false,
  onRefocusEditor,
}: ListButtonsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const isBulletList = listState?.type === 'bullet';
  const isNumberedList = listState?.type === 'numbered';
  const isInList = listState?.isInList || isBulletList || isNumberedList;
  // Can outdent if: in a list with level > 0, OR has paragraph indentation
  const canOutdent = (isInList && (listState?.level ?? 0) > 0) || hasIndent;

  const TriggerIcon = isNumberedList ? ListOrdered : List;
  const triggerLabel = t('lists.ariaLabel');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          tooltip={triggerLabel}
          aria-label={triggerLabel}
          data-testid="toolbar-lists"
          className={cn('text-muted-foreground', isInList && 'text-foreground')}
        >
          <TriggerIcon size={ICON_SIZE} />
          <ChevronDown size={14} className="-ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-auto items-center gap-1 p-1"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onRefocusEditor?.();
        }}
      >
        <Toggle
          size="sm"
          pressed={isBulletList}
          onPressedChange={() => onBulletList?.()}
          aria-label={t('lists.bulletList')}
          title={t('lists.bulletList')}
          data-testid="list-bullet"
        >
          <List size={ICON_SIZE} />
        </Toggle>
        <Toggle
          size="sm"
          pressed={isNumberedList}
          onPressedChange={() => onNumberedList?.()}
          aria-label={t('lists.numberedList')}
          title={t('lists.numberedList')}
          data-testid="list-numbered"
        >
          <ListOrdered size={ICON_SIZE} />
        </Toggle>
        {showIndentButtons && (
          <>
            <div className="mx-0.5 h-5 w-px bg-border" role="separator" />
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!canOutdent}
              onClick={() => onOutdent?.()}
              tooltip={t('lists.decreaseIndent')}
              aria-label={t('lists.decreaseIndent')}
            >
              <IndentDecrease size={ICON_SIZE} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onIndent?.()}
              tooltip={t('lists.increaseIndent')}
              aria-label={t('lists.increaseIndent')}
            >
              <IndentIncrease size={ICON_SIZE} />
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Pure list-state helpers live in core; re-exported here so the
// existing import surface keeps working.
export {
  createDefaultListState,
  createBulletListState,
  createNumberedListState,
  isBulletListState,
  isNumberedListState,
  isAnyListState,
  getNextIndentLevel,
  getPreviousIndentLevel,
  toggleListType,
} from '@eigenpal/docx-editor-core/utils/listState';

/**
 * Get CSS for list indent
 */
export function getListIndentCss(level: number): CSSProperties {
  const baseIndent = 36; // ~0.5 inch per level
  return {
    marginLeft: `${baseIndent * (level + 1)}px`,
    textIndent: `-${baseIndent * 0.5}px`,
  };
}

/**
 * Get default bullet character for a level
 */
export function getDefaultBulletForLevel(level: number): string {
  const bullets = ['•', '○', '▪', '•', '○', '▪', '•', '○', '▪'];
  return bullets[level % bullets.length];
}

/**
 * Get default number format for a level
 */
export function getDefaultNumberFormatForLevel(level: number): NumberFormat {
  const formats: NumberFormat[] = [
    'decimal',
    'lowerLetter',
    'lowerRoman',
    'decimal',
    'lowerLetter',
    'lowerRoman',
    'decimal',
    'lowerLetter',
    'lowerRoman',
  ];
  return formats[level % formats.length];
}

/**
 * Handle keyboard shortcut for list operations
 * Returns the action to perform, or undefined if no match
 */
export function handleListShortcut(
  event: KeyboardEvent | React.KeyboardEvent
): 'bullet' | 'numbered' | 'indent' | 'outdent' | undefined {
  // Tab for indent, Shift+Tab for outdent
  if (event.key === 'Tab') {
    if (event.shiftKey) {
      return 'outdent';
    }
    return 'indent';
  }

  // Check for Ctrl/Cmd shortcuts (not commonly used for lists, but some editors support them)
  if (event.ctrlKey || event.metaKey) {
    if (event.shiftKey && event.key.toLowerCase() === 'l') {
      return 'bullet';
    }
    // Note: Ctrl+Shift+L is often bullet in Word-like editors
  }

  return undefined;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ListButtons;
