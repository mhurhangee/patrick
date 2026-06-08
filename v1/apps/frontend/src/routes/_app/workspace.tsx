import { createFileRoute } from "@tanstack/react-router";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AgentChat } from "@/components/workspace/agent-chat";
import { DocumentViewer } from "@/components/workspace/document-viewer";

export const Route = createFileRoute("/_app/workspace")({
	component: Workspace,
});

function Workspace() {
	return (
		<ResizablePanelGroup orientation="horizontal" className="h-full">
			<ResizablePanel id="viewer" defaultSize="60%" minSize="30%">
				<DocumentViewer />
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel id="chat" defaultSize="40%" minSize="20%" collapsible>
				<AgentChat />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
