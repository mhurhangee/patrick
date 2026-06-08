import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/shell/app-sidebar";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { LayoutProvider, useLayout } from "@/lib/layout";
import { WorkspaceProvider } from "@/lib/workspace";

export const Route = createFileRoute("/_app")({
	component: AppLayout,
});

function AppLayout() {
	return (
		<WorkspaceProvider>
			<LayoutProvider>
				<AppShell />
			</LayoutProvider>
		</WorkspaceProvider>
	);
}

function AppShell() {
	const { navRef } = useLayout();
	return (
		<ResizablePanelGroup orientation="horizontal" className="h-svh">
			<ResizablePanel
				id="nav"
				panelRef={navRef}
				defaultSize="18%"
				minSize="12%"
				maxSize="28%"
				collapsible
				collapsedSize="0%"
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
