import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/components/theme-provider";
import { routeTree } from "./routeTree.gen";
import "./index.css";
import { TooltipProvider } from "@patrick/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { ActiveChatProvider } from "@/lib/active-chat";
import { ActiveProfileProvider } from "@/lib/active-profile";
import { ActiveTaskProvider } from "@/lib/active-task";
import { queryClient } from "@/lib/query-client";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found");

createRoot(rootElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<ActiveProfileProvider>
				<ActiveTaskProvider>
					<ActiveChatProvider>
						<ThemeProvider>
							<TooltipProvider>
								<RouterProvider router={router} />
							</TooltipProvider>
						</ThemeProvider>
					</ActiveChatProvider>
				</ActiveTaskProvider>
			</ActiveProfileProvider>
		</QueryClientProvider>
	</StrictMode>,
);
