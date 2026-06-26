import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  loadFont,
  loadFontWithMapping,
  loadFontFromBuffer,
  loadFontFromUrl,
  onFontsLoaded,
  isFontLoaded,
  setGoogleFontsEnabled,
  isGoogleFontsEnabled,
  __resetFontLoaderState,
} from './fontLoader';

/**
 * fontLoader local-availability + remote-disable behavior.
 *
 * - loadFont skips the Google fetch when the exact family already renders
 *   (canRenderFont) and no explicit options were passed.
 * - Explicit options.weights/options.styles always fetch — the local probe
 *   cannot prove a specific weight exists.
 * - loadFontWithMapping skips the mapped Google equivalent (e.g. Open Sans
 *   for Tahoma) only when the original is a genuine system font; families
 *   registered through our face loaders (DOCX-embedded buffers and
 *   consumer-hosted URLs, both routinely subsetted) keep the equivalent
 *   fetch as a glyph-coverage safety net.
 * - setGoogleFontsEnabled(false) suppresses the Google <link> entirely, so a
 *   no-egress / CSP-locked embedder produces zero remote fetches.
 * - Locally satisfied fonts still fire onFontsLoaded (ready-state consumers)
 *   and never block a later explicit-options fetch.
 * - Probing reuses one shared canvas; an in-flight buffer registration is
 *   awaited, not raced.
 *
 * fontLoader is DOM-coupled (document, canvas, document.fonts). bun test runs
 * headless, so we install a minimal stub that (a) records every appended tag,
 * (b) counts canvas creations, and (c) lets canvas text-measurement report a
 * family as "present" by name — exactly the signal canRenderFont reads.
 */

let appended: string[] = [];
let appendedEls: { tagName: string; textContent?: string }[] = [];
let presentFamilies: Set<string> = new Set();
let canvasCount = 0;
// Swappable so individual tests can defer document.fonts.load resolution.
let fontsLoadImpl: () => Promise<unknown> = async () => undefined;

function makeCanvasCtx() {
  let curFont = '';
  return {
    textBaseline: '',
    set font(v: string) {
      curFont = v;
    },
    measureText() {
      // canRenderFont measures `72px <fallback>` then `72px "<Family>", <fallback>`
      // and treats differing widths as "the family rendered". Widen the result
      // only when a present family name appears in the current font string.
      const hit = [...presentFamilies].some((f) => curFont.includes(`"${f}"`));
      return { width: hit ? 150 : 100 };
    },
  };
}

const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

function installDom() {
  const head = {
    appendChild(el: { tagName: string; textContent?: string; onload?: (() => void) | null }) {
      appended.push(el.tagName);
      appendedEls.push(el);
      // Simulate a successful stylesheet load so loadFont's success path runs.
      if (el.tagName === 'link' && typeof el.onload === 'function') {
        queueMicrotask(() => el.onload && el.onload());
      }
    },
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement(tag: string) {
      if (tag === 'link')
        return { tagName: 'link', rel: '', href: '', onload: null, onerror: null };
      if (tag === 'style') return { tagName: 'style', textContent: '' };
      if (tag === 'canvas') {
        canvasCount += 1;
        return { getContext: () => makeCanvasCtx() };
      }
      return { tagName: tag };
    },
    head,
    fonts: {
      load: () => fontsLoadImpl(),
      check: () => true,
    },
  };
}

beforeEach(() => {
  appended = [];
  appendedEls = [];
  presentFamilies = new Set();
  canvasCount = 0;
  fontsLoadImpl = async () => undefined;
  __resetFontLoaderState();
  installDom();
});

afterEach(() => {
  __resetFontLoaderState();
  if (savedDocument) {
    Object.defineProperty(globalThis, 'document', savedDocument);
  } else {
    delete (globalThis as unknown as { document?: unknown }).document;
  }
});

describe('setGoogleFontsEnabled', () => {
  test('defaults to enabled and toggles', () => {
    expect(isGoogleFontsEnabled()).toBe(true);
    setGoogleFontsEnabled(false);
    expect(isGoogleFontsEnabled()).toBe(false);
    setGoogleFontsEnabled(true);
    expect(isGoogleFontsEnabled()).toBe(true);
  });
});

describe('loadFont — local availability', () => {
  test('skips the Google fetch when the family already renders', async () => {
    presentFamilies.add('EpTestLocalA');
    const ok = await loadFont('EpTestLocalA');
    expect(ok).toBe(true);
    expect(appended).not.toContain('link');
  });

  test('fetches when the family is not locally available', async () => {
    const ok = await loadFont('EpTestAbsentA');
    expect(ok).toBe(true); // stubbed onload resolves success
    expect(appended).toContain('link');
  });

  test('explicit options always fetch — the probe cannot prove a weight exists', async () => {
    presentFamilies.add('EpTestLocalB');
    const ok = await loadFont('EpTestLocalB', { weights: [900] });
    expect(ok).toBe(true);
    expect(appended).toContain('link');
  });

  test('an optionless local skip does not block a later explicit-options fetch', async () => {
    // The skip must not be recorded in loadedFonts — the "already loaded"
    // early return ignores options and would turn the second call into a
    // silent no-op.
    presentFamilies.add('EpTestLocalD');
    await loadFont('EpTestLocalD');
    expect(appended).not.toContain('link');
    const ok = await loadFont('EpTestLocalD', { weights: [900] });
    expect(ok).toBe(true);
    expect(appended).toContain('link');
  });

  test('fires onFontsLoaded for locally satisfied fonts (ready-state consumers)', async () => {
    const seen: string[][] = [];
    const off = onFontsLoaded((fonts) => seen.push(fonts));
    presentFamilies.add('EpTestLocalE');
    await loadFont('EpTestLocalE');
    await Promise.resolve(); // flush the notification microtask
    off();
    expect(seen).toEqual([['EpTestLocalE']]);
    // The read API must agree with what the callback announced.
    expect(isFontLoaded('EpTestLocalE')).toBe(true);
  });
});

