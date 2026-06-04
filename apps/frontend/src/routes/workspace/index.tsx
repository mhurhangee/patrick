import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { usePanelRef } from "react-resizable-panels"
import { AppSidebar } from "@/components/app-sidebar"
import { AssetViewer } from "@/components/asset-viewer"
import { ChatPanel } from "@/components/chat-panel"
import { OnboardingFlow } from "@/components/onboarding-flow"
import { ProfilePicker } from "@/components/profile-picker"
import { SettingsPanel } from "@/components/settings-panel"
import { TaskManagerDialog } from "@/components/task-manager-dialog"
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
import { useTaskState } from "@/lib/use-task-state"

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
	const task = useTaskState()
	const asset = useAssetState(task.currentTaskId)
	const chat = useChatState(task.currentTaskId)

	const [chatCollapsed, setChatCollapsed] = useState(false)
	const [tasksOpen, setTasksOpen] = useState(false)
	const [tasksDefaultPanel, setTasksDefaultPanel] = useState<"empty" | "new">(
		"empty",
	)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [tutorialOpen, setTutorialOpen] = useState(false)

	// Open a source tab in its extraction view (used by the chat Review button)
	function openExtraction(sourceId: string) {
		asset.openAsset(sourceId, "extraction")
	}

	function openTasks(panel: "empty" | "new" = "empty") {
		setTasksDefaultPanel(panel)
		setTasksOpen(true)
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
				tasks={task.tasks}
				tasksLoading={task.tasksLoading}
				currentTaskId={task.currentTaskId}
				excludedIds={asset.doNotRead}
				starredIds={asset.starred}
				onToggleDoNotRead={asset.toggleDoNotRead}
				onToggleStar={asset.toggleStar}
				onOpenExtraction={openExtraction}
				onRenameArtifact={asset.renameArtifact}
				onDeleteArtifact={asset.deleteArtifact}
				onOpen={asset.openAsset}
				onClose={asset.closeTab}
				onRefreshSources={asset.refresh}
				onCreateArtifact={asset.createArtifact}
				onOpenChat={chat.openChat}
				onNewChat={chat.newChat}
				onRenameChat={chat.updateChat}
				onDeleteChat={chat.deleteChat}
				onToggleChatStar={chat.toggleChatStar}
				onManageTasks={() => openTasks()}
				onSettingsOpen={() => setSettingsOpen(true)}
				onTutorialOpen={() => setTutorialOpen(true)}
				connectedToAI={ai.connectedToAI}
			/>
			<SidebarInset className="flex flex-col overflow-hidden">
				{!task.currentTaskId ? (
					<div className="flex flex-1 items-center justify-center">
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No task selected</EmptyTitle>
								<EmptyDescription>
									Select or create a task to get started.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent className="flex flex-row items-center justify-center gap-2">
								<Button variant="outline" onClick={() => openTasks()}>
									Select
								</Button>
								<Button variant="secondary" onClick={() => openTasks("new")}>
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
								tabView={asset.tabView}
								onSetAssetView={asset.setAssetView}
								extractedFilenames={asset.extractedFilenames}
								notedFilenames={asset.notedFilenames}
								onNoted={asset.markNoted}
								onTabClick={asset.selectTab}
								onTabClose={asset.closeTab}
								onOpen={asset.openAsset}
								onSplitToggle={asset.toggleSplitView}
								onChatToggle={toggleChat}
								onAssetUpdate={asset.updateAsset}
								chatCollapsed={chatCollapsed}
								provider={ai.provider}
								apiKey={ai.apiKey}
								model={ai.detailedModel}
								onExtracted={asset.refresh}
								doNotRead={asset.doNotRead}
								onToggleDoNotRead={asset.toggleDoNotRead}
								taskType={
									task.tasks.find((t) => t.path === task.currentTaskId)
										?.taskType
								}
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
								composerFocusNonce={chat.composerFocusNonce}
								taskId={task.currentTaskId}
								provider={ai.provider}
								apiKey={ai.apiKey}
								detailedModel={ai.detailedModel}
								onNewChat={chat.newChat}
								onNewChatWithSummary={chat.newChatWithSummary}
								onForkChat={chat.forkChat}
								onCloseChat={chat.closeChat}
								onSetActiveChat={chat.setActiveChatId}
								onSendInAgentPat={chat.sendInAgentPat}
								onRemoveAsset={asset.closeTab}
								onOpenAsset={asset.selectTab}
								doNotRead={asset.doNotRead}
								onOpenSource={(filename) => {
									const src = asset.assets.find(
										(a) => a.kind === "source" && a.filename === filename,
									)
									if (src) openExtraction(src.id)
								}}
								onExtracted={asset.refresh}
								onOpenSettings={() => setSettingsOpen(true)}
							/>
						</ResizablePanel>
					</ResizablePanelGroup>
				)}
			</SidebarInset>

			<TaskManagerDialog
				open={tasksOpen}
				onOpenChange={setTasksOpen}
				tasks={task.tasks}
				currentTaskPath={task.currentTaskId}
				defaultPanel={tasksDefaultPanel}
				onSelect={task.setCurrentTaskId}
				onCreate={task.createTask}
				onRename={task.renameTask}
				onSetTaskType={task.setTaskType}
				onDelete={task.deleteTask}
			/>

			{/* Full-screen overlays — rendered last so they sit on top */}
			{needsOnboarding && (
				<OnboardingFlow
					onComplete={async (taskPath) => {
						if (taskPath) await task.createTask(taskPath)
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
