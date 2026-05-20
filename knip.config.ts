import type { KnipConfig } from "knip"

const config: KnipConfig = {
	workspaces: {
		".": {
			entry: [],
			project: [],
			ignoreDependencies: ["typescript"],
		},
		"apps/frontend": {
			entry: ["src/main.tsx"],
			project: ["src/**/*.{ts,tsx}"],
			ignoreDependencies: [
				"@fontsource-variable/geist",
				"@fontsource-variable/lora",
				"shadcn",
				"tailwindcss",
				"tw-animate-css",
				"@tailwindcss/typography",
				"globals",
			],
		},
		"apps/api": {
			entry: ["src/index.ts"],
			project: ["src/**/*.ts"],
		},
		"packages/db": {
			entry: ["src/index.ts"],
			project: ["src/**/*.ts"],
			ignoreDependencies: ["drizzle-kit", "@libsql/client"],
		},
	},
	ignore: ["apps/desktop/**", "apps/frontend/src/routeTree.gen.ts"],
	ignoreIssues: {
		"apps/frontend/src/components/ui/**": [
			"exports",
			"types",
			"nsExports",
			"nsTypes",
		],
	},
}

export default config
