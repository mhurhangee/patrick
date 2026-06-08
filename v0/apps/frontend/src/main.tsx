import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { routeTree } from "./routeTree.gen"
import "./index.css"

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router
	}
}

// biome-ignore lint/style/noNonNullAssertion: root element always exists in index.html
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ThemeProvider>
			<TooltipProvider>
				<RouterProvider router={router} />
				<Toaster richColors position="bottom-right" />
			</TooltipProvider>
		</ThemeProvider>
	</StrictMode>,
)
