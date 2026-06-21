/**
 * In-app "What's new" — the curated highlights for the current release, shown in
 * the version-chip popover. Promote the headline features here; the complete,
 * honest record (every Added/Changed/Fixed, every version) lives in CHANGELOG.md,
 * linked from the popover. Refresh this when cutting a release (see CONTRIBUTING).
 *
 * The version itself is not here — it's injected at build from tauri.conf.json.
 */
export const LATEST_HIGHLIGHTS = {
	headline: "A fix for Claude Haiku",
	highlights: [
		"Chats on Claude Haiku 4.5 no longer error on the first message",
	],
} as const;

/** The full changelog on GitHub — the popover's "Full changelog" link. */
export const CHANGELOG_URL =
	"https://github.com/mhurhangee/patrick/blob/main/CHANGELOG.md";
