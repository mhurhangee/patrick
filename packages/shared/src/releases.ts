/**
 * In-app "What's new" — the curated highlights for the current release, shown in
 * the version-chip popover. Promote the headline features here; the complete,
 * honest record (every Added/Changed/Fixed, every version) lives in CHANGELOG.md,
 * linked from the popover. Refresh this when cutting a release (see CONTRIBUTING).
 *
 * The version itself is not here — it's injected at build from tauri.conf.json.
 */
export const LATEST_HIGHLIGHTS = {
	headline: "Control your model and see your context",
	highlights: [
		"Pick the model per chat from a richer picker, locked once the chat starts",
		"One context control in the toolbar — what's about to be sent, with token estimates and one-tap close",
		"Star, rename, and organise chats; per-document quick prompts",
	],
} as const;

/** The full changelog on GitHub — the popover's "Full changelog" link. */
export const CHANGELOG_URL =
	"https://github.com/mhurhangee/patrick/blob/main/CHANGELOG.md";
