import type { KnipConfig } from "knip";

const config: KnipConfig = {
	// Desktop is a Rust/Tauri crate + a thin package.json (deps used via the
	// `tauri` script); nothing for knip to analyse.
	ignoreWorkspaces: ["apps/desktop"],
	workspaces: {
		"apps/frontend": {
			entry: [
				"src/routes/**/*.tsx",
				// Ambient declaration for the Vite-injected __APP_VERSION__ global.
				"src/globals.d.ts",
				// shadcn registry + foundational lib are library surfaces — treat as
				// roots so their (as-yet-unused) exports/deps aren't false-flagged.
				"src/components/ui/**/*.{ts,tsx}",
				"src/components/theme-provider.tsx",
				"src/lib/utils.ts",
			],
			project: ["src/**/*.{ts,tsx}"],
			// Used only via CSS `@import` / the Tailwind plugin, not TS imports.
			ignoreDependencies: [
				"tailwindcss",
				"tw-animate-css",
				"@fontsource-variable/hanken-grotesk",
				"@fontsource-variable/lora",
				// Self-hosted OCR assets — copied into the build by vite.config's
				// viteStaticCopy (referenced by path, not imported).
				"tesseract.js-core",
				"@tesseract.js-data/eng",
			],
		},
		"apps/site": {
			// Next.js app router (app/ at the package root, not src/). The Next plugin
			// adds the app/ + next.config entries; we add the shadcn library surfaces.
			entry: [
				"components/ui/**/*.{ts,tsx}",
				"components/theme-provider.tsx",
				"lib/utils.ts",
			],
			project: [
				"app/**/*.{ts,tsx}",
				"components/**/*.{ts,tsx}",
				"lib/**/*.{ts,tsx}",
			],
			// Used via CSS @import / the Tailwind PostCSS plugin, not TS imports.
			ignoreDependencies: ["tailwindcss", "tw-animate-css"],
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
