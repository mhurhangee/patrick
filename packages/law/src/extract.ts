import type { Provision, ProvisionBlock } from "@patrick/shared";
import { type HTMLElement, parse } from "node-html-parser";
import { SOURCES } from "./sources";
import type { EpcMapEntry } from "./types";

// In-force-stamp label by source id (single source of truth: sources.ts).
const SOURCE_LABEL: Record<string, string> = Object.fromEntries(
	SOURCES.map((s) => [s.id, s.stamp]),
);

// EPO consolidates amendments inline: superseded text in `.Del`, current text in
// `.New`. We drop `.Del` and keep `.New` so only the in-force text survives —
// critical for fee amounts, which otherwise read as "530725" (old+new mashed).
// Footnote markers (`.FootnoteRef`) are read for their anchoring, then stripped.

const clean = (t: string): string =>
	t
		.replace(/ /g, " ")
		.replace(/[ \t]+/g, " ")
		.replace(/\s*\n\s*/g, " ")
		.replace(/\s+/g, " ")
		.trim();

/** Read footnote-ref numbers anchored in `node`, then remove the markers. */
function takeRefs(node: HTMLElement): string[] {
	const refs = node.querySelectorAll(".FootnoteRef").map((a) => clean(a.text));
	for (const a of node.querySelectorAll(".FootnoteRef")) a.remove();
	return refs.filter(Boolean);
}

export function extractProvision(html: string, entry: EpcMapEntry): Provision {
	const root = parse(html);
	const meta = (name: string): string | null =>
		root
			.querySelector(`meta[name="${name}"]`)
			?.getAttribute("content")
			?.trim() || null;

	const updated = meta("date_publication");
	const provision: Provision = {
		slug: entry.slug,
		url: entry.url,
		citationKey: entry.citationKey,
		title: meta("title"),
		instrument: meta("booktitle"),
		part: meta("parttitle"),
		chapter: meta("chaptertitle"),
		version: `${SOURCE_LABEL[entry.source] ?? "EPC"}${updated ? ` (consolidated ${updated})` : ""}`,
		titleNotes: [],
		blocks: [],
		notes: {},
	};

	const h1 = root.querySelector("h1.h2");
	if (h1) provision.titleNotes = takeRefs(h1);

	const body = root.querySelector(".epolegal-content");
	if (!body) return provision;

	// 1. Footnotes first, before mutating the body. Skip definitions belonging to
	//    deleted provisions (DELNOTEDEF-*) and strip amendment/back-ref markup.
	const notesEl = body.querySelector(".DOC4NET2-notes");
	if (notesEl) {
		for (const f of notesEl.querySelectorAll(".FootnoteText")) {
			const id = f.querySelector("a[id]")?.getAttribute("id");
			if (!id || id.startsWith("DELNOTEDEF")) continue;
			const num = id.match(/\.f(\d+[a-z]*)-note$/)?.[1];
			if (!num) continue;
			for (const d of f.querySelectorAll(".Del")) d.remove();
			for (const r of f.querySelectorAll(".FootnoteRef")) r.remove();
			provision.notes[num] = clean(f.text).replace(/^\d+[a-z]*\s*/, "");
		}
	}

	// 2. Drop the notes block + separator, superseded text, and the case-law
	//    "updated to …" disclaimer banner, from the body.
	for (const n of body.querySelectorAll(
		".DOC4NET2-notes, .DOC4NET2-noteseparator, .Del, .views-field-field-disclaimer",
	))
		n.remove();

	// 3. Walk top-level blocks; capture verbatim text + the notes anchored there.
	for (const c of body.childNodes) {
		if (c.nodeType !== 1) continue;
		const el = c as HTMLElement;
		const notes = takeRefs(el);
		const text = clean(el.text);
		if (!text) continue;
		const kind =
			(el.getAttribute("class") || "")
				.split(" ")
				.find((x) => /prefixed|FMain|FSub|FSubFirst|paraBlock/.test(x)) ||
			el.rawTagName;
		const block: ProvisionBlock = { kind, text };
		if (notes.length) block.notes = notes;
		provision.blocks.push(block);
	}

	return provision;
}