describe('loadFont — remote disabled', () => {
  test('does not inject a Google <link> and reports failure', async () => {
    setGoogleFontsEnabled(false);
    const ok = await loadFont('EpTestAbsentB');
    expect(ok).toBe(false);
    expect(appended).not.toContain('link');
  });

  test('a locally-available font still resolves with remote disabled', async () => {
    setGoogleFontsEnabled(false);
    presentFamilies.add('EpTestLocalC');
    const ok = await loadFont('EpTestLocalC');
    expect(ok).toBe(true);
    expect(appended).not.toContain('link');
  });

  test('re-probing an absent family allocates no new canvases (shared probe canvas)', async () => {
    setGoogleFontsEnabled(false);
    await loadFont('EpTestAbsentC');
    const afterFirst = canvasCount;
    expect(afterFirst).toBe(1);
    await loadFont('EpTestAbsentC');
    expect(canvasCount).toBe(afterFirst);
  });
});

describe('loadFontWithMapping — provenance-gated equivalent fetch', () => {
  test('skips the mapped equivalent when the original is a system font', async () => {
    // Tahoma maps to Open Sans in FONT_MAPPING; "system" Tahoma renders.
    presentFamilies.add('Tahoma');
    const ok = await loadFontWithMapping('Tahoma');
    expect(ok).toBe(true);
    // No fetch at all — neither Tahoma nor its Open Sans equivalent.
    expect(appended).not.toContain('link');
  });

  test('still fetches the mapped equivalent when the original is absent', async () => {
    // Cambria maps to Caladea; neither present → must fetch the equivalent.
    const ok = await loadFontWithMapping('Cambria');
    expect(ok).toBe(true);
    expect(appended).toContain('link');
  });

  test('keeps fetching the equivalent for buffer-registered (embedded) families', async () => {
    // An embedded Tahoma renders, but embedded fonts are usually subsetted —
    // the metric-compatible equivalent stays in play for glyph coverage.
    await loadFontFromBuffer('Tahoma', new ArrayBuffer(8));
    presentFamilies.add('Tahoma');
    const ok = await loadFontWithMapping('Tahoma');
    expect(ok).toBe(true);
    expect(appended).toContain('link');
  });

  test('keeps fetching the equivalent for URL-registered (fonts prop) families', async () => {
    // Consumer-hosted webfonts are subsetted as routinely as embedded ones.
    await loadFontFromUrl('Tahoma', 'https://fonts.example.com/tahoma-subset.woff2');
    presentFamilies.add('Tahoma');
    const ok = await loadFontWithMapping('Tahoma');
    expect(ok).toBe(true);
    expect(appended).toContain('link');
  });
});

describe('loadFont — in-flight buffer registration', () => {
  test('awaits a pending buffer load instead of racing it with a fetch', async () => {
    // Hold waitForFontAvailable open so the buffer registration stays in flight.
    let releaseFontsLoad: () => void = () => {};
    fontsLoadImpl = () =>
      new Promise<void>((resolve) => {
        releaseFontsLoad = resolve;
      });

    const bufferLoad = loadFontFromBuffer('EpTestEmbedded', new ArrayBuffer(8));
    const fontLoad = loadFont('EpTestEmbedded');

    releaseFontsLoad();
    await bufferLoad;
    const ok = await fontLoad;

    expect(ok).toBe(true);
    // The buffer registration satisfied the family — no Google <link>.
    expect(appended.filter((t) => t === 'link')).toHaveLength(0);
  });
});

describe('loadFontFromBuffer — family-name escaping', () => {
  test('a name with `"` and `}` cannot break out of the @font-face rule', async () => {
    const evil = 'Evil";} * { background: url(//x) } /*';
    await loadFontFromBuffer(evil, new ArrayBuffer(8));
    const styleEl = appendedEls.find((el) => el.tagName === 'style');
    const css = styleEl?.textContent ?? '';
    // The quote that would close the string is escaped, so the payload stays
    // inside the font-family value.
    expect(css).toContain('Evil\\";}');
    // Exactly one @font-face block — no extra rules injected.
    expect(css.match(/@font-face/g)).toHaveLength(1);
  });

  test('a name containing `</style>` does not survive as a literal tag', async () => {
    await loadFontFromBuffer('X</style><img onerror=1>', new ArrayBuffer(8));
    const styleEl = appendedEls.find((el) => el.tagName === 'style');
    const css = styleEl?.textContent ?? '';
    expect(css).not.toContain('</style>');
    expect(css).toContain('\\3c /style\\3e ');
  });

  test('a raw newline in the name cannot terminate the CSS string token', async () => {
    // Per css-syntax-3 a literal LF/CR/FF inside "..." yields a bad-string-token
    // and ends the string, re-opening the injection the `"`-escape closed.
    const evil = 'x\n; } * { background: url(//evil) }';
    await loadFontFromBuffer(evil, new ArrayBuffer(8));
    const styleEl = appendedEls.find((el) => el.tagName === 'style');
    const css = styleEl?.textContent ?? '';
    // LF is hex-escaped, so the payload stays inside the font-family value.
    expect(css).toContain('x\\a ; }');
    expect(css).not.toContain('x\n; }');
    expect(css.match(/@font-face/g)).toHaveLength(1);
  });
});
