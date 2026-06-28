import type { TableContextInfo } from '@eigenpal/docx-editor-core/prosemirror';
import type { Style, Watermark } from '@eigenpal/docx-editor-core/types/document';
import type { FontOption } from '@eigenpal/docx-editor-core/utils/fontOptions';
import { Button } from '@patrick/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@patrick/ui/components/dropdown-menu';
import { Separator } from '@patrick/ui/components/separator';
import { Toggle } from '@patrick/ui/components/toggle';
import {
  ChevronDown,
  MessageSquareText,
  MoreVertical,
  Printer,
  Redo2,
  Settings,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from '../../i18n';
import { EDITING_MODES, type EditorMode } from '../DocxEditor/internals/editing-modes';
import type { FormattingAction, SelectionFormatting } from '../../types/formatting';
import type { ToolbarImageContext } from '../../types/image';
import type { TableAction } from '../../types/table';
import { FormatRow } from './format-row';
import { TOGGLE_ACTIVE, keepFocus } from './shared';

export interface DocxToolbarProps {
  // Hanging tab (app-level)
  renderTitleBarRight?: (() => ReactNode) | undefined;
  editingMode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  commentsActive: boolean;
  onToggleComments: () => void;
  // Main band
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPrint?: (() => void) | undefined;
  onPageSetup?: (() => void) | undefined;
  onApplyWatermark: (watermark: Watermark | null) => void;
  currentWatermark?: Watermark | undefined;
  watermarkPresets?: readonly string[] | undefined;
  readOnly?: boolean;
  currentFormatting: SelectionFormatting;
  onFormat: (action: FormattingAction) => void;
  documentFonts?: readonly FontOption[] | undefined;
  fontFamilies?: ReadonlyArray<string | FontOption> | undefined;
  documentStyles?: Style[] | undefined;
  onInsertTable: (rows: number, columns: number) => void;
  onInsertImage: () => void;
  onInsertPageBreak: () => void;
  onInsertSectionBreakNextPage: () => void;
  onInsertSectionBreakContinuous: () => void;
  onInsertTOC: () => void;
  tableContext?: TableContextInfo | null;
  onTableAction: (action: TableAction) => void;
  imageContext?: ToolbarImageContext | null;
  onImageWrapType: (wrapType: string) => void;
  onImageTransform: (action: 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV') => void;
  onOpenImageProperties: () => void;
}

/**
 * The editor toolbar. Built on @patrick/ui primitives; consumes the formatting
 * contract (`../../types/*`) so the editor "brain" is untouched.
 *
 * One **main band** (undo/redo · responsive format groups · overflow) plus a
 * **hanging tab** off the bottom-right (Mode · Comments · Save) that overlaps the
 * document and never collapses. No title row — the workspace tab already names
 * the doc. The format groups collapse via container queries on the band width.
 */
export function DocxToolbar(props: DocxToolbarProps) {
  const {
    renderTitleBarRight,
    editingMode,
    onModeChange,
    commentsActive,
    onToggleComments,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onPrint,
    onPageSetup,
    onApplyWatermark,
    currentWatermark,
    watermarkPresets,
    readOnly,
    currentFormatting,
    onFormat,
    documentFonts,
    fontFamilies,
    documentStyles,
    onInsertTable,
    onInsertImage,
    onInsertPageBreak,
    onInsertSectionBreakNextPage,
    onInsertSectionBreakContinuous,
    onInsertTOC,
    tableContext,
    onTableAction,
    imageContext,
    onImageWrapType,
    onImageTransform,
    onOpenImageProperties,
  } = props;
  const { t } = useTranslation();

  const currentMode = EDITING_MODES.find((m) => m.value === editingMode) ?? EDITING_MODES[0];
  const ModeIcon = currentMode.icon;
  const hasOverflow = Boolean(onPrint || onPageSetup);

  return (
    <div className="@container relative flex-shrink-0 border-b border-border bg-background text-foreground z-31">
      {/* ── Main band: undo/redo · format groups · overflow ──────────────── */}
      <div className="flex h-10 items-center gap-1 px-2">
        <Button variant="ghost" size="icon-sm" tooltip="Undo" disabled={!canUndo} onMouseDown={keepFocus} onClick={onUndo}>
          <Undo2 />
        </Button>
        <Button variant="ghost" size="icon-sm" tooltip="Redo" disabled={!canRedo} onMouseDown={keepFocus} onClick={onRedo}>
          <Redo2 />
        </Button>

        {!readOnly && (
          <>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <FormatRow
              currentFormatting={currentFormatting}
              onFormat={onFormat}
              documentFonts={documentFonts}
              fontFamilies={fontFamilies}
              documentStyles={documentStyles}
              onInsertTable={onInsertTable}
              onInsertImage={onInsertImage}
              onInsertPageBreak={onInsertPageBreak}
              onInsertSectionBreakNextPage={onInsertSectionBreakNextPage}
              onInsertSectionBreakContinuous={onInsertSectionBreakContinuous}
              onInsertTOC={onInsertTOC}
              onApplyWatermark={onApplyWatermark}
              currentWatermark={currentWatermark}
              watermarkPresets={watermarkPresets}
              tableContext={tableContext}
              onTableAction={onTableAction}
              imageContext={imageContext}
              onImageWrapType={onImageWrapType}
              onImageTransform={onImageTransform}
              onOpenImageProperties={onOpenImageProperties}
            />
          </>
        )}

        <div className="flex-1" />

        {hasOverflow && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" tooltip="More" onMouseDown={keepFocus}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onPrint && (
                <DropdownMenuItem onSelect={onPrint}>
                  <Printer className="size-4" /> Print
                </DropdownMenuItem>
              )}
              {onPageSetup && (
                <DropdownMenuItem onSelect={onPageSetup}>
                  <Settings className="size-4" /> Page setup
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── Hanging tab: Mode · Comments · Save (fixed right, overlaps doc) ── */}
      <div className="absolute top-full right-3 z-30 flex items-center gap-0.5 rounded-b-md border border-t-0 border-border bg-background/70 px-1 py-0.5 shadow-sm">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" tooltip="Editing mode" tooltipSide="bottom" onMouseDown={keepFocus}>
              <ModeIcon />
              <span>{t(currentMode.labelKey)}</span>
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-54">
            <DropdownMenuRadioGroup value={editingMode} onValueChange={(v) => onModeChange(v as EditorMode)}>
              {EDITING_MODES.map((m) => (
                <DropdownMenuRadioItem key={m.value} value={m.value}>
                  <m.icon className="size-4" />
                  <span className="flex flex-col">
                    <span>{t(m.labelKey)}</span>
                    <span className="text-xs text-muted-foreground">{t(m.descKey)}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Toggle
          size="icon-sm"
          className={TOGGLE_ACTIVE}
          tooltip={commentsActive ? 'Hide comments' : 'Show comments'}
          tooltipSide="bottom"
          pressed={commentsActive}
          onMouseDown={keepFocus}
          onPressedChange={onToggleComments}
        >
          <MessageSquareText />
        </Toggle>

        {renderTitleBarRight && (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-5" />
            <span className="flex items-center">{renderTitleBarRight()}</span>
          </>
        )}
      </div>
    </div>
  );
}
