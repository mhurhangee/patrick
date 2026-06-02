import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { usePanelRef } from "react-resizable-panels"
import { AppSidebar } from "@/components/app-sidebar"
import { AssetViewer } from "@/components/asset-viewer"
import { ChatMetaDialog } from "@/components/chat-meta-dialog"
import { ChatPanel } from "@/components/chat-panel"
import { OnboardingFlow } from "@/components/onboarding-flow"
import { ProfilePicker } from "@/components/profile-picker"
import { ProjectManagerDialog } from "@/components/project-manager-dialog"
import { SettingsPanel } from "@/components/settings-panel"
import { TutorialOverlay } from "@/components/tutorial-overlay"
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
	const [configReady, setConfigReady] = useState(false)
	const [needsOnboarding, setNeedsOnboarding] = useState(false)

	// Always show the picker — localStorage pre-fills the input but doesn't auto-skip.
	// This gives users a conscious "I'm loading profile X" moment every session,
	// which is important for multi-profile (multi-client) use.
	const initialDir =
		typeof window !== "undefined"
			? (localStorage.getItem("patrickos-config-dir") ?? "")
			: ""

	function switchProfile() {
		localStorage.removeItem("patrickos-config-dir")
		setConfigReady(false)
		setNeedsOnboarding(false)
	}

	if (!configReady) {
		return (
			<ProfilePicker
				initialDir={initialDir}
				onLoad={(dir) => {
					localStorage.setItem("patrickos-config-dir", dir)
					setNeedsOnboarding(false)
					setConfigReady(true)
				}}
				onSetup={(dir) => {
					localStorage.setItem("patrickos-config-dir", dir)
					setNeedsOnboarding(true)
					setConfigReady(true)
				}}
			/>
		)
	}

	return (
		<AIProvider>
			<WorkspaceContent
				needsOnboarding={needsOnboarding}
				onSetupDone={() => setNeedsOnboarding(false)}
				onSwitchProfile={switchProfile}
			/>
		</AIProvider>
	)
}

function WorkspaceContent({
	needsOnboarding,
	onSetupDone,
	onSwitchProfile,
}: {
	needsOnboarding: boolean
	onSetupDone: () => void
	onSwitchProfile: () => void
}) {
	const ai = useAI()
	const project = useProjectState()
	const asset = useAssetState(project.currentProjectId)
	const chat = useChatState(project.currentProjectId)

	const [chatEditId, setChatEditId] = useState<string | null>(null)
	const [chatCollapsed, setChatCollapsed] = useState(false)
	const [projectsOpen, setProjectsOpen] = useState(false)
	const [projectsDefaultPanel, setProjectsDefaultPanel] = useState<
		"empty" | "new"
	>("empty")
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [tutorialOpen, setTutorialOpen] = useState(false)

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
				onRefreshSources={asset.refresh}
				onCreateArtifact={asset.createArtifact}
				onOpenChat={chat.openChat}
				onNewChat={chat.newChat}
				onEditChat={setChatEditId}
				onManageProjects={() => openProjects()}
				onSettingsOpen={() => setSettingsOpen(true)}
				onTutorialOpen={() => setTutorialOpen(true)}
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
				currentProjectPath={project.currentProjectId}
				defaultPanel={projectsDefaultPanel}
				onSelect={project.setCurrentProjectId}
				onCreate={project.createProject}
				onRename={project.renameProject}
				onDelete={project.deleteProject}
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

			{/* Full-screen overlays — rendered last so they sit on top */}
			{needsOnboarding && (
				<OnboardingFlow
					onComplete={async (projectPath) => {
						if (projectPath) await project.createProject(projectPath)
						onSetupDone()
					}}
				/>
			)}
			<SettingsPanel
				open={settingsOpen}
				onClose={() => setSettingsOpen(false)}
				onSwitchProfile={onSwitchProfile}
			/>
			<TutorialOverlay
				open={tutorialOpen}
				onClose={() => setTutorialOpen(false)}
			/>
		</SidebarProvider>
	)
}
