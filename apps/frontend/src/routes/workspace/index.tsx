import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { usePanelRef } from "react-resizable-panels"
import { AppSidebar } from "@/components/app-sidebar"
import { AssetViewer } from "@/components/asset-viewer"
import { ChatMetaDialog } from "@/components/chat-meta-dialog"
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
import { analysisIdFor, useAssetState } from "@/lib/use-asset-state"
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

	const [chatEditId, setChatEditId] = useState<string | null>(null)
	const [chatCollapsed, setChatCollapsed] = useState(false)
	const [tasksOpen, setTasksOpen] = useState(false)
	const [tasksDefaultPanel, setTasksDefaultPanel] = useState<"empty" | "new">(
		"empty",
	)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [tutorialOpen, setTutorialOpen] = useState(false)

	// Open a source's Analysis tab (used by the sidebar icon and the Review button)
	function openAnalysis(sourceId: string) {
		asset.openAsset(analysisIdFor(sourceId))
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
				analysedFilenames={asset.analysedFilenames}
				excludedIds={asset.doNotRead}
				onToggleDoNotRead={asset.toggleDoNotRead}
				onOpen={asset.openAsset}
				onOpenAnalysis={openAnalysis}
				onClose={asset.closeTab}
				onRefreshSources={asset.refresh}
				onCreateArtifact={asset.createArtifact}
				onOpenChat={chat.openChat}
				onNewChat={chat.newChat}
				onEditChat={setChatEditId}
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
								onAnalysed={asset.refresh}
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
									if (src) openAnalysis(src.id)
								}}
								onAnalysed={asset.refresh}
								onOpenSettings={() => setSettingsOpen(true)}
								onMessageSent={chat.incrementMessageCount}
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
