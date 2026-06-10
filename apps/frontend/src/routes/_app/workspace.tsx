import { createFileRoute } from "@tanstack/react-router";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AgentChat } from "@/components/workspace/agent-chat";
import { DocumentViewer } from "@/components/workspace/document-viewer";
import { ActiveEditorProvider } from "@/lib/active-editor";
import { useLayout } from "@/lib/layout";

export const Route = createFileRoute("/_app/workspace")({
	component: Workspace,
});

function Workspace() {
	const { chatRef, setChatCollapsed } = useLayout();
	return (
		<ActiveEditorProvider>
			<ResizablePanelGroup orientation="horizontal" className="h-full">
				<ResizablePanel id="viewer" defaultSize="60%" minSize="30%">
					<DocumentViewer />
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel
					id="chat"
					panelRef={chatRef}
					defaultSize="40%"
					minSize="20%"
					collapsible
					collapsedSize="0%"
					onResize={(size) =>
						setChatCollapsed(Number.parseFloat(String(size)) === 0)
					}
				>
					<AgentChat />
				</ResizablePanel>
			</ResizablePanelGroup>
		</ActiveEditorProvider>
	);
}
