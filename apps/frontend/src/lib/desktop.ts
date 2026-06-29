import { open } from "@tauri-apps/plugin-dialog";
import { open as shellOpen } from "@tauri-apps/plugin-shell";

/**
 * Desktop (Tauri) helpers. The frontend is shared with the browser (web/cloud
 * later), so anything native must be gated on `isTauri()` — importing the
 * plugin is safe everywhere, but calling it off the desktop throws.
 */

/** True inside the Tauri webview, false in a plain browser. */
export const isTauri = (): boolean =>
	typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Native open-directory dialog. Returns the chosen absolute path, or null if
 * the attorney cancelled. Desktop only — guard call sites with `isTauri()`.
 */
export async function pickFolder(): Promise<string | null> {
	const selected = await open({
		directory: true,
		multiple: false,
		title: "Choose a matter folder",
	});
	return typeof selected === "string" ? selected : null;
}

/**
 * Open an external URL in the system browser on desktop (Tauri can't follow
 * `window.open`/`target=_blank` out of the webview), or a new tab on web.
 */
export function openExternal(url: string): void {
	if (isTauri()) {
		void shellOpen(url);
	} else {
		window.open(url, "_blank", "noopener,noreferrer");
	}
}
