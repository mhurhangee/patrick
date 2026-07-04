import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@patrick/ui/components/resizable";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { useTheme } from "@/components/theme-provider";
import { AgentChat } from "@/components/workspace/agent-chat";
import { useProfile } from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";
import { applyAppearance } from "@/lib/appearance";
import { LayoutProvider, useLayout } from "@/lib/layout";
import { CitationNavProvider } from "@/lib/search/citation-nav";
import { WorkspaceProvider } from "@/lib/workspace";

export const Route = createFileRoute("/_app")({
	component: AppLayout,
});

// The one shell. It always renders — there is no separate onboarding surface.
// The sidebar and Patrick (chat) are permanent; only the centre panel changes
// (documents, the profile surface, task settings, or an empty state). Patrick is
// mounted across every centre so the agent is present from the first screen.
function AppLayout() {
	useApplyActiveAppearance();
	return (
		<WorkspaceProvider>
			<CitationNavProvider>
				<LayoutProvider>
					<AppShell />
				</LayoutProvider>
			</CitationNavProvider>
		</WorkspaceProvider>
	);
}

/** Apply the active profile's appearance (colour/scale via CSS vars, mode via ThemeProvider). */
function useApplyActiveAppearance() {
	const { activeProfileId } = useActiveProfile();
	const { data: profile } = useProfile(activeProfileId);
	const { setTheme } = useTheme();

	useEffect(() => {
		if (!profile) return;
		applyAppearance(profile.appearance);
		setTheme(profile.appearance.mode);
	}, [profile, setTheme]);
}

function AppShell() {
	const { navRef, setNavCollapsed, chatRef, setChatCollapsed } = useLayout();
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
				onResize={(size) => setNavCollapsed(size.asPercentage === 0)}
			>
				<AppSidebar />
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel id="main" defaultSize="82%">
				<ResizablePanelGroup orientation="horizontal" className="h-full">
					<ResizablePanel id="center" defaultSize="60%" minSize="30%">
						<Outlet />
					</ResizablePanel>
					<ResizableHandle />
					<ResizablePanel
						id="chat"
						panelRef={chatRef}
						defaultSize="40%"
						minSize="20%"
						collapsible
						collapsedSize="0%"
						onResize={(size) => setChatCollapsed(size.asPercentage === 0)}
					>
						<AgentChat />
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
