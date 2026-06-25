/**
 * In-app "What's new" — the curated highlights for the current release, shown in
 * the version-chip popover. Promote the headline features here; the complete,
 * honest record (every Added/Changed/Fixed, every version) lives in CHANGELOG.md,
 * linked from the popover. Refresh this when cutting a release (see CONTRIBUTING).
 *
 * The version itself is not here — it's injected at build from tauri.conf.json.
 */
export const LATEST_HIGHLIGHTS = {
	headline: "Prior-art search and claim charting",
	highlights: [
		"Search any document by meaning or exact text, right beside it",
		"Chart a claim's limitations against the prior art — every citation clicks through to the source",
		"Patrick drives it: ask him to build, read, and edit a chart, or to find where something's disclosed",
	],
} as const;

/** The full changelog on GitHub — the popover's "Full changelog" link. */
export const CHANGELOG_URL =
	"https://github.com/mhurhangee/patrick/blob/main/CHANGELOG.md";

/** The hosted docs — the Patrick menu's "Docs" link. */
export const DOCS_URL = "https://usepatrick.com/docs";
