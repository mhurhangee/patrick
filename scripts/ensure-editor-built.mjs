#!/usr/bin/env node
// The vendored docx editor is consumed from source (TS/TSX) — there is no JS
// build. The one generated artifact is the editor's Tailwind stylesheet
// (packages/docx-editor-react/dist/styles.css). This guard builds it only when
// it's missing (fresh checkout / wiped dist); a cheap stat check otherwise.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sentinel = "packages/docx-editor-react/dist/styles.css";

if (existsSync(resolve(root, sentinel))) process.exit(0);

console.log("[ensure-editor-built] building the editor stylesheet…");
execSync("pnpm build:editor", { cwd: root, stdio: "inherit" });
