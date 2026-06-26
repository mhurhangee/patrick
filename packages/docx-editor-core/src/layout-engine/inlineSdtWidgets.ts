/**
 * Inline SDT widget metadata carried by a painted text run.
 */
export interface InlineSdtWidget {
  kind: 'checkbox';
  /** Stable per-document id derived from the ProseMirror node position. */
  groupId: string;
  /** ProseMirror position of the inline SDT node. */
  pos: number;
  /** Word tag value (`w:tag`). */
  tag?: string;
  /** Word alias value (`w:alias`). */
  alias?: string;
  /** Live checkbox glyph state. */
  checked?: boolean;
}
