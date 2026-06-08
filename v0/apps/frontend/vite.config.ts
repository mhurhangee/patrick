import path from "node:path"
import mdx from "@mdx-js/rollup"
import tailwindcss from "@tailwindcss/vite"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import remarkGfm from "remark-gfm"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [
		TanStackRouterVite({ routesDirectory: "./src/routes" }),
		mdx({ remarkPlugins: [remarkGfm] }),
		react(),
		tailwindcss(),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
})
