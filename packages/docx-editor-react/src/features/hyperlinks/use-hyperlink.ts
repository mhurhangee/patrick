import {
  findHyperlinkRangeAt,
  insertHyperlink,
  removeHyperlink,
} from '@eigenpal/docx-editor-core/prosemirror/commands';
import type { EditorView } from 'prosemirror-view';
import { useCallback, useState } from 'react';
import { normalizeUrl } from './hyperlink';
import type { HyperlinkMode } from './hyperlink-popover';

interface LinkData {
  href: string;
  displayText: string;
  tooltip?: string;
}

interface HyperlinkSession extends LinkData {
  open: boolean;
  mode: HyperlinkMode;
  /** Explicit anchor rect (link click); null → host falls back to the caret rect. */
  rect: DOMRect | null;
  /** A hyperlink already exists at the target (Update + Remove, vs Insert). */
  isExisting: boolean;
}

const CLOSED: HyperlinkSession = {
  open: false,
  mode: 'view',
  rect: null,
  href: '',
  displayText: '',
  isExisting: false,
};

/**
 * The single hyperlink "session": one open/mode/anchor state shared by the
 * click-a-link popup (view) and the Ctrl+K / toolbar form (edit), plus one
 * apply/remove path against the editor.
 */
export function useHyperlink({
  getActiveEditorView,
  focusActiveEditor,
  onOpenLink,
}: {
  getActiveEditorView: () => EditorView | null | undefined;
  focusActiveEditor: () => void;
  /** Host opener (Tauri shell on desktop, window.open on web). Falls back to
   *  window.open when the host doesn't provide one. */
  onOpenLink?: (href: string) => void;
}) {
  const [session, setSession] = useState<HyperlinkSession>(CLOSED);

  /** A link was clicked — show it (view) anchored at the link's rect. */
  const openView = useCallback(
    (rect: DOMRect, data: LinkData) =>
      setSession({ ...CLOSED, open: true, mode: 'view', rect, isExisting: true, ...data }),
    []
  );
  /** Ctrl+K / toolbar with no link under the cursor — create, text = selection. */
  const openCreate = useCallback(
    (selectedText: string) =>
      setSession({ ...CLOSED, open: true, mode: 'edit', displayText: selectedText }),
    []
  );
  /** Ctrl+K on an existing link — edit it. Always prefills the link's FULL text
   *  (resolved from its range), not any partial selection inside it — editing a
   *  link acts on the whole link, and prefilling a fragment would make apply()
   *  overwrite the rest of the link with that fragment. */
  const openEdit = useCallback(
    (data: { href: string; tooltip?: string; displayText?: string }) => {
      const view = getActiveEditorView();
      const hit = view ? findHyperlinkRangeAt(view.state) : null;
      const displayText =
        view && hit ? view.state.doc.textBetween(hit.start, hit.end) : (data.displayText ?? '');
      setSession({
        ...CLOSED,
        open: true,
        mode: 'edit',
        isExisting: true,
        href: data.href,
        tooltip: data.tooltip,
        displayText,
      });
    },
    [getActiveEditorView]
  );
  const requestEdit = useCallback(() => setSession((s) => ({ ...s, mode: 'edit' })), []);
  const close = useCallback(() => setSession(CLOSED), []);

  /** Create or change a link over an existing range. When the display text is
   *  unchanged the hyperlink mark is re-pointed in place, so every run keeps its
   *  own formatting; when the text is genuinely retyped there's no sound way to
   *  map the old runs onto new characters, so the new text inherits the range's
   *  leading-run marks. Either way the explicit text colour is dropped (matching
   *  core setHyperlink) so Word's hyperlink blue shows through. */
  const apply = useCallback(
    (text: string, rawUrl: string) => {
      const view = getActiveEditorView();
      if (!view) return;
      const url = normalizeUrl(rawUrl);
      const { schema } = view.state;
      const hlType = schema.marks.hyperlink;
      const textColorType = schema.marks.textColor;
      const hasText = text.trim().length > 0;

      const relink = (start: number, end: number, currentText: string, tooltip?: string) => {
        const display = hasText ? text : currentText;
        const mark = hlType.create(tooltip ? { href: url, tooltip } : { href: url });
        if (display === currentText) {
          let tr = view.state.tr.removeMark(start, end, hlType);
          if (textColorType) tr = tr.removeMark(start, end, textColorType);
          view.dispatch(tr.addMark(start, end, mark).scrollIntoView());
        } else {
          const baseMarks = (view.state.doc.nodeAt(start)?.marks ?? []).filter(
            (m) => m.type !== hlType && m.type !== textColorType
          );
          const node = schema.text(display, [...baseMarks, mark]);
          view.dispatch(view.state.tr.replaceWith(start, end, node).scrollIntoView());
        }
      };

      const hit = findHyperlinkRangeAt(view.state);
      if (hit) {
        relink(hit.start, hit.end, view.state.doc.textBetween(hit.start, hit.end), hit.mark.attrs.tooltip);
      } else {
        const { from, to, empty } = view.state.selection;
        if (!empty) {
          relink(from, to, view.state.doc.textBetween(from, to));
        } else {
          insertHyperlink(hasText ? text : url, url, undefined)(view.state, view.dispatch);
        }
      }
      setSession(CLOSED);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  const remove = useCallback(() => {
    const view = getActiveEditorView();
    if (view) {
      const hit = findHyperlinkRangeAt(view.state, session.href || undefined);
      if (hit) {
        const hlType = view.state.schema.marks.hyperlink;
        view.dispatch(view.state.tr.removeMark(hit.start, hit.end, hlType).scrollIntoView());
      } else {
        removeHyperlink(view.state, view.dispatch);
      }
    }
    setSession(CLOSED);
    focusActiveEditor();
  }, [getActiveEditorView, focusActiveEditor, session.href]);

  const navigate = useCallback(
    (href: string) => {
      if (onOpenLink) onOpenLink(href);
      else window.open(href, '_blank', 'noopener,noreferrer');
    },
    [onOpenLink]
  );

  /** Copy the href; resolves true only on a successful clipboard write so the UI
   *  doesn't flash a false "copied" when the write is denied/unavailable. */
  const copy = useCallback(
    (href: string): Promise<boolean> =>
      navigator.clipboard.writeText(href).then(
        () => true,
        () => false
      ),
    []
  );

  return { session, openView, openCreate, openEdit, requestEdit, close, apply, remove, navigate, copy };
}
