import type { ReactNode } from "react";
import { PanelToggleButton } from "@/components/shell/panel-toggle-button";

// A centre-panel surface that isn't the document viewer — the profile surface,
// task settings, the empty states. Just the panel toggles (so a collapsed
// sidebar or chat is never a dead end), then the scrolling content. The surface
// itself supplies its own heading.
export function SurfaceScaffold({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full flex-col bg-muted/30">
			<div className="flex h-9 shrink-0 items-center justify-between px-1">
				<PanelToggleButton side="nav" />
				<PanelToggleButton side="chat" />
			</div>
			<div className="min-h-0 flex-1 overflow-auto">{children}</div>
		</div>
	);
}
