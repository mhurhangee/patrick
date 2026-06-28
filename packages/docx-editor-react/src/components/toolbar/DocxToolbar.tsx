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
  Bold,
  ChevronDown,
  Italic,
  MessageSquareText,
  MoreVertical,
  Printer,
  Redo2,
  Settings,
  Stamp,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from '../../i18n';
import { EDITING_MODES, type EditorMode } from '../DocxEditor/internals/editing-modes';
import type { FormattingAction, SelectionFormatting } from '../Toolbar';

export interface DocxToolbarProps {
  // App row
  renderLogo?: (() => ReactNode) | undefined;
  documentName?: string | undefined;
  onDocumentNameChange?: ((name: string) => void) | undefined;
  documentNameEditable?: boolean | undefined;
  renderTitleBarRight?: (() => ReactNode) | undefined;
  editingMode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  commentsActive: boolean;
  onToggleComments: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPrint?: (() => void) | undefined;
  onPageSetup?: (() => void) | undefined;
  onWatermark?: (() => void) | undefined;
  // Format row
  readOnly?: boolean;
  currentFormatting: SelectionFormatting;
  onFormat: (action: FormattingAction) => void;
}

// Active-state styling for toolbar toggles: a soft emerald tint with an emerald
// glyph, so "is this on?" reads clearly (overrides the primitive's neutral
// data-[state=on] default).
const TOGGLE_ACTIVE = 'data-[state=on]:bg-primary/15 data-[state=on]:text-primary';

/**
 * The rebuilt editor toolbar (work in progress — mounted only behind the
 * `patrick:new-toolbar` dev flag; see use-new-toolbar-flag.ts). Built on
 * @patrick/ui primitives, it consumes the same toolbar contract as the legacy
 * toolbar (SelectionFormatting + FormattingAction + the insert/table/etc.
 * callbacks) so the editor "brain" is untouched.
 *
 * Two bands: a persistent **app row** (doc name, mode, comments, undo/redo,
 * save, overflow) and a responsive **format row** that collapses by importance
 * via container queries on the toolbar width (which tracks the editor pane).
 *
 * P1 scope: the app row is fully wired; the format row proves the collapse
 * engine — the character toggles (B/I/U/S) are real, the character *pickers*
 * are a placeholder group that collapses to a single button at narrow widths.
 * Real format groups (split into their own files) land in P2.
 */
export function DocxToolbar(props: DocxToolbarProps) {
  const {
    renderLogo,
    documentName,
    onDocumentNameChange,
    documentNameEditable,
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
    onWatermark,
    readOnly,
    currentFormatting,
    onFormat,
  } = props;
  const { t } = useTranslation();

  const currentMode = EDITING_MODES.find((m) => m.value === editingMode) ?? EDITING_MODES[0];
  const ModeIcon = currentMode.icon;
  const hasOverflow = Boolean(onPrint || onPageSetup || onWatermark);

  // Keep the editor selection when clicking chrome controls.
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <div className="@container flex flex-col border-b border-border bg-background text-foreground">
      {/* ── App row (never collapses) ─────────────────────────────────── */}
      <div className="flex h-10 items-center gap-1 px-2">
        {renderLogo && <span className="flex shrink-0 items-center">{renderLogo()}</span>}
        {documentName !== undefined &&
          (documentNameEditable ? (
            <input
              value={documentName}
              onChange={(e) => onDocumentNameChange?.(e.target.value)}
              className="min-w-0 flex-1 truncate rounded-sm bg-transparent px-1 py-0.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              aria-label="Document name"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{documentName}</span>
          ))}
        {documentName === undefined && <span className="flex-1" />}

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            tooltip="Undo"
            disabled={!canUndo}
            onMouseDown={keepFocus}
            onClick={onUndo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            tooltip="Redo"
            disabled={!canRedo}
            onMouseDown={keepFocus}
            onClick={onRedo}
          >
            <Redo2 />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <Toggle
            size="icon-sm"
            className={TOGGLE_ACTIVE}
            tooltip={commentsActive ? 'Hide comments' : 'Show comments'}
            pressed={commentsActive}
            onMouseDown={keepFocus}
            onPressedChange={onToggleComments}
          >
            <MessageSquareText />
          </Toggle>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" tooltip="Editing mode" onMouseDown={keepFocus}>
                <ModeIcon />
                <span className="hidden @md:inline">{t(currentMode.labelKey)}</span>
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={editingMode}
                onValueChange={(v) => onModeChange(v as EditorMode)}
              >
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

          {renderTitleBarRight && (
            <>
              <Separator orientation="vertical" className="mx-1 h-5" />
              <span className="flex items-center">{renderTitleBarRight()}</span>
            </>
          )}

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
                {onWatermark && (
                  <DropdownMenuItem onSelect={onWatermark}>
                    <Stamp className="size-4" /> Watermark
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ── Format row (collapses by container width) ─────────────────── */}
      {!readOnly && (
        <div className="flex h-10 items-center gap-1 border-t border-border px-2">
          {/* Character toggles — real, always inline (top of the priority order) */}
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
          </div>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* Placeholder "character pickers" group — demonstrates collapse:
              inline chips when wide, a single button below ~760px. Real font/
              size/colour controls replace these in P2. */}
          <div className="hidden items-center gap-0.5 text-muted-foreground @min-[760px]:flex">
            <span className="rounded-sm border border-dashed border-border px-2 py-0.5 text-xs">
              Font
            </span>
            <span className="rounded-sm border border-dashed border-border px-2 py-0.5 text-xs">
              Size
            </span>
            <span className="rounded-sm border border-dashed border-border px-2 py-0.5 text-xs">
              Colour
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            tooltip="Text formatting (placeholder)"
            className="text-muted-foreground @min-[760px]:hidden"
            onMouseDown={keepFocus}
          >
            Aa
            <ChevronDown />
          </Button>
        </div>
      )}
    </div>
  );
}
