import { type RefObject, useEffect, useRef } from "react";
import type { HighlightSelected } from "./doc-search-context";
import { normalizeForMatch } from "./normalize";

// In-document highlighting via the CSS Custom Highlight API (no DOM surgery — Ranges
// over the existing text, styled by ::highlight() in index.css). Matching is
// whitespace-normalized and strips markdown/patent markers, so a chunk's stored text
// matches the rendered DOM (and the pdfjs text layer) despite spacing differences.

type CharPos = { node: Text; offset: number };

const supported = () =>
	typeof CSS !== "undefined" &&
	"highlights" in CSS &&
	typeof Highlight !== "undefined";

/** Flatten the container's text nodes into a normalized string + a per-char map back
 *  to (node, offset), collapsing whitespace and lowercasing. */
function buildIndex(container: HTMLElement): { flat: string; map: CharPos[] } {
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	let flat = "";
	const map: CharPos[] = [];
	let lastWasSpace = true;
	let first = true;
	let node = walker.nextNode() as Text | null;
	while (node) {
		const text = node.textContent ?? "";
		// Each text-node boundary is whitespace: a <br>, block edge, or an inline
		// split (<strong>/<em>) leaves adjacent text nodes with no separator, but the
		// source text has a space/newline there.
		if (!first && !lastWasSpace) {
			flat += " ";
			map.push({ node, offset: 0 });
			lastWasSpace = true;
		}
		first = false;
		for (let i = 0; i < text.length; i++) {
			const ch = text[i] ?? "";
			if (/\s/.test(ch)) {
				if (!lastWasSpace) {
					flat += " ";
					map.push({ node, offset: i });
					lastWasSpace = true;
				}
			} else {
				flat += ch.toLowerCase();
				map.push({ node, offset: i });
				lastWasSpace = false;
			}
		}
		node = walker.nextNode() as Text | null;
	}
	return { flat, map };
}

function matchAll(flat: string, map: CharPos[], t: string): Range[] {
	if (t.length < 1) return [];
	const ranges: Range[] = [];
	let from = 0;
	for (;;) {
		const i = flat.indexOf(t, from);
		if (i < 0) break;
		const a = map[i];
		const b = map[i + t.length - 1];
		if (a && b) {
			try {
				const r = document.createRange();
				r.setStart(a.node, a.offset);
				r.setEnd(b.node, b.offset + 1);
				ranges.push(r);
			} catch {
				// node detached mid-build — skip
			}
		}
		from = i + t.length;
	}
	return ranges;
}

const PREFIX_LEN = 90;

function findRanges(flat: string, map: CharPos[], target: string): Range[] {
	const t = normalizeForMatch(target);
	if (!t) return [];
	const ranges = matchAll(flat, map, t);
	if (ranges.length || t.length <= PREFIX_LEN) return ranges;
	// A long literal (a semantic chunk) rarely matches the rendered DOM / pdfjs text
	// layer exactly — fall back to a short prefix as a locator so the section still
	// highlights (its start) and scrolls.
	return matchAll(flat, map, t.slice(0, PREFIX_LEN));
}

function setHighlight(name: string, ranges: Range[]): void {
	if (ranges.length) CSS.highlights.set(name, new Highlight(...ranges));
	else CSS.highlights.delete(name);
}

export function useDocHighlights(
	containerRef: RefObject<HTMLElement | null>,
	texts: string[],
	selected: HighlightSelected,
	scrollKey: number,
): void {
	const lastScrollKey = useRef(scrollKey);
	useEffect(() => {
		const container = containerRef.current;
		if (!container || !supported()) return;

		const scroll = scrollKey !== lastScrollKey.current;
		lastScrollKey.current = scrollKey;

		const apply = (doScroll: boolean) => {
			const { flat, map } = buildIndex(container);
			setHighlight(
				"doc-search-all",
				texts.flatMap((t) => findRanges(flat, map, t)),
			);
			let sel: Range | null = null;
			if (selected) {
				const rs = findRanges(flat, map, selected.text);
				sel = rs[selected.nth] ?? rs[0] ?? null;
			}
			setHighlight("doc-search-selected", sel ? [sel] : []);
			if (doScroll && sel) {
				(sel.startContainer.parentElement ?? container).scrollIntoView({
					behavior: "smooth",
					block: "center",
				});
			}
		};

		apply(scroll);

		// PDF renders pages on demand as you scroll — re-apply (no re-scroll) when the
		// text layers change. Debounced; the Highlight API adds no nodes, so no loop.
		let timer: number | undefined;
		const observer = new MutationObserver(() => {
			clearTimeout(timer);
			timer = window.setTimeout(() => apply(false), 120);
		});
		observer.observe(container, {
			childList: true,
			subtree: true,
			characterData: true,
		});

		return () => {
			observer.disconnect();
			clearTimeout(timer);
			CSS.highlights.delete("doc-search-all");
			CSS.highlights.delete("doc-search-selected");
		};
	}, [containerRef, texts, selected, scrollKey]);
}
