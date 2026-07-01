import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { ErrorBoundary } from './states/error-boundary';
import {
  DocumentOutline,
  OUTLINE_LEFT_OFFSET,
  OUTLINE_BUTTON_LEFT_OFFSET,
} from '../features/outline/document-outline';
import { OutlineToggleButton } from '../features/outline/outline-toggle-button';
import type { HeadingInfo } from '@eigenpal/docx-editor-core/utils';

interface OutlineProps {
  headings: HeadingInfo[];
  onHeadingClick: (pmPos: number) => void;
  onClose: () => void;
  topOffset: number;
  scrollLeft: number;
}

/**
 * Outer chrome of the editor: the error boundary, the scroll container with its
 * background-click handler, the document outline panel + toggle button, plus
 * slots for the toolbar, paged-area body, overlays, dialogs, and hidden file
 * inputs.
 *
 * The expanded-sidebar-item highlight styles are computed here from
 * `expandedSidebarItem` + `trackedChanges` because they need to live
 * inside the editor-content `<div>` for proper scoping.
 */
export function DocxEditorShell({
  isDark,
  containerRef,
  scrollContainerRef,
  editorContentRef,
  containerStyle,
  mainContentStyle,
  editorContainerStyle,
  showOutline,
  minLayoutWidth,
  toolbarHeight,
  editorScrollLeft,
  onScrollContainerMouseDown,
  onEditorBgMouseDown,
  onEditorContextMenu,
  outlineProps,
  onToggleOutline,
  toolbar,
  highlightStyles,
  pagedArea,
  overlays,
  dialogs,
  fileInputs,
}: {
  isDark?: boolean;
  containerRef: React.Ref<HTMLDivElement>;
  scrollContainerRef: React.Ref<HTMLDivElement>;
  editorContentRef: React.Ref<HTMLDivElement>;
  containerStyle: CSSProperties;
  mainContentStyle: CSSProperties;
  editorContainerStyle: CSSProperties;
  showOutline: boolean;
  minLayoutWidth: number;
  toolbarHeight: number;
  editorScrollLeft: number;
  onScrollContainerMouseDown: (e: React.MouseEvent) => void;
  onEditorBgMouseDown: (e: React.MouseEvent) => void;
  onEditorContextMenu: (e: React.MouseEvent) => void;
  outlineProps: OutlineProps;
  onToggleOutline: () => void;
  toolbar: ReactNode;
  highlightStyles: ReactNode;
  pagedArea: ReactNode;
  overlays: ReactNode;
  dialogs: ReactNode;
  fileInputs: ReactNode;
}) {
  return (
    <ErrorBoundary>
      <div
        ref={containerRef}
        className={cn('ep-root docx-editor', isDark && 'dark')}
        style={containerStyle}
        data-testid="docx-editor"
      >
        <div style={mainContentStyle}>
          <div
            style={{
              position: 'relative',
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {toolbar}

            <div
              ref={scrollContainerRef}
              className="docx-editor__scroll-container"
              style={editorContainerStyle}
              onMouseDown={onScrollContainerMouseDown}
            >
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  minHeight: 0,
                  position: 'relative',
                  minWidth: minLayoutWidth,
                }}
              >
                <div
                  ref={editorContentRef}
                  style={{
                    position: 'relative',
                    flex: 1,
                    minWidth: 0,
                  }}
                  onMouseDown={onEditorBgMouseDown}
                  onContextMenu={onEditorContextMenu}
                >
                  {highlightStyles}
                  {pagedArea}
                </div>
              </div>
            </div>

            {showOutline && (
              <DocumentOutline {...outlineProps} leftOffset={OUTLINE_LEFT_OFFSET} />
            )}

            {!showOutline && (
              <OutlineToggleButton
                onClick={onToggleOutline}
                // Aligns with the page top: toolbar + PagedEditor viewport
                // padding-top (24) + pages container padding (24).
                topPx={toolbarHeight + 48}
                scrollLeft={editorScrollLeft}
                leftOffset={OUTLINE_BUTTON_LEFT_OFFSET}
              />
            )}
          </div>
        </div>

        {overlays}
        {dialogs}
        {fileInputs}
      </div>
    </ErrorBoundary>
  );
}
