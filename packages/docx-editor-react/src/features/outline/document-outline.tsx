import type { HeadingInfo } from '@eigenpal/docx-editor-core/utils';
import { Button } from '@patrick/ui/components/button';
import { cn } from '@patrick/ui/lib/utils';
import { ArrowLeft } from 'lucide-react';
import React, { useEffect, useState } from 'react';

// Outline panel geometry (px). Only the *_RESERVED_SPACE values leak out —
// the editor uses them to size the layout so the centered page never sits
// under the panel or the toggle button. The anchor matches the collapsed
// toggle's left offset so the back arrow lands where the toggle was (the
// panel reads as the toggle expanding in place).
export const OUTLINE_LEFT_OFFSET = 12;
const OUTLINE_WIDTH = 240;
const OUTLINE_PAGE_GAP = 16;
// Matches PagedEditor's VIEWPORT_PADDING_TOP so the panel header lines up
// with the page's top edge.
const OUTLINE_TOP_PADDING = 24;
export const OUTLINE_RESERVED_SPACE = OUTLINE_LEFT_OFFSET + OUTLINE_WIDTH + OUTLINE_PAGE_GAP;

// Toggle-button geometry (when the panel is collapsed): button anchor + disc
// box (36px) + gap before the page. The anchor sits in the left gutter roughly
// under the title-bar logo (Google-Docs placement), not pushed toward the page.
export const OUTLINE_BUTTON_LEFT_OFFSET = 12;
const OUTLINE_BUTTON_BOX = 36;
export const OUTLINE_BUTTON_RESERVED_SPACE =
  OUTLINE_BUTTON_LEFT_OFFSET + OUTLINE_BUTTON_BOX + OUTLINE_PAGE_GAP;

interface DocumentOutlineProps {
  headings: HeadingInfo[];
  onHeadingClick: (pmPos: number) => void;
  onClose: () => void;
  topOffset?: number;
  /** Horizontal scroll offset of the editor — outline slides left with the doc. */
  scrollLeft?: number;
  /**
   * Left anchor (px) from the editor area's left edge. Defaults to
   * OUTLINE_LEFT_OFFSET; the host bumps it past the vertical ruler when one
   * is shown so the panel doesn't render on top of it.
   */
  leftOffset?: number;
}

export const DocumentOutline = React.memo(function DocumentOutline({
  headings,
  onHeadingClick,
  onClose,
  topOffset = 0,
  scrollLeft = 0,
  leftOffset = OUTLINE_LEFT_OFFSET,
}: DocumentOutlineProps) {
  const [open, setOpen] = useState(false);

  // Indent relative to the shallowest heading present, not the absolute level.
  // A doc whose top sections are Heading 2 (level 1, e.g. a memo with no H1)
  // should still left-align them at the base instead of carrying a phantom
  // first-level indent.
  const minLevel = headings.length ? Math.min(...headings.map((h) => h.level)) : 0;

  useEffect(() => {
    // Trigger slide-in on next frame
    requestAnimationFrame(() => setOpen(true));
  }, []);

  return (
    <nav
      className="flex flex-col overflow-hidden font-sans"
      role="navigation"
      aria-label={'Document outline'}
      style={{
        position: 'absolute',
        top: topOffset,
        // Anchor to leftOffset, then slide left by the editor's horizontal
        // scroll so the panel tracks the doc instead of staying pinned to
        // the viewport.
        left: leftOffset - scrollLeft,
        bottom: 0,
        width: OUTLINE_WIDTH,
        paddingTop: OUTLINE_TOP_PADDING,
        zIndex: 40,
        // Slide-in animation — translate fully off-screen left of its anchor.
        // Only `transform` transitions; horizontal-scroll tracking via `left`
        // is intentionally untransitioned so the panel keeps up with the doc.
        transform: open ? 'translateX(0)' : `translateX(-${leftOffset + OUTLINE_WIDTH}px)`,
        transition: 'transform 0.15s ease-out',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header — back arrow + title. No left padding so the back arrow sits
          at the nav anchor (= the collapsed toggle's position). */}
      <div className="flex items-center gap-2 pt-4 pr-4 pb-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={'Close outline'}
          tooltip={'Close outline'}
        >
          <ArrowLeft />
        </Button>
        <span className="text-sm text-foreground">{'Outline'}</span>
      </div>

      {/* Heading list. Small left padding so items sit close to the left
          gutter (under the back arrow), not in a wide indent band. Per-level
          indent (level is 0-based: Heading 1 = 0) nests sub-headings. */}
      <div className="flex-1 overflow-y-auto pl-1">
        {headings.length === 0 ? (
          <div className="px-4 py-2 text-[13px] leading-5 text-muted-foreground">
            {'No headings found. Add headings to your document to see them here.'}
          </div>
        ) : (
          headings.map((heading, index) => {
            // Subtle depth hierarchy: top level reads a touch larger/heavier,
            // deeper levels step down to muted — alongside the indent.
            const depth = heading.level - minLevel;
            const depthClass =
              depth === 0
                ? 'text-sm font-medium text-foreground'
                : depth === 1
                  ? 'text-[13px] font-normal text-foreground'
                  : 'text-[13px] font-normal text-muted-foreground';
            return (
              <div key={`${heading.pmPos}-${index}`} style={{ marginLeft: depth * 16 }}>
                <button
                  type="button"
                  onClick={() => onHeadingClick(heading.pmPos)}
                  title={heading.text}
                  className={cn(
                    'block w-full truncate rounded-sm px-2 py-[5px] text-left leading-[18px] hover:bg-accent',
                    depthClass
                  )}
                >
                  {heading.text}
                </button>
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
});
