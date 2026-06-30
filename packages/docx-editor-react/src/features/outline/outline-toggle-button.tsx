import { Z_INDEX } from '../../lib/z-index';
import { OUTLINE_BUTTON_LEFT_OFFSET } from './document-outline';
import { List } from 'lucide-react';

export function OutlineToggleButton({
  onClick,
  topPx,
  scrollLeft = 0,
  leftOffset = OUTLINE_BUTTON_LEFT_OFFSET,
}: {
  onClick: () => void;
  topPx: number;
  /** Horizontal scroll offset of the editor — button slides with the doc. */
  scrollLeft?: number;
  /**
   * Left anchor (px) from the editor area's left edge. Defaults to
   * OUTLINE_BUTTON_LEFT_OFFSET; the host bumps it past the vertical ruler
   * when one is shown so the button doesn't render on top of it.
   */
  leftOffset?: number;
}) {
  return (
    <button
      className="docx-outline-toggle"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      title={'Show document outline'}
      aria-label={'Show document outline'}
      style={{
        position: 'absolute',
        // Anchor in the left gutter and track horizontal scroll so the
        // button doesn't pin to the viewport and overlay the doc. Visuals
        // (disc, ring, hover) live in editor.css `.docx-outline-toggle`.
        left: leftOffset - scrollLeft,
        top: topPx,
        zIndex: Z_INDEX.outline,
      }}
    >
      {/* Icon inherits the button's `color` (fill: currentColor). */}
      <List size={20} />
    </button>
  );
}
