import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { usePanelRef } from "react-resizable-panels"
import { AppSidebar } from "@/components/app-sidebar"
import { AssetViewer } from "@/components/asset-viewer"
import { ChatMetaDialog } from "@/components/chat-meta-dialog"
import { ChatPanel } from "@/components/chat-panel"
import { EditArtifactDialog } from "@/components/edit-artifact-dialog"
import { EditSourceDialog } from "@/components/edit-source-dialog"
import { NewArtifactDialog } from "@/components/new-artifact-dialog"
import { NewSourceDialog } from "@/components/new-source-dialog"
import { ProjectManagerDialog } from "@/components/project-manager-dialog"
import { SettingsDialog } from "@/components/settings-dialog"
import { Button } from "@/components/ui/button"
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty"
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
	const currentProjectType =
		project.projects.find((p) => p.id === project.currentProjectId)?.type ??
		"us-non-final-oa-response"
	const asset = useAssetState(project.currentProjectId)
	const chat = useChatState(project.currentProjectId)

	// UI
	const [chatEditId, setChatEditId] = useState<string | null>(null)
	const [chatCollapsed, setChatCollapsed] = useState(false)
	const [projectsOpen, setProjectsOpen] = useState(false)
	const [projectsDefaultPanel, setProjectsDefaultPanel] = useState<
		"empty" | "new"
	>("empty")
	const [settingsOpen, setSettingsOpen] = useState(false)

	function openProjects(panel: "empty" | "new" = "empty") {
		setProjectsDefaultPanel(panel)
		setProjectsOpen(true)
	}

	const chatPanelRef = usePanelRef()

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
				activeTabId={asset.activeTab}
				splitView={asset.splitView}
				chats={chat.chats}
				openChatIds={chat.openChatIds}
				activeChatId={chat.activeChatId}
				projects={project.projects}
				projectsLoading={project.projectsLoading}
				currentProjectId={project.currentProjectId}
				onOpen={asset.openAsset}
				onClose={asset.closeTab}
				onEdit={asset.editAsset}
				onAddArtifact={asset.addArtifact}
				onAddSource={asset.addSource}
				onOpenChat={chat.openChat}
				onNewChat={chat.newChat}
				onEditChat={setChatEditId}
				onManageProjects={() => openProjects()}
				onSettingsOpen={() => setSettingsOpen(true)}
				connectedToAI={ai.connectedToAI}
			/>
			<SidebarInset className="flex flex-col overflow-hidden">
				{!project.currentProjectId ? (
					<div className="flex flex-1 items-center justify-center">
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No project selected</EmptyTitle>
								<EmptyDescription>
									Select or create a project to get started.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent className="flex flex-row items-center justify-center gap-2">
								<Button variant="outline" onClick={() => openProjects()}>
									Select
								</Button>
								<Button variant="secondary" onClick={() => openProjects("new")}>
									Create
								</Button>
							</EmptyContent>
						</Empty>
					</div>
				) : (
					<ResizablePanelGroup
						orientation="horizontal"
						className="flex-1 overflow-hidden"
					>
						<ResizablePanel
							defaultSize="60%"
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
							defaultSize="40%"
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
								onOpenAsset={asset.selectTab}
								onOpenSettings={() => setSettingsOpen(true)}
								onChatTitleUpdate={chat.updateChat}
								onMessageSent={chat.incrementMessageCount}
							/>
						</ResizablePanel>
					</ResizablePanelGroup>
				)}
			</SidebarInset>

			<ProjectManagerDialog
				open={projectsOpen}
				onOpenChange={setProjectsOpen}
				projects={project.projects}
				currentProjectId={project.currentProjectId}
				defaultPanel={projectsDefaultPanel}
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

			{/* Source dialogs — split by mode */}
			{asset.sourceDialogAsset ? (
				<EditSourceDialog
					key={asset.sourceDialogAsset.id}
					asset={asset.sourceDialogAsset}
					open={asset.sourceDialogOpen}
					onOpenChange={asset.setSourceDialogOpen}
					projectType={currentProjectType}
					provider={ai.provider}
					apiKey={ai.apiKey}
					model={ai.detailedModel}
					onSaved={asset.onSourceSaved}
					onDeleted={asset.deleteAsset}
				/>
			) : (
				<NewSourceDialog
					open={asset.sourceDialogOpen}
					onOpenChange={asset.setSourceDialogOpen}
					projectId={project.currentProjectId}
					projectType={currentProjectType}
					provider={ai.provider}
					apiKey={ai.apiKey}
					model={ai.detailedModel}
					onCreated={asset.onSourceSaved}
				/>
			)}

			{/* Artifact dialogs — split by mode */}
			{asset.artifactDialogAsset ? (
				<EditArtifactDialog
					key={asset.artifactDialogAsset.id}
					asset={asset.artifactDialogAsset}
					open={asset.artifactDialogOpen}
					onOpenChange={asset.setArtifactDialogOpen}
					projectType={currentProjectType}
					onSaved={asset.onArtifactSaved}
					onDeleted={asset.deleteAsset}
				/>
			) : (
				<NewArtifactDialog
					open={asset.artifactDialogOpen}
					onOpenChange={asset.setArtifactDialogOpen}
					projectId={project.currentProjectId}
					projectType={currentProjectType}
					onCreated={asset.onArtifactSaved}
				/>
			)}

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
