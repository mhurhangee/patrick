// External destinations for the marketing site.
export const GITHUB_URL = "https://github.com/mhurhangee/patrick";
export const DOWNLOAD_URL = `${GITHUB_URL}/releases/latest`;
export const ISSUES_URL = `${GITHUB_URL}/issues`;
export const CONTACT_EMAIL = "m.hurhangee@me.com";

// The site's top-level nav, shared by the header, footer, and mobile menu.
export const NAV_LINKS: { label: string; href: string; external?: boolean }[] =
	[
		{ label: "Docs", href: "/docs" },
		{ label: "Privacy", href: "/privacy" },
		{ label: "Contact", href: "/contact" },
		{ label: "Source", href: GITHUB_URL, external: true },
	];
