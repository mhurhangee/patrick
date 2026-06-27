/**
 * TableInsertButtons - 4 icon buttons for row/column insertion
 *
 * Insert row above, insert row below, insert column left, insert column right.
 */

import React, { useCallback } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import { Button } from './Button';
import { Tooltip } from './Tooltip';
import { cn } from '../../lib/utils';
import type { TableAction } from './TableToolbar';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '@eigenpal/docx-editor-i18n';

export interface TableInsertButtonsProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
}

const INSERT_ACTIONS: {
  action: TableAction;
  icon: LucideIcon;
  labelKey: TranslationKey;
  testId: string;
}[] = [
  {
    action: 'addRowAbove',
    icon: ChevronUp,
    labelKey: 'table.insertRowAbove',
    testId: 'toolbar-table-add-row-above',
  },
  {
    action: 'addRowBelow',
    icon: ChevronDown,
    labelKey: 'table.insertRowBelow',
    testId: 'toolbar-table-add-row-below',
  },
  {
    action: 'addColumnLeft',
    icon: ChevronLeft,
    labelKey: 'table.insertColumnLeft',
    testId: 'toolbar-table-add-col-left',
  },
  {
    action: 'addColumnRight',
    icon: ChevronRight,
    labelKey: 'table.insertColumnRight',
    testId: 'toolbar-table-add-col-right',
  },
];

export function TableInsertButtons({ onAction, disabled = false }: TableInsertButtonsProps) {
  const { t } = useTranslation();
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <>
      {INSERT_ACTIONS.map(({ action, icon: Icon, labelKey, testId }) => {
        const label = t(labelKey);
        return (
          <Tooltip key={typeof action === 'string' ? action : action.type} content={label}>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                'text-muted-foreground hover:text-foreground hover:bg-muted/80',
                disabled && 'opacity-30 cursor-not-allowed'
              )}
              onMouseDown={handleMouseDown}
              onClick={() => !disabled && onAction(action)}
              disabled={disabled}
              aria-label={label}
              data-testid={testId}
            >
              <Icon size={20} />
            </Button>
          </Tooltip>
        );
      })}
    </>
  );
}

export default TableInsertButtons;
