import type { KnipConfig } from "knip";

const config: KnipConfig = {
	// Desktop is a Rust/Tauri crate + a thin package.json (deps used via the
	// `tauri` script); nothing for knip to analyse. The vendored docx-editor
	// packages are third-party library code with a broad public API — knip would
	// flag the whole exported surface as unused, so they're left out (same stance
	// as their biome lint exemption). They ARE typechecked (root `typecheck`) and
	// covered by their own bun:test suites. Revisit per-package only if we want a
	// library-mode dead-code sweep.
	ignoreWorkspaces: [
		"apps/desktop",
		"packages/docx-editor-core",
		"packages/docx-editor-agents",
		"packages/docx-editor-react",
	],
	// Throwaway proof-of-concept scripts (run by hand with bun), not app code.
	ignore: ["spikes/**"],
	workspaces: {
		"apps/frontend": {
			entry: [
				"src/routes/**/*.tsx",
				// Ambient declaration for the Vite-injected __APP_VERSION__ global.
				"src/globals.d.ts",
				// Foundational lib surfaces — treat as roots so their (as-yet-unused)
				// exports/deps aren't false-flagged. (shadcn primitives now live in
				// @patrick/ui.)
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
			// adds the app/ + next.config entries; we add the foundational surfaces.
			// (shadcn primitives now live in @patrick/ui.)
			entry: ["components/theme-provider.tsx", "lib/utils.ts"],
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
		// Shared shadcn/design-system surface — its exported components + cn are
		// the library API (consumed by the apps), so treat them as entries.
		"packages/ui": {
			entry: ["src/components/*.tsx", "src/lib/*.ts"],
			project: ["src/**/*.{ts,tsx}"],
			// theme.css uses Tailwind directives (@apply/@theme), but the consuming
			// app's Tailwind processes them — tailwindcss isn't this package's dep.
			ignoreDependencies: ["tailwindcss"],
		},
	},
};

export default config;
