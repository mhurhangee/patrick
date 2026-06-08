import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/shell/app-sidebar";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";

export const Route = createFileRoute("/_app")({
	component: AppLayout,
});

function AppLayout() {
	return (
		<ResizablePanelGroup orientation="horizontal" className="h-svh">
			<ResizablePanel
				id="nav"
				defaultSize="18%"
				minSize="12%"
				maxSize="28%"
				collapsible
			>
				<AppSidebar />
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel id="main" defaultSize="82%">
				<Outlet />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
