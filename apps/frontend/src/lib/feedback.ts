/**
 * Feedback links — a public GitHub issue or a private email, both pre-filled.
 * Nothing is sent anywhere until the attorney submits it themselves; the only
 * auto-included context is the app version + OS, so reports are triage-able
 * without any telemetry.
 */

const GITHUB_REPO = "https://github.com/mhurhangee/patrick";
const FEEDBACK_EMAIL = "m.hurhangee@me.com";

/** A short, non-prying context line: which version + OS the report came from. */
function context(): string {
	const ua = navigator.userAgent;
	const os = ua.includes("Win")
		? "Windows"
		: ua.includes("Mac")
			? "macOS"
			: ua.includes("Linux")
				? "Linux"
				: "Unknown OS";
	return `Patrick v${__APP_VERSION__} · ${os}`;
}

function query(params: Record<string, string>): string {
	return Object.entries(params)
		.map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
		.join("&");
}

/** A pre-filled new GitHub issue — public and trackable. */
export function githubIssueUrl(): string {
	const body = [
		"## What happened",
		"",
		"## What you expected",
		"",
		"---",
		context(),
	].join("\n");
	return `${GITHUB_REPO}/issues/new?${query({ body })}`;
}

/** A pre-filled email — private, lands in the maintainer's inbox. */
export function feedbackMailto(): string {
	const subject = `Patrick feedback (v${__APP_VERSION__})`;
	const body = `\n\n---\n${context()}`;
	return `mailto:${FEEDBACK_EMAIL}?${query({ subject, body })}`;
}
