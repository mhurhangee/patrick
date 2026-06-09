import type { KnipConfig } from "knip";

const config: KnipConfig = {
	// Desktop is a Rust/Tauri crate + a thin package.json (deps used via the
	// `tauri` script); nothing for knip to analyse.
	ignoreWorkspaces: ["apps/desktop"],
	workspaces: {
		"apps/frontend": {
			entry: [
				"src/routes/**/*.tsx",
				// shadcn registry + foundational lib are library surfaces — treat as
				// roots so their (as-yet-unused) exports/deps aren't false-flagged.
				"src/components/ui/**/*.{ts,tsx}",
				"src/components/theme-provider.tsx",
				"src/lib/utils.ts",
				"src/lib/appearance.ts",
			],
			project: ["src/**/*.{ts,tsx}"],
			// Used only via CSS `@import` / the Tailwind plugin, not TS imports.
			ignoreDependencies: [
				"tailwindcss",
				"tw-animate-css",
				"@fontsource-variable/inter",
				"@fontsource-variable/lora",
			],
		},
		"apps/api": {
			entry: ["src/index.ts"],
			project: ["src/**/*.ts"],
		},
		"packages/shared": {
			project: ["src/**/*.ts"],
		},
	},
};

export default config;
