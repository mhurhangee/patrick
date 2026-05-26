import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { usePanelRef } from "react-resizable-panels"
import { AppSidebar } from "@/components/app-sidebar"
import { ArtifactDialog } from "@/components/artifact-dialog"
import { AssetViewer } from "@/components/asset-viewer"
import { ChatMetaDialog } from "@/components/chat-meta-dialog"
import { type Chat, ChatPanel } from "@/components/chat-panel"
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

	// Chats
	const [chats, setChats] = React.useState<Chat[]>([])
	const [openChatIds, setOpenChatIds] = React.useState<string[]>([])
	const [activeChatId, setActiveChatId] = React.useState("agentpat")
	const [chatEditId, setChatEditId] = React.useState<string | null>(null)

	// UI
	const [chatCollapsed, setChatCollapsed] = React.useState(false)
	const [projectsOpen, setProjectsOpen] = React.useState(false)
	const [settingsOpen, setSettingsOpen] = React.useState(false)

	const chatPanelRef = usePanelRef()

	// ── Chat handlers ─────────────────────────────────────────────────────────

	function openChat(id: string) {
		setOpenChatIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
		setActiveChatId(id)
	}

	function closeChat(id: string) {
		setOpenChatIds((prev) => {
			const next = prev.filter((c) => c !== id)
			if (activeChatId === id) setActiveChatId(next.at(-1) ?? "agentpat")
			return next
		})
	}

	function newChat() {
		const chat: Chat = {
			id: crypto.randomUUID(),
			title: "New Chat",
			messages: [],
			createdAt: new Date(),
		}
		setChats((prev) => [chat, ...prev])
		openChat(chat.id)
	}

	function deleteChat(id: string) {
		setChats((prev) => prev.filter((c) => c.id !== id))
		closeChat(id)
	}

	function updateChat(id: string, title: string) {
		setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
	}

	function sendInAgentPat(message: string) {
		const chat: Chat = {
			id: crypto.randomUUID(),
			title: message.length > 50 ? `${message.slice(0, 50)}…` : message,
			messages: [
				{ id: crypto.randomUUID(), role: "user", content: message },
				{
					id: crypto.randomUUID(),
					role: "assistant",
					content: "On it. I'll start working through this now.",
				},
			],
			createdAt: new Date(),
		}
		setChats((prev) => [chat, ...prev])
		openChat(chat.id)
	}

	function sendToChat(chatId: string, message: string) {
		setChats((prev) =>
			prev.map((c) =>
				c.id === chatId
					? {
							...c,
							messages: [
								...c.messages,
								{
									id: crypto.randomUUID(),
									role: "user" as const,
									content: message,
								},
								{
									id: crypto.randomUUID(),
									role: "assistant" as const,
									content: "Got it. Working on a response now.",
								},
							],
						}
					: c,
			),
		)
	}

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
				chats={chats}
				openChatIds={openChatIds}
				projects={project.projects}
				projectsLoading={project.projectsLoading}
				currentProjectId={project.currentProjectId}
				onOpen={asset.openAsset}
				onEdit={asset.editAsset}
				onAddArtifact={asset.addArtifact}
				onAddSource={asset.addSource}
				onOpenChat={openChat}
				onNewChat={newChat}
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
					<ResizablePanel defaultSize="68%" minSize="30%">
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
						className="w-[3px] before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-muted before:content-['']"
					/>
					<ResizablePanel
						panelRef={chatPanelRef}
						defaultSize="32%"
						minSize="20%"
						maxSize="50%"
						collapsible
						collapsedSize="0%"
						style={{ transition: "flex 150ms ease" }}
					>
						<ChatPanel
							chats={chats}
							openChatIds={openChatIds}
							activeChatId={activeChatId}
							openAssets={asset.openAssets}
							onNewChat={newChat}
							onCloseChat={closeChat}
							onSetActiveChat={setActiveChatId}
							onSendToChat={sendToChat}
							onSendInAgentPat={sendInAgentPat}
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
						? chats.find((c) => c.id === chatEditId)
						: undefined
				}
				onClose={() => setChatEditId(null)}
				onUpdated={updateChat}
				onDeleted={deleteChat}
			/>
		</SidebarProvider>
	)
}
