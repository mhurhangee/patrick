"use client"

import {
	AIChatPlugin,
	AIPlugin,
	useEditorChat,
	useLastAssistantMessage,
} from "@platejs/ai/react"
import { getTransientCommentKey } from "@platejs/comment"
import { BlockSelectionPlugin, useIsSelecting } from "@platejs/selection/react"
import { getTransientSuggestionKey } from "@platejs/suggestion"
import { Command as CommandPrimitive } from "cmdk"
import {
	BookOpenCheck,
	Check,
	CornerUpLeft,
	FeatherIcon,
	ListMinus,
	Loader2Icon,
	PauseIcon,
	PenLine,
	Wand,
	X,
} from "lucide-react"
import {
	isHotkey,
	KEYS,
	type NodeEntry,
	type SlateEditor,
	TextApi,
} from "platejs"
import {
	type PlateEditor,
	useEditorPlugin,
	useEditorRef,
	useFocusedLast,
	useHotkeys,
	usePluginOption,
} from "platejs/react"
import * as React from "react"
import { commentPlugin } from "@/components/editor/plugins/comment-kit"
import { Button } from "@/components/ui/button"
import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/components/ui/command"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { useAI } from "@/lib/ai-context"
import { AIChatEditor } from "./ai-chat-editor"

export function AIMenu() {
	const { api, editor } = useEditorPlugin(AIChatPlugin)
	const mode = usePluginOption(AIChatPlugin, "mode")
	const toolName = usePluginOption(AIChatPlugin, "toolName")

	const streaming = usePluginOption(AIChatPlugin, "streaming")
	const isSelecting = useIsSelecting()
	const isFocusedLast = useFocusedLast()
	const open = usePluginOption(AIChatPlugin, "open") && isFocusedLast
	const [value, setValue] = React.useState("")

	const [input, setInput] = React.useState("")

	const chat = usePluginOption(AIChatPlugin, "chat")

	const { messages, status } = chat
	const [anchorElement, setAnchorElement] = React.useState<HTMLElement | null>(
		null,
	)

	const content = useLastAssistantMessage()?.parts.find(
		(part) => part.type === "text",
	)?.text

	React.useEffect(() => {
		if (!streaming) return

		const anchorEntry = api.aiChat.node({ anchor: true })
		if (!anchorEntry) return

		const anchorDom = editor.api.toDOMNode(anchorEntry[0])!
		// eslint-disable-next-line react-hooks/set-state-in-effect -- Position the popover from editor DOM while the edit stream is active.
		setAnchorElement(anchorDom)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [streaming])

	const setOpen = (open: boolean) => {
		if (open) {
			api.aiChat.show()
		} else {
			// Don't auto-dismiss (e.g. pointer-outside) when AI content is pending acceptance
			if (messages.length > 0) return
			api.aiChat.hide()
		}
	}

	const show = (anchorElement: HTMLElement) => {
		setAnchorElement(anchorElement)
		setOpen(true)
	}

	useEditorChat({
		onOpenBlockSelection: (blocks: NodeEntry[]) => {
			show(editor.api.toDOMNode(blocks.at(-1)![0])!)
		},
		onOpenChange: (open) => {
			if (!open) {
				setAnchorElement(null)
				setInput("")
			}
		},
		onOpenCursor: () => {
			const [ancestor] = editor.api.block({ highest: true })!

			if (!editor.api.isAt({ end: true }) && !editor.api.isEmpty(ancestor)) {
				editor
					.getApi(BlockSelectionPlugin)
					.blockSelection.set(ancestor.id as string)
			}

			show(editor.api.toDOMNode(ancestor)!)
		},
		onOpenSelection: () => {
			show(editor.api.toDOMNode(editor.api.blocks().at(-1)![0])!)
		},
	})

	useHotkeys("esc", () => {
		if (status !== "streaming" && status !== "submitted" && messages.length > 0) {
			api.aiChat.hide()
		} else {
			api.aiChat.stop()
			;(chat as any)._abortFakeStream()
		}
	})

	const isLoading = status === "streaming" || status === "submitted"

	React.useEffect(() => {
		if (toolName !== "edit" || mode !== "chat" || isLoading) return

		let anchorNode = editor.api.node({
			at: [],
			reverse: true,
			match: (n) => !!n[KEYS.suggestion] && !!n[getTransientSuggestionKey()],
		})

		if (!anchorNode) {
			anchorNode = editor
				.getApi(BlockSelectionPlugin)
				.blockSelection.getNodes({ selectionFallback: true, sort: true })
				.at(-1)
		}

		if (!anchorNode) return

		const block = editor.api.block({ at: anchorNode[1] })
		// eslint-disable-next-line react-hooks/set-state-in-effect -- Position the popover from editor DOM after the edit stream completes.
		setAnchorElement(editor.api.toDOMNode(block![0]!)!)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading])

	// After insert-mode streaming ends the component remounts (it returned null during streaming).
	// Re-anchor the popover to the current block so Radix doesn't treat every click as "outside".
	React.useEffect(() => {
		if (mode !== "insert" || isLoading || !open || messages.length === 0) return
		const block = editor.api.block({ highest: true })
		if (!block) return
		const dom = editor.api.toDOMNode(block[0])
		if (dom) setAnchorElement(dom)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading])

	if (isLoading && mode === "insert") return null

	if (toolName === "comment") return null

	if (toolName === "edit" && mode === "chat" && isLoading) return null

	return (
		<Popover open={open} onOpenChange={setOpen} modal={false}>
			<PopoverAnchor virtualRef={{ current: anchorElement! }} />

			<PopoverContent
				className="border-none bg-transparent p-0 shadow-none"
				style={{
					width: anchorElement?.offsetWidth,
				}}
				onEscapeKeyDown={(e) => {
					e.preventDefault()

					api.aiChat.hide()
				}}
				align="center"
				side="bottom"
			>
				<Command
					className="w-full rounded-lg border shadow-md"
					value={value}
					onValueChange={setValue}
				>
					{mode === "chat" &&
						isSelecting &&
						content &&
						toolName === "generate" && <AIChatEditor content={content} />}

					{isLoading ? (
						<div className="flex grow select-none items-center gap-2 p-2 text-muted-foreground text-sm">
							<Loader2Icon className="size-4 animate-spin" />
							{messages.length > 1 ? "Editing..." : "Thinking..."}
						</div>
					) : (
						<CommandPrimitive.Input
							className={cn(
								"flex h-9 w-full min-w-0 border-input bg-transparent px-3 py-1 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground md:text-sm dark:bg-input/30",
								"aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
								"border-b focus-visible:ring-transparent",
							)}
							value={input}
							onKeyDown={(e) => {
								if (isHotkey("backspace")(e) && input.length === 0) {
									e.preventDefault()
									api.aiChat.hide()
								}
								if (isHotkey("enter")(e) && !e.shiftKey && !value) {
									e.preventDefault()
									void api.aiChat.submit(input)
									setInput("")
								}
							}}
							onValueChange={setInput}
							placeholder="AskPat..."
							data-plate-focus
							autoFocus
						/>
					)}

					{!isLoading && (
						<CommandList>
							<AIMenuItems
								input={input}
								setInput={setInput}
								setValue={setValue}
							/>
						</CommandList>
					)}
				</Command>
			</PopoverContent>
		</Popover>
	)
}

type EditorChatState =
	| "cursorCommand"
	| "cursorSuggestion"
	| "selectionCommand"
	| "selectionSuggestion"


const aiChatItems = {
	// ── Suggestion-state actions (shared) ──────────────────────────────────────
	accept: {
		icon: <Check />,
		label: "Accept",
		value: "accept",
		onSelect: ({ aiEditor, editor }) => {
			const { mode, toolName } = editor.getOptions(AIChatPlugin)
			if (mode === "chat" && toolName === "generate") {
				return editor.getTransforms(AIChatPlugin).aiChat.replaceSelection(aiEditor)
			}
			editor.getTransforms(AIChatPlugin).aiChat.accept()
			editor.tf.focus({ edge: "end" })
		},
	},
	discard: {
		icon: <X />,
		label: "Discard",
		shortcut: "Escape",
		value: "discard",
		onSelect: ({ editor }) => {
			editor.getTransforms(AIPlugin).ai.undo()
			editor.getApi(AIChatPlugin).aiChat.hide()
		},
	},
	tryAgain: {
		icon: <CornerUpLeft />,
		label: "Try again",
		value: "tryAgain",
		onSelect: ({ editor }) => {
			void editor.getApi(AIChatPlugin).aiChat.reload()
		},
	},

	// ── Cursor commands (no selection) ─────────────────────────────────────────
	continueWriting: {
		icon: <PenLine />,
		label: "Continue writing",
		value: "continueWriting",
		onSelect: ({ editor }) => {
			void editor.getApi(AIChatPlugin).aiChat.submit("", {
				mode: "insert",
				prompt: "Continue writing from the current position with one to two sentences.",
				toolName: "generate",
			})
		},
	},
	draftArgument: {
		icon: <FeatherIcon />,
		label: "Draft next argument",
		value: "draftArgument",
		onSelect: ({ editor }) => {
			void editor.getApi(AIChatPlugin).aiChat.submit("", {
				mode: "insert",
				prompt: "Draft the next argument section responding to the outstanding rejection.",
				toolName: "generate",
			})
		},
	},

	// ── Selection commands ──────────────────────────────────────────────────────
	strengthenArgument: {
		icon: <Wand />,
		label: "Strengthen argument",
		value: "strengthenArgument",
		onSelect: ({ editor }) => {
			void editor.getApi(AIChatPlugin).aiChat.submit("", {
				prompt: "Strengthen this argument to be more persuasive and legally precise",
				toolName: "edit",
			})
		},
	},
	makeConcise: {
		icon: <ListMinus />,
		label: "Make concise",
		value: "makeConcise",
		onSelect: ({ editor }) => {
			void editor.getApi(AIChatPlugin).aiChat.submit("", {
				prompt: "Make this more concise without losing substance",
				toolName: "edit",
			})
		},
	},
	formalLanguage: {
		icon: <BookOpenCheck />,
		label: "Formal USPTO language",
		value: "formalLanguage",
		onSelect: ({ editor }) => {
			void editor.getApi(AIChatPlugin).aiChat.submit("", {
				prompt: "Rewrite in formal USPTO correspondence language",
				toolName: "edit",
			})
		},
	},
	fixGrammar: {
		icon: <Check />,
		label: "Fix grammar",
		value: "fixGrammar",
		onSelect: ({ editor }) => {
			void editor.getApi(AIChatPlugin).aiChat.submit("", {
				prompt: "Fix spelling and grammar only, do not change substance",
				toolName: "edit",
			})
		},
	},
	amendClaim: {
		icon: <PenLine />,
		label: "Propose claim amendment",
		value: "amendClaim",
		onSelect: ({ editor }) => {
			void editor.getApi(AIChatPlugin).aiChat.submit("", {
				prompt: "Propose a narrowing amendment to distinguish from the cited prior art",
				toolName: "edit",
			})
		},
	},
} satisfies Record<
	string,
	{
		icon: React.ReactNode
		label: string
		value: string
		shortcut?: string
		onSelect?: ({
			aiEditor,
			editor,
			input,
		}: {
			aiEditor: SlateEditor
			editor: PlateEditor
			input: string
		}) => void
	}
>

const menuStateItems: Record<
	EditorChatState,
	{
		items: (typeof aiChatItems)[keyof typeof aiChatItems][]
		heading?: string
	}[]
> = {
	cursorCommand: [
		{
			items: [aiChatItems.continueWriting, aiChatItems.draftArgument],
		},
	],
	cursorSuggestion: [
		{
			items: [aiChatItems.accept, aiChatItems.discard, aiChatItems.tryAgain],
		},
	],
	selectionCommand: [
		{
			heading: "Edit",
			items: [
				aiChatItems.strengthenArgument,
				aiChatItems.makeConcise,
				aiChatItems.formalLanguage,
				aiChatItems.fixGrammar,
				aiChatItems.amendClaim,
			],
		},
	],
	selectionSuggestion: [
		{
			items: [aiChatItems.accept, aiChatItems.discard, aiChatItems.tryAgain],
		},
	],
}

export const AIMenuItems = ({
	input,
	setInput,
	setValue,
}: {
	input: string
	setInput: (value: string) => void
	setValue: (value: string) => void
}) => {
	const editor = useEditorRef()
	const { messages } = usePluginOption(AIChatPlugin, "chat")
	const aiEditor = usePluginOption(AIChatPlugin, "aiEditor")!
	const isSelecting = useIsSelecting()
	const { connectedToAI } = useAI()

	const menuState = React.useMemo(() => {
		if (messages && messages.length > 0) {
			return isSelecting ? "selectionSuggestion" : "cursorSuggestion"
		}

		return isSelecting ? "selectionCommand" : "cursorCommand"
	}, [isSelecting, messages])

	const menuGroups = React.useMemo(() => {
		const items = menuStateItems[menuState]

		return items
	}, [menuState])

	React.useEffect(() => {
		if (menuGroups.length > 0 && menuGroups[0].items.length > 0) {
			setValue(menuGroups[0].items[0].value)
		}
	}, [menuGroups, setValue])

	if (!connectedToAI) {
		return (
			<CommandGroup>
				<div className="px-3 py-2 text-xs text-muted-foreground">
					Add an API key in Settings to use AskPat.
				</div>
			</CommandGroup>
		)
	}

	return (
		<>
			{menuGroups.map((group, index) => (
				<CommandGroup key={index} heading={group.heading}>
					{group.items.map((menuItem) => (
						<CommandItem
							key={menuItem.value}
							className="[&_svg]:text-muted-foreground"
							value={menuItem.value}
							onSelect={() => {
								menuItem.onSelect?.({
									aiEditor,
									editor,
									input,
								})
								setInput("")
							}}
						>
							{menuItem.icon}
							<span>{menuItem.label}</span>
						</CommandItem>
					))}
				</CommandGroup>
			))}
		</>
	)
}

export function AILoadingBar() {
	const editor = useEditorRef()

	const toolName = usePluginOption(AIChatPlugin, "toolName")
	const chat = usePluginOption(AIChatPlugin, "chat")
	const mode = usePluginOption(AIChatPlugin, "mode")

	const { status } = chat

	const { api } = useEditorPlugin(AIChatPlugin)

	const isLoading = status === "streaming" || status === "submitted"

	const handleComments = (type: "accept" | "reject") => {
		if (type === "accept") {
			editor.tf.unsetNodes([getTransientCommentKey()], {
				at: [],
				match: (n) => TextApi.isText(n) && !!n[KEYS.comment],
			})
		}

		if (type === "reject") {
			editor.getTransforms(commentPlugin).comment.unsetMark({ transient: true })
		}

		api.aiChat.hide()
	}

	useHotkeys("esc", () => {
		api.aiChat.stop()

		// remove when you implement the route /api/ai/command
		;(chat as any)._abortFakeStream()
	})

	if (
		isLoading &&
		(mode === "insert" ||
			toolName === "comment" ||
			(toolName === "edit" && mode === "chat"))
	) {
		return (
			<div
				className={cn(
					"-translate-x-1/2 absolute bottom-4 left-1/2 z-20 flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-1.5 text-muted-foreground text-sm shadow-md transition-all duration-300",
				)}
			>
				<span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
				<span>{status === "submitted" ? "Thinking..." : "Writing..."}</span>
				<Button
					size="sm"
					variant="ghost"
					className="flex items-center gap-1 text-xs"
					onClick={() => api.aiChat.stop()}
				>
					<PauseIcon className="h-4 w-4" />
					Stop
					<kbd className="ml-1 rounded bg-border px-1 font-mono text-[10px] text-muted-foreground shadow-sm">
						Esc
					</kbd>
				</Button>
			</div>
		)
	}

	if (toolName === "comment" && status === "ready") {
		return (
			<div
				className={cn(
					"-translate-x-1/2 absolute bottom-4 left-1/2 z-50 flex flex-col items-center gap-0 rounded-xl border border-border/50 bg-popover p-1 text-muted-foreground text-sm shadow-xl backdrop-blur-sm",
					"p-3",
				)}
			>
				{/* Header with controls */}
				<div className="flex w-full items-center justify-between gap-3">
					<div className="flex items-center gap-5">
						<Button
							size="sm"
							disabled={isLoading}
							onClick={() => handleComments("accept")}
						>
							Accept
						</Button>

						<Button
							size="sm"
							disabled={isLoading}
							onClick={() => handleComments("reject")}
						>
							Reject
						</Button>
					</div>
				</div>
			</div>
		)
	}

	return null
}
