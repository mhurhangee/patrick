/**
 * Selection Overlay Component
 *
 * Renders the selection overlay for the paged editor, including:
 * - Caret cursor (blinking vertical line for collapsed selection)
 * - Selection highlights (blue rectangles for range selection)
 *
 * The overlay is positioned absolutely over the pages container and
 * renders selection rectangles in container-relative coordinates.
 */

import React, { useEffect, useState } from 'react';
import type { SelectionRect, CaretPosition } from '@eigenpal/docx-editor-core/layout-bridge';

// =============================================================================
// TYPES
// =============================================================================

export interface SelectionOverlayProps {
  /** Selection rectangles for range selection. */
  selectionRects: SelectionRect[];
  /** Caret position for collapsed selection. */
  caretPosition: CaretPosition | null;
  /** Whether the editor is focused. */
  isFocused: boolean;
  /** Hide caret/selection when in read-only mode. */
  readOnly?: boolean;
  /** Gap between pages (for coordinate adjustment). */
  pageGap?: number;
  /** Custom caret color. */
  caretColor?: string;
  /** Custom selection background color. */
  selectionColor?: string;
  /** Caret width in pixels. */
  caretWidth?: number;
  /** Blink interval in milliseconds (0 to disable). */
  blinkInterval?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// var so dark mode (.ep-root.dark sets --doc-caret light) shows a visible
// caret — the overlay sits outside the inverted page, so #000 would vanish.
const DEFAULT_CARET_COLOR = 'var(--doc-caret, #000)';
const DEFAULT_SELECTION_COLOR = 'rgba(66, 133, 244, 0.3)'; // Google Docs style blue
const DEFAULT_CARET_WIDTH = 2;
const DEFAULT_BLINK_INTERVAL = 530; // Standard cursor blink rate

// =============================================================================
// STYLES
// =============================================================================

const overlayStyles: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  zIndex: 10,
  overflow: 'hidden',
};

const caretStyles = (
  caret: CaretPosition,
  color: string,
  width: number,
  visible: boolean
): React.CSSProperties => ({
  position: 'absolute',
  left: caret.x,
  top: caret.y,
  width: width,
  height: caret.height,
  backgroundColor: color,
  opacity: visible ? 1 : 0,
  transition: 'opacity 0.05s ease-out',
  pointerEvents: 'none',
});

const selectionRectStyles = (rect: SelectionRect, color: string): React.CSSProperties => ({
  position: 'absolute',
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
  backgroundColor: color,
  pointerEvents: 'none',
});

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Caret component with blinking animation.
 */
const Caret: React.FC<{
  position: CaretPosition;
  color: string;
  width: number;
  blinkInterval: number;
  isFocused: boolean;
}> = ({ position, color, width, blinkInterval, isFocused }) => {
  const [visible, setVisible] = useState(isFocused);

  // One effect owns the blink timer. The `position` deps make it re-run on
  // caret movement too, which restarts the cycle so the caret shows solid
  // immediately after typing/navigation before resuming its blink.
  useEffect(() => {
    if (!isFocused || blinkInterval <= 0) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = window.setInterval(() => setVisible((v) => !v), blinkInterval);
    return () => window.clearInterval(timer);
  }, [isFocused, blinkInterval, position.x, position.y]);

  return <div style={caretStyles(position, color, width, visible)} data-testid="caret" />;
};

/**
 * Selection rectangle component.
 */
const SelectionRectangle: React.FC<{
  rect: SelectionRect;
  color: string;
  index: number;
}> = ({ rect, color, index }) => {
  return (
    <div
      style={selectionRectStyles(rect, color)}
      data-testid={`selection-rect-${index}`}
      data-page-index={rect.pageIndex}
    />
  );
};

/**
 * Selection overlay component.
 *
 * Renders selection highlights and caret cursor over the paginated document.
 * Should be positioned as a child of the pages container with relative positioning.
 */
export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  selectionRects,
  caretPosition,
  isFocused,
  readOnly = false,
  caretColor = DEFAULT_CARET_COLOR,
  selectionColor = DEFAULT_SELECTION_COLOR,
  caretWidth = DEFAULT_CARET_WIDTH,
  blinkInterval = DEFAULT_BLINK_INTERVAL,
}) => {
  if (readOnly) {
    return null;
  }
  // Determine if we have a range selection or collapsed selection
  const hasRangeSelection = selectionRects.length > 0;
  const hasCollapsedSelection = caretPosition !== null && !hasRangeSelection;

  return (
    <div style={overlayStyles} data-testid="selection-overlay">
      {/* Render selection rectangles for range selection */}
      {hasRangeSelection &&
        selectionRects.map((rect, index) => (
          <SelectionRectangle
            key={`sel-${rect.pageIndex}-${rect.x}-${rect.y}-${index}`}
            rect={rect}
            color={selectionColor}
            index={index}
          />
        ))}

      {/* Render caret for collapsed selection */}
      {hasCollapsedSelection && caretPosition && (
        <Caret
          position={caretPosition}
          color={caretColor}
          width={caretWidth}
          blinkInterval={blinkInterval}
          isFocused={isFocused}
        />
      )}
    </div>
  );
};

