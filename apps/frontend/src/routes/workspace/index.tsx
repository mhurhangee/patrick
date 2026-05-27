import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { usePanelRef } from "react-resizable-panels"
import { AppSidebar } from "@/components/app-sidebar"
import { ArtifactDialog } from "@/components/artifact-dialog"
import { AssetViewer } from "@/components/asset-viewer"
import { ChatMetaDialog } from "@/components/chat-meta-dialog"
import { ChatPanel } from "@/components/chat-panel"
import { ProjectManagerDialog } from "@/components/project-manager-dialog"
import { SettingsDialog } from "@/components/settings-dialog"
import { SourceDialog } from "@/components/source-dialog"
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AIProvider, useAI } from "@/lib/ai-context"
import { useAssetState } from "@/lib/use-asset-state"
import { useChatState } from "@/lib/use-chat-state"
import { useProjectState } from "@/lib/use-project-state"

export const Route = createFileRoute("/workspace/")({
	component: WorkspacePage,
})

function WorkspacePage() {
	return (
		<AIProvider>
			<WorkspaceContent />
		</AIProvider>
	)
}

function WorkspaceContent() {
	const ai = useAI()
	const project = useProjectState()
	const asset = useAssetState(project.currentProjectId)
	const chat = useChatState(project.currentProjectId)

	// UI
	const [chatEditId, setChatEditId] = React.useState<string | null>(null)
	const [chatCollapsed, setChatCollapsed] = React.useState(false)
	const [projectsOpen, setProjectsOpen] = React.useState(false)
	const [settingsOpen, setSettingsOpen] = React.useState(false)

	const chatPanelRef = usePanelRef()

	// ── Panel collapse ────────────────────────────────────────────────────────

	function toggleChat() {
		const panel = chatPanelRef.current
		if (!panel) return
		if (chatCollapsed) {
			panel.expand()
			setChatCollapsed(false)
		} else {
			panel.collapse()
			setChatCollapsed(true)
		}
	}

	return (
		<SidebarProvider className="h-full">
			<AppSidebar
				assets={asset.assets}
				openTabIds={asset.openTabIds}
				chats={chat.chats}
				openChatIds={chat.openChatIds}
				projects={project.projects}
				projectsLoading={project.projectsLoading}
				currentProjectId={project.currentProjectId}
				onOpen={asset.openAsset}
				onEdit={asset.editAsset}
				onAddArtifact={asset.addArtifact}
				onAddSource={asset.addSource}
				onOpenChat={chat.openChat}
				onNewChat={chat.newChat}
				onEditChat={setChatEditId}
				onManageProjects={() => setProjectsOpen(true)}
				onSettingsOpen={() => setSettingsOpen(true)}
				connectedToAI={ai.connectedToAI}
			/>
			<SidebarInset className="flex flex-col overflow-hidden">
				<ResizablePanelGroup
					orientation="horizontal"
					className="flex-1 overflow-hidden"
				>
					<ResizablePanel
						defaultSize="68%"
						minSize="30%"
						collapsible
						collapsedSize="0%"
					>
						<AssetViewer
							assets={asset.assets}
							openTabIds={asset.openTabIds}
							activeTab={asset.activeTab}
							splitView={asset.splitView}
							onTabClick={asset.selectTab}
							onTabClose={asset.closeTab}
							onSplitToggle={asset.toggleSplitView}
							onChatToggle={toggleChat}
							onAssetUpdate={asset.updateAsset}
							chatCollapsed={chatCollapsed}
						/>
					</ResizablePanel>
					<ResizableHandle
						withHandle
						className="w-[3px] before:absolute before:inset-x-1 before:top-0 before:h-10 before:bg-muted before:content-['']"
					/>

					<ResizablePanel
						panelRef={chatPanelRef}
						defaultSize="32%"
						minSize="20%"
						collapsible
						collapsedSize="0%"
						style={{ transition: "flex 150ms ease" }}
					>
						<ChatPanel
							chats={chat.chats}
							openChatIds={chat.openChatIds}
							activeChatId={chat.activeChatId}
							openAssets={asset.openAssets}
							pendingMessages={chat.pendingMessages}
							projectId={project.currentProjectId}
							provider={ai.provider}
							apiKey={ai.apiKey}
							detailedModel={ai.detailedModel}
							onNewChat={chat.newChat}
							onCloseChat={chat.closeChat}
							onSetActiveChat={chat.setActiveChatId}
							onSendInAgentPat={chat.sendInAgentPat}
							onRemoveAsset={asset.closeTab}
							onOpenSettings={() => setSettingsOpen(true)}
						/>
					</ResizablePanel>
				</ResizablePanelGroup>
			</SidebarInset>
			<ProjectManagerDialog
				open={projectsOpen}
				onOpenChange={setProjectsOpen}
				projects={project.projects}
				currentProjectId={project.currentProjectId}
				onSelect={project.setCurrentProjectId}
				onCreate={project.createProject}
				onUpdate={project.updateProject}
				onDelete={project.deleteProject}
			/>
			<SettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				savedProvider={ai.provider}
				keyStatus={ai.keyStatus}
				savedQuickModel={ai.quickModel}
				savedDetailedModel={ai.detailedModel}
				onVerify={ai.verifyKey}
				onSave={ai.saveAiSettings}
				onClear={ai.clearApiKey}
			/>
			<SourceDialog
				asset={asset.sourceDialogAsset}
				open={asset.sourceDialogOpen}
				onOpenChange={asset.setSourceDialogOpen}
				projectId={project.currentProjectId}
				provider={ai.provider}
				apiKey={ai.apiKey}
				model={ai.detailedModel}
				onSaved={asset.onSourceSaved}
				onDeleted={asset.deleteAsset}
			/>
			<ArtifactDialog
				asset={asset.artifactDialogAsset}
				open={asset.artifactDialogOpen}
				onOpenChange={asset.setArtifactDialogOpen}
				projectId={project.currentProjectId}
				onSaved={asset.onArtifactSaved}
				onDeleted={asset.deleteAsset}
			/>
			<ChatMetaDialog
				open={chatEditId !== null}
				chat={
					chatEditId !== null
						? chat.chats.find((c) => c.id === chatEditId)
						: undefined
				}
				onClose={() => setChatEditId(null)}
				onUpdated={chat.updateChat}
				onDeleted={chat.deleteChat}
			/>
		</SidebarProvider>
	)
}
