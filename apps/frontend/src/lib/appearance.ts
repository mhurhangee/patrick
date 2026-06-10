import type { Appearance } from "@patrick/shared";

export type ColourTheme = {
	id: string;
	label: string;
	primary: string;
	ring: string;
};

const EMERALD: ColourTheme = {
	id: "emerald",
	label: "Emerald",
	primary: "oklch(0.508 0.118 165.612)",
	ring: "oklch(0.709 0.01 56.259)",
};

export const COLOUR_THEMES: ColourTheme[] = [
	EMERALD,
	{
		id: "blue",
		label: "Blue",
		primary: "oklch(0.55 0.18 255)",
		ring: "oklch(0.62 0.16 255)",
	},
	{
		id: "violet",
		label: "Violet",
		primary: "oklch(0.55 0.2 295)",
		ring: "oklch(0.62 0.18 295)",
	},
	{
		id: "stone",
		label: "Stone",
		primary: "oklch(0.45 0.01 60)",
		ring: "oklch(0.55 0.01 60)",
	},
];

export function applyColour(themeId: string) {
	const theme = COLOUR_THEMES.find((t) => t.id === themeId) ?? EMERALD;
	const root = document.documentElement.style;
	root.setProperty("--primary", theme.primary);
	root.setProperty("--primary-foreground", "oklch(0.985 0 0)");
	root.setProperty("--ring", theme.ring);
	root.setProperty("--sidebar-primary", theme.primary);
	root.setProperty("--sidebar-ring", theme.ring);
}

export function applyScale(scale: number) {
	document.documentElement.style.setProperty("--ui-scale", String(scale));
}

/** Apply the colour + scale parts of an appearance. Mode is owned by ThemeProvider. */
export function applyAppearance(appearance: Appearance) {
	applyColour(appearance.theme);
	applyScale(appearance.scale);
}
