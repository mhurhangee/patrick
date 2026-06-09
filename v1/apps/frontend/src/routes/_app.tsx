import {
	createFileRoute,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { PanelToggleButton } from "@/components/shell/panel-toggle-button";
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
import { useWorkspace, WorkspaceProvider } from "@/lib/workspace";

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
	const { navRef, setNavCollapsed } = useLayout();
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
				onResize={(size) =>
					setNavCollapsed(Number.parseFloat(String(size)) === 0)
				}
			>
				<AppSidebar />
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel id="main" defaultSize="82%">
				<div className="relative h-full">
					<Outlet />
					<EdgeToggles />
				</div>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

/** The same toggle buttons as the viewer tab strip, for the spots that lack one
 *  (an empty workspace, /profile) — so a collapsed panel is never a dead end. */
function EdgeToggles() {
	const { columnList } = useWorkspace();
	const onWorkspace = useLocation().pathname.endsWith("/workspace");

	// When the document viewer is showing its own flanking toggles, defer to them.
	if (onWorkspace && columnList.length > 0) return null;

	return (
		<>
			<PanelToggleButton
				side="nav"
				className="absolute top-1.5 left-1.5 z-10"
			/>
			{onWorkspace && (
				<PanelToggleButton
					side="chat"
					className="absolute top-1.5 right-1.5 z-10"
				/>
			)}
		</>
	);
}
