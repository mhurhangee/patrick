import {
  findHyperlinkRangeAt,
  insertHyperlink,
  removeHyperlink,
  setHyperlink,
} from '@eigenpal/docx-editor-core/prosemirror/commands';
import type { EditorView } from 'prosemirror-view';
import { useCallback, useState } from 'react';
import { normalizeUrl } from '../../../lib/hyperlink';
import type { HyperlinkMode } from '../../dialogs/hyperlink-popover';

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
  /** Ctrl+K on an existing link — edit it. Resolves the link's text when the
   *  caret is inside it (no selection) so the Text field isn't empty. */
  const openEdit = useCallback(
    (data: { href: string; tooltip?: string; displayText?: string }) => {
      let displayText = data.displayText ?? '';
      if (!displayText) {
        const view = getActiveEditorView();
        const hit = view ? findHyperlinkRangeAt(view.state) : null;
        if (view && hit) displayText = view.state.doc.textBetween(hit.start, hit.end);
      }
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

  /** Create or change a link. When the text is unchanged the mark is applied in
   *  place (preserving all run formatting); when it changes, the original run's
   *  marks are carried onto the new text so font/bold/colour survive. */
  const apply = useCallback(
    (text: string, rawUrl: string) => {
      const view = getActiveEditorView();
      if (!view) return;
      const url = normalizeUrl(rawUrl);
      const { schema } = view.state;
      const hlType = schema.marks.hyperlink;
      const hasText = text.trim().length > 0;

      const hit = findHyperlinkRangeAt(view.state);
      if (hit) {
        const rangeText = view.state.doc.textBetween(hit.start, hit.end);
        const display = hasText ? text : rangeText;
        const newMark = hlType.create({ href: url, tooltip: hit.mark.attrs.tooltip });
        if (display === rangeText) {
          view.dispatch(
            view.state.tr
              .removeMark(hit.start, hit.end, hlType)
              .addMark(hit.start, hit.end, newMark)
              .scrollIntoView()
          );
        } else {
          const baseMarks = (view.state.doc.nodeAt(hit.start)?.marks ?? []).filter(
            (m) => m.type !== hlType
          );
          const node = schema.text(display, [...baseMarks, newMark]);
          view.dispatch(view.state.tr.replaceWith(hit.start, hit.end, node).scrollIntoView());
        }
      } else {
        const { from, to, empty } = view.state.selection;
        if (!empty) {
          const selected = view.state.doc.textBetween(from, to);
          const display = hasText ? text : selected;
          if (display === selected) {
            setHyperlink(url)(view.state, view.dispatch);
          } else {
            const baseMarks = (view.state.doc.nodeAt(from)?.marks ?? []).filter(
              (m) => m.type !== hlType
            );
            const node = schema.text(display, [...baseMarks, hlType.create({ href: url })]);
            view.dispatch(view.state.tr.replaceWith(from, to, node).scrollIntoView());
          }
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

  const copy = useCallback((href: string) => {
    navigator.clipboard.writeText(href).catch(() => {});
  }, []);

  return { session, openView, openCreate, openEdit, requestEdit, close, apply, remove, navigate, copy };
}
