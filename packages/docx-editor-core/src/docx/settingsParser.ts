/**
 * settings.xml parser
 *
 * Extracts document-wide settings the layout pipeline needs at render time.
 * We only read what's currently consumed; most of settings.xml (compatibility
 * flags, view state, autoformat) is irrelevant to layout.
 */

import { parseXmlDocument, findChild, getAttribute } from './xmlParser';

/** Document-wide settings parsed from `word/settings.xml`. */
export interface DocumentSettings {
  /**
   * `w:defaultTabStop` (§17.6.13) — interval in twips between default tab
   * stops applied when a paragraph has no custom `w:tabs`. Word's default
   * if unspecified is 720 twips (0.5 inch).
   */
  defaultTabStop: number;
  /**
   * `w:defaultTableStyle` (§17.15.1.44) — the styleId applied to every
   * newly created table in this document. Distinct from the type-default
   * table style (`w:default="1"`), which is what tables inherit from when
   * they carry no `w:tblStyle`. Absent in most documents; a template author
   * sets it so inserted tables pick up the template's table look.
   */
  defaultTableStyle?: string;
  /**
   * `w:themeFontLang` (§17.15.1.88) — the language Word uses to pick the
   * concrete typeface for the *EastAsian* (`w:eastAsia`) and *complex-script*
   * (`w:bidi`) theme font slots when the theme's `<a:ea>`/`<a:cs>` typeface is
   * empty (the common case for Office's default theme). The script-specific
   * `<a:font script="…">` entries are selected by this language. Without it a
   * CJK document whose runs reference `minorEastAsia` resolves to an empty
   * font, which breaks both measurement and painting (text overflows the
   * right margin).
   */
  themeFontLang?: { eastAsia?: string; bidi?: string };
}

/** OOXML default per §17.6.13 when `w:defaultTabStop` is absent. */
export const DEFAULT_TAB_STOP_TWIPS = 720;

/** Sanity cap on `w:defaultTabStop` — Word's max margin is ~22 inches. */
const MAX_TAB_STOP_TWIPS = 31680;

export function parseSettings(xml: string | null): DocumentSettings {
  const root = xml ? parseXmlDocument(xml) : null;
  const el = root ? findChild(root, 'w', 'defaultTabStop') : null;
  const raw = el ? parseInt(getAttribute(el, 'w', 'val') ?? '', 10) : NaN;
  const valid = Number.isFinite(raw) && raw > 0 && raw <= MAX_TAB_STOP_TWIPS;

  const defaultTableStyleEl = root ? findChild(root, 'w', 'defaultTableStyle') : null;
  const defaultTableStyle = defaultTableStyleEl
    ? (getAttribute(defaultTableStyleEl, 'w', 'val') ?? undefined) || undefined
    : undefined;

  const themeFontLangEl = root ? findChild(root, 'w', 'themeFontLang') : null;
  const eastAsiaLang = themeFontLangEl
    ? getAttribute(themeFontLangEl, 'w', 'eastAsia') || undefined
    : undefined;
  const bidiLang = themeFontLangEl
    ? getAttribute(themeFontLangEl, 'w', 'bidi') || undefined
    : undefined;
  const themeFontLang =
    eastAsiaLang || bidiLang
      ? {
          ...(eastAsiaLang ? { eastAsia: eastAsiaLang } : {}),
          ...(bidiLang ? { bidi: bidiLang } : {}),
        }
      : undefined;

  return {
    defaultTabStop: valid ? raw : DEFAULT_TAB_STOP_TWIPS,
    ...(defaultTableStyle ? { defaultTableStyle } : {}),
    ...(themeFontLang ? { themeFontLang } : {}),
  };
}
