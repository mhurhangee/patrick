import type { CSSProperties, ReactNode } from 'react';
import type { TrackedChangesResult } from '@eigenpal/docx-editor-core/prosemirror/utils/extractTrackedChanges';
import { LocaleProvider } from '../../i18n';
import { cn } from '../../lib/utils';
import { ErrorBoundary } from '../states/error-boundary';
import {
  DocumentOutline,
  OUTLINE_LEFT_OFFSET,
  OUTLINE_BUTTON_LEFT_OFFSET,
} from '../outline/document-outline';
import { OutlineToggleButton } from '../outline/outline-toggle-button';
import { PageIndicator } from './PageIndicator';
import type { HeadingInfo } from '@eigenpal/docx-editor-core/utils';

interface ScrollPageInfo {
  currentPage: number;
  totalPages: number;
  visible: boolean;
}

interface OutlineProps {
  headings: HeadingInfo[];
  onHeadingClick: (pmPos: number) => void;
  onClose: () => void;
  topOffset: number;
  scrollLeft: number;
}

/**
 * Outer chrome of the editor: the locale provider + error boundary, the
 * scroll container with its background-click handler, the floating page
 * indicator, the document outline panel + toggle button, plus slots for the
 * toolbar, paged-area body, overlays, dialogs, and hidden file inputs.
 *
 * The expanded-sidebar-item highlight styles are computed here from
 * `expandedSidebarItem` + `trackedChanges` because they need to live
 * inside the editor-content `<div>` for proper scoping.
 */
export function DocxEditorShell({
  i18n,
  isDark,
  onEditorError,
  containerRef,
  scrollContainerRef,
  editorContentRef,
  className,
  containerStyle,
  mainContentStyle,
  editorContainerStyle,
  showOutline,
  showOutlineButton,
  minLayoutWidth,
  toolbarHeight,
  editorScrollLeft,
  expandedSidebarItem,
  trackedChanges,
  onScrollContainerMouseDown,
  onEditorBgMouseDown,
  onEditorContextMenu,
  outlineProps,
  onToggleOutline,
  scrollPageInfo,
  toolbar,
  pagedArea,
  overlays,
  dialogs,
  fileInputs,
}: {
  i18n: React.ComponentProps<typeof LocaleProvider>['i18n'];
  isDark?: boolean;
  onEditorError: (error: Error) => void;
  containerRef: React.Ref<HTMLDivElement>;
  scrollContainerRef: React.Ref<HTMLDivElement>;
  editorContentRef: React.Ref<HTMLDivElement>;
  className: string | undefined;
  containerStyle: CSSProperties;
  mainContentStyle: CSSProperties;
  editorContainerStyle: CSSProperties;
  showOutline: boolean;
  showOutlineButton: boolean;
  minLayoutWidth: number;
  toolbarHeight: number;
  editorScrollLeft: number;
  expandedSidebarItem: string | null;
  trackedChanges: TrackedChangesResult['entries'];
  onScrollContainerMouseDown: (e: React.MouseEvent) => void;
  onEditorBgMouseDown: (e: React.MouseEvent) => void;
  onEditorContextMenu: (e: React.MouseEvent) => void;
  outlineProps: OutlineProps;
  onToggleOutline: () => void;
  scrollPageInfo: ScrollPageInfo;
  toolbar: ReactNode;
  pagedArea: ReactNode;
  overlays: ReactNode;
  dialogs: ReactNode;
  fileInputs: ReactNode;
}) {
  return (
    <LocaleProvider i18n={i18n}>
      <ErrorBoundary onError={onEditorError}>
          <div
            ref={containerRef}
            className={cn('ep-root docx-editor', isDark && 'dark', className)}
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
                      {/* Brightened highlight for the focused/expanded sidebar item. */}
                      {expandedSidebarItem && expandedSidebarItem.startsWith('comment-') && (
                        <style>{`.paged-editor__pages [data-comment-id="${expandedSidebarItem.replace('comment-', '')}"] { background-color: rgba(255, 212, 0, 0.35) !important; border-bottom: 2px solid rgba(255, 212, 0, 0.7) !important; }`}</style>
                      )}
                      {expandedSidebarItem?.startsWith('tc-') &&
                        (() => {
                          const revId = expandedSidebarItem.split('-')[1];
                          const tc = trackedChanges.find((c) => String(c.revisionId) === revId);
                          const insRevId = tc?.insertionRevisionId;
                          return (
                            <style>{`
                            .paged-editor__pages .docx-insertion[data-revision-id="${insRevId ?? revId}"] { background-color: rgba(52, 168, 83, 0.2) !important; border-bottom: 2px solid #2e7d32 !important; }
                            .paged-editor__pages .docx-deletion[data-revision-id="${revId}"] { background-color: rgba(211, 47, 47, 0.2) !important; text-decoration-thickness: 2px !important; }
                          `}</style>
                          );
                        })()}
                      {pagedArea}
                    </div>
                  </div>
                </div>

                {scrollPageInfo.totalPages > 1 && (
                  <PageIndicator
                    currentPage={scrollPageInfo.currentPage}
                    totalPages={scrollPageInfo.totalPages}
                    visible={scrollPageInfo.visible}
                  />
                )}

                {showOutline && (
                  <DocumentOutline {...outlineProps} leftOffset={OUTLINE_LEFT_OFFSET} />
                )}

                {showOutlineButton && !showOutline && (
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
    </LocaleProvider>
  );
}
