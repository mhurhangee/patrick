/**
 * In-app "What's new" — the curated highlights for the current release, shown in
 * the version-chip popover. Promote the headline features here; the complete,
 * honest record (every Added/Changed/Fixed, every version) lives in CHANGELOG.md,
 * linked from the popover. Refresh this when cutting a release (see CONTRIBUTING).
 *
 * The version itself is not here — it's injected at build from tauri.conf.json.
 */
export const LATEST_HIGHLIGHTS = {
	headline: "Grounded in real prior art and real law",
	highlights: [
		"Pull the full text of EP/WO publications (EPO OPS) and any publication via Google Patents",
		"Recall the EPC, Guidelines, and Boards of Appeal case law verbatim — tag with / or let Patrick find it",
		"Web search Patrick can toggle, plus selectable and OCR'd scanned PDFs",
	],
} as const;

/** The full changelog on GitHub — the popover's "Full changelog" link. */
export const CHANGELOG_URL =
	"https://github.com/mhurhangee/patrick/blob/main/CHANGELOG.md";
