#!/usr/bin/env node
// Ensure the vendored @eigenpal/docx-editor-* packages have been built before
// the frontend (Vite) / api (Bun) try to consume their dist. Cheap stat check
// in the common case (already built); only triggers `pnpm build:editor` when a
// dist artifact is missing — e.g. a fresh checkout where `prepare` didn't run,
// or after a manual `dist/` wipe. Building the editor takes ~20s, so we never
// do it when the artifacts are already present.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// One sentinel per package — the entry points Patrick actually imports.
const sentinels = [
	"packages/docx-editor-core/dist/core.mjs",
	"packages/docx-editor-i18n/dist/index.mjs",
	"packages/docx-editor-agents/dist/server.mjs",
	"packages/docx-editor-react/dist/index.mjs",
	"packages/docx-editor-react/dist/styles.css",
];

const missing = sentinels.filter((p) => !existsSync(resolve(root, p)));
if (missing.length === 0) process.exit(0);

console.log(
	`[ensure-editor-built] missing ${missing.length} artifact(s); building the docx editor…`,
);
execSync("pnpm build:editor", { cwd: root, stdio: "inherit" });
