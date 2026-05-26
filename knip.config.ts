import type { KnipConfig } from "knip"

const config: KnipConfig = {
	workspaces: {
		".": {},
		"apps/frontend": {},
		"apps/api": {},
		"packages/db": {},
	},
	ignore: [
		"apps/desktop/**",
		// Static PDF.js worker — loaded via URL at runtime, not imported
		"apps/frontend/public/pdf.worker.min.mjs",
	],
	ignoreIssues: {
		// shadcn/ui components export everything for downstream use
		"apps/frontend/src/components/ui/**": [
			"exports",
			"types",
			"nsExports",
			"nsTypes",
		],
		// Plate editor template files — exports used by Plate internals at runtime
		"apps/frontend/src/components/editor/**": [
			"exports",
			"types",
			"nsExports",
			"nsTypes",
		],
	},
}

export default config
