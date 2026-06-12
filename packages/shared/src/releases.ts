/**
 * In-app "What's new" — the curated highlights for the current release, shown in
 * the version-chip popover. Promote the headline features here; the complete,
 * honest record (every Added/Changed/Fixed, every version) lives in CHANGELOG.md,
 * linked from the popover. Refresh this when cutting a release (see CONTRIBUTING).
 *
 * The version itself is not here — it's injected at build from tauri.conf.json.
 */
export const LATEST_HIGHLIGHTS = {
	headline: "A unified, agent-first workspace",
	highlights: [
		"One workspace — Patrick is beside you from the first screen, no separate setup pages",
		"Patrick drafts the hard bits: your task brief, practice context, and prompt",
		"Sidebar switchers, in-app settings, a native folder picker, and the Patrick app icon",
	],
} as const;

/** The full changelog on GitHub — the popover's "Full changelog" link. */
export const CHANGELOG_URL =
	"https://github.com/mhurhangee/patrick/blob/main/CHANGELOG.md";
