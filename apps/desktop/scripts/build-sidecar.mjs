// Compiles the Bun API into a single binary and names it the way Tauri's
// externalBin/sidecar resolution expects: `binaries/api-<target-triple>(.exe)`.
// Tauri picks the binary whose triple matches the host it's building on, so we
// derive the triple from rustc (the same compiler Tauri's own build uses).
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");
const apiEntry = resolve(desktop, "../api/src/index.ts");
const outDir = resolve(desktop, "src-tauri/binaries");

const triple = execSync("rustc -vV")
	.toString()
	.match(/host:\s*(\S+)/)?.[1];
if (!triple)
	throw new Error("could not read host target triple from `rustc -vV`");
const ext = process.platform === "win32" ? ".exe" : "";
const outfile = resolve(outDir, `api-${triple}${ext}`);

mkdirSync(outDir, { recursive: true });
execFileSync("bun", ["build", apiEntry, "--compile", "--outfile", outfile], {
	stdio: "inherit",
});
console.log(`sidecar → ${outfile}`);
