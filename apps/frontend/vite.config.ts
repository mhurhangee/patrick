import { readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// The product version is owned by the desktop app (it stamps the installer);
// read it here so the in-app version chip never drifts from what shipped.
const appVersion = JSON.parse(
	readFileSync(
		path.resolve(__dirname, "../desktop/src-tauri/tauri.conf.json"),
		"utf8",
	),
).version as string;

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(appVersion),
	},
	plugins: [
		// Must precede the react plugin — generates src/routeTree.gen.ts from src/routes.
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		react(),
		tailwindcss(),
		// pdf.js runtime assets (WASM image decoders, CMaps, fallback fonts) served
		// at /pdfjs/* — needed for scanned/JBIG2 PDFs, CJK text, and missing fonts.
		// stripBase flattens the matched files into dest (no node_modules nesting).
		viteStaticCopy({
			targets: [
				{
					src: "node_modules/pdfjs-dist/wasm/*",
					dest: "pdfjs/wasm",
					rename: { stripBase: true },
				},
				{
					src: "node_modules/pdfjs-dist/cmaps/*",
					dest: "pdfjs/cmaps",
					rename: { stripBase: true },
				},
				{
					src: "node_modules/pdfjs-dist/standard_fonts/*",
					dest: "pdfjs/standard_fonts",
					rename: { stripBase: true },
				},
			],
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
