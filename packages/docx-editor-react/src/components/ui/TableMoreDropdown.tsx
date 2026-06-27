/**
 * TableMoreDropdown - Compact dropdown for less-used table actions
 *
 * Contains: delete row/column/table, vertical alignment, header row,
 * distribute columns, auto-fit, table alignment, cell margins,
 * text direction, no-wrap, row height, table properties.
 */

import { useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Button } from './Button';
import { Tooltip } from './Tooltip';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Columns3,
  EllipsisVertical,
  Grid3x3,
  MoveHorizontal,
  Plus,
  Rows3,
  Settings,
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
  WrapText,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { TableAction } from './TableToolbar';
import { useFixedDropdown } from '../../hooks/useFixedDropdown';
import { useTranslation } from '../../i18n';

export interface TableMoreDropdownProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
  tableContext?: {
    isInTable: boolean;
    rowCount?: number;
    columnCount?: number;
    canSplitCell?: boolean;
    hasMultiCellSelection?: boolean;
    table?: { attrs?: { justification?: string } };
  } | null;
}

const menuItemStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 14px',
  fontSize: 13,
  color: 'var(--doc-text)',
  cursor: 'pointer',
  border: 'none',
  backgroundColor: 'transparent',
  width: '100%',
  textAlign: 'left',
};

const separatorStyles: CSSProperties = {
  height: 1,
  backgroundColor: 'var(--doc-border)',
  margin: '4px 0',
};

const sectionLabelStyles: CSSProperties = {
  padding: '6px 14px 2px',
  fontSize: 11,
  color: 'var(--doc-text-muted)',
  fontWeight: 500,
};

