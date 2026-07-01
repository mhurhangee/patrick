/**
 * Sidebar card chrome — shared between React and Vue. Numeric
 * pixel values rather than `'8px'` strings so both adapters'
 * CSSProperties shapes accept them. Lifted from
 * `packages/react/src/components/sidebar/cardStyles.ts` and the
 * Vue mirror so there's one canonical table.
 * @packageDocumentation
 * @public
 */
import type { CSSProperties } from './cssTypes';

export const CARD_STYLE_COLLAPSED: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  backgroundColor: 'var(--docx-card)',
  cursor: 'pointer',
  boxShadow: 'var(--docx-card-shadow)',
};

export const CARD_STYLE_EXPANDED: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  backgroundColor: 'var(--docx-surface)',
  cursor: 'pointer',
  boxShadow: 'var(--docx-card-shadow-strong)',
};
