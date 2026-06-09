import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { useTheme } from "@/components/theme-provider";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useProfile } from "@/hooks/use-profiles";
import { getStoredProfileId, useActiveProfile } from "@/lib/active-profile";
import { getStoredTaskId } from "@/lib/active-task";
import { applyAppearance } from "@/lib/appearance";
import { LayoutProvider, useLayout } from "@/lib/layout";
import { WorkspaceProvider } from "@/lib/workspace";

export const Route = createFileRoute("/_app")({
	beforeLoad: () => {
		if (!getStoredProfileId()) throw redirect({ to: "/profiles" });
		if (!getStoredTaskId()) throw redirect({ to: "/tasks" });
	},
	component: AppLayout,
});

function AppLayout() {
	useApplyActiveAppearance();
	return (
		<WorkspaceProvider>
			<LayoutProvider>
				<AppShell />
			</LayoutProvider>
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