export function TableMoreDropdown({
  onAction,
  disabled = false,
  tableContext,
}: TableMoreDropdownProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const close = useCallback(() => setIsOpen(false), []);
  const { containerRef, dropdownRef, dropdownStyle, handleMouseDown } = useFixedDropdown({
    isOpen,
    onClose: close,
    align: 'right',
  });
  const currentJustification =
    (tableContext?.table?.attrs?.justification as 'left' | 'center' | 'right' | null | undefined) ??
    'left';

  const handleAction = useCallback(
    (action: TableAction) => {
      onAction(action);
      setIsOpen(false);
    },
    [onAction]
  );

  const menuItem = (
    id: string,
    Icon: LucideIcon,
    label: string,
    action: TableAction,
    opts?: { danger?: boolean; itemDisabled?: boolean }
  ) => {
    const isItemDisabled = disabled || opts?.itemDisabled;
    return (
      <button
        key={id}
        type="button"
        role="menuitem"
        style={{
          ...menuItemStyles,
          backgroundColor:
            hoveredItem === id && !isItemDisabled ? 'var(--doc-bg-hover)' : 'transparent',
          color: isItemDisabled
            ? 'var(--doc-text-muted)'
            : opts?.danger
              ? 'var(--doc-error)'
              : 'var(--doc-text)',
          cursor: isItemDisabled ? 'not-allowed' : 'pointer',
        }}
        onClick={() => !isItemDisabled && handleAction(action)}
        onMouseEnter={() => setHoveredItem(id)}
        onMouseLeave={() => setHoveredItem(null)}
        disabled={isItemDisabled}
      >
        <Icon
          size={16}
          className={opts?.danger && !isItemDisabled ? 'text-destructive' : ''}
        />
        <span style={{ flex: 1 }}>{label}</span>
      </button>
    );
  };

  const button = (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn(
        'text-muted-foreground hover:text-foreground hover:bg-muted/80',
        isOpen && 'bg-muted',
        disabled && 'opacity-30 cursor-not-allowed'
      )}
      onMouseDown={handleMouseDown}
      onClick={() => !disabled && setIsOpen((prev) => !prev)}
      disabled={disabled}
      aria-label={t('table.moreOptions')}
      aria-expanded={isOpen}
      aria-haspopup="menu"
      data-testid="toolbar-table-more"
    >
      <EllipsisVertical size={20} />
    </Button>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {!isOpen ? <Tooltip content={t('table.moreOptions')}>{button}</Tooltip> : button}

      {isOpen && !disabled && (
        <div
          ref={dropdownRef}
          style={{
            ...dropdownStyle,
            backgroundColor: 'var(--doc-surface)',
            border: '1px solid var(--doc-border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px var(--doc-shadow)',
            padding: '4px 0',
            minWidth: 200,
            maxHeight: '70vh',
            overflowY: 'auto',
          }}
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Insert actions */}
          {menuItem('addRowAbove', Plus, t('table.insertRowAbove'), 'addRowAbove')}
          {menuItem('addRowBelow', Plus, t('table.insertRowBelow'), 'addRowBelow')}
          {menuItem('addColumnLeft', Plus, t('table.insertColumnLeft'), 'addColumnLeft')}
          {menuItem('addColumnRight', Plus, t('table.insertColumnRight'), 'addColumnRight')}

          <div style={separatorStyles} role="separator" />

          {/* Merge/Split */}
          {menuItem('mergeCells', TableCellsMerge, t('table.mergeCells'), 'mergeCells', {
            itemDisabled: !tableContext?.hasMultiCellSelection,
          })}
          {menuItem('splitCell', TableCellsSplit, t('table.splitCell'), 'splitCell', {
            itemDisabled: !tableContext?.canSplitCell,
          })}

          <div style={separatorStyles} role="separator" />

          {/* Select */}
          {menuItem('selectTable', Grid3x3, t('table.selectTable'), 'selectTable')}

          <div style={separatorStyles} role="separator" />

          {/* Delete actions */}
          {menuItem('deleteRow', Trash2, t('table.deleteRow'), 'deleteRow', {
            danger: true,
            itemDisabled: (tableContext?.rowCount ?? 0) <= 1,
          })}
          {menuItem('deleteColumn', Trash2, t('table.deleteColumn'), 'deleteColumn', {
            danger: true,
            itemDisabled: (tableContext?.columnCount ?? 0) <= 1,
          })}
          {menuItem('deleteTable', Trash2, t('table.deleteTable'), 'deleteTable', {
            danger: true,
          })}

          <div style={separatorStyles} role="separator" />

          {/* Vertical alignment */}
          <div style={sectionLabelStyles}>{t('tableAdvanced.verticalAlignment')}</div>
          <div style={{ display: 'flex', gap: 4, padding: '4px 14px' }}>
            {(['top', 'center', 'bottom'] as const).map((align) => {
              const icons: Record<'top' | 'center' | 'bottom', LucideIcon> = {
                top: AlignVerticalJustifyStart,
                center: AlignVerticalJustifyCenter,
                bottom: AlignVerticalJustifyEnd,
              };
              const Icon = icons[align];
              const labelKeys = {
                top: 'tableAdvanced.top' as const,
                center: 'tableAdvanced.middle' as const,
                bottom: 'tableAdvanced.bottom' as const,
              };
              return (
                <button
                  key={align}
                  type="button"
                  title={t(labelKeys[align])}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 28,
                    border: '1px solid var(--doc-border)',
                    borderRadius: 4,
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      'var(--doc-bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                  onClick={() => handleAction({ type: 'cellVerticalAlign', align })}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>

          <div style={separatorStyles} role="separator" />

          {/* Table alignment */}
          <div style={sectionLabelStyles}>{t('tableAdvanced.tableAlignment')}</div>
          <div style={{ display: 'flex', gap: 4, padding: '4px 14px' }}>
            {(['left', 'center', 'right'] as const).map((align) => {
              const icons: Record<'left' | 'center' | 'right', LucideIcon> = {
                left: AlignLeft,
                center: AlignCenter,
                right: AlignRight,
              };
              const Icon = icons[align];
              const isActive = currentJustification === align;
              return (
                <button
                  key={align}
                  type="button"
                  title={t(
                    {
                      left: 'tableAdvanced.alignTableLeft' as const,
                      center: 'tableAdvanced.alignTableCenter' as const,
                      right: 'tableAdvanced.alignTableRight' as const,
                    }[align]
                  )}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 28,
                    border: '1px solid var(--doc-border)',
                    borderRadius: 4,
                    backgroundColor: isActive ? 'var(--doc-primary-light)' : 'transparent',
                    borderColor: isActive ? 'var(--doc-primary)' : 'var(--doc-border)',
                    color: isActive ? 'var(--doc-primary)' : 'var(--doc-text)',
                    cursor: 'pointer',
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    handleAction({ type: 'tableProperties', props: { justification: align } })
                  }
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>

          <div style={separatorStyles} role="separator" />

          {/* Other options */}
          {menuItem('headerRow', Rows3, t('tableAdvanced.toggleHeaderRow'), {
            type: 'toggleHeaderRow',
          })}
          {menuItem('distribute', Columns3, t('tableAdvanced.distributeColumns'), {
            type: 'distributeColumns',
          })}
          {menuItem('autoFit', MoveHorizontal, t('tableAdvanced.autoFit'), {
            type: 'autoFitContents',
          })}
          {menuItem('noWrap', WrapText, t('tableAdvanced.toggleNoWrap'), {
            type: 'toggleNoWrap',
          })}

          <div style={separatorStyles} role="separator" />

          {menuItem('properties', Settings, t('tableAdvanced.tableProperties'), {
            type: 'openTableProperties',
          })}
        </div>
      )}
    </div>
  );
}

export default TableMoreDropdown;
