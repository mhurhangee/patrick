"use client"

import { AIChatPlugin } from "@platejs/ai/react"
import {
	BLOCK_CONTEXT_MENU_ID,
	BlockMenuPlugin,
	BlockSelectionPlugin,
} from "@platejs/selection/react"
import {
	AlignCenterIcon,
	AlignLeftIcon,
	AlignRightIcon,
	ArrowDownToLineIcon,
	ArrowUpToLineIcon,
	CopyIcon,
	IndentIcon,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react"
import { KEYS, PathApi } from "platejs"
import {
	useEditorPlugin,
	useEditorReadOnly,
	usePluginOption,
} from "platejs/react"
import * as React from "react"
import { setBlockType } from "@/components/editor/transforms"
import { turnIntoItems } from "@/components/ui/turn-into-toolbar-button"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useIsTouchDevice } from "@/hooks/use-is-touch-device"

type Value = "askAI" | null

export function BlockContextMenu({ children }: { children: React.ReactNode }) {
	const { api, editor } = useEditorPlugin(BlockMenuPlugin)
	const [value, setValue] = React.useState<Value>(null)
	const isTouch = useIsTouchDevice()
	const readOnly = useEditorReadOnly()
	const openId = usePluginOption(BlockMenuPlugin, "openId")
	const isOpen = openId === BLOCK_CONTEXT_MENU_ID

	const handleTurnInto = React.useCallback(
		(type: string) => {
			editor
				.getApi(BlockSelectionPlugin)
				.blockSelection.getNodes()
				.forEach(([, path]) => {
					setBlockType(editor, type, { at: path })
				})
		},
		[editor],
	)

	const handleAlign = React.useCallback(
		(align: "center" | "left" | "right") => {
			editor
				.getTransforms(BlockSelectionPlugin)
				.blockSelection.setNodes({ align })
		},
		[editor],
	)

	const handleInsertAbove = React.useCallback(() => {
		const nodes = editor
			.getApi(BlockSelectionPlugin)
			.blockSelection.getNodes({ sort: true })
		if (nodes.length === 0) return
		const [, firstPath] = nodes[0]
		editor.tf.insertNodes(editor.api.create.block({ type: KEYS.p }), {
			at: firstPath,
			select: true,
		})
	}, [editor])

	const handleInsertBelow = React.useCallback(() => {
		const nodes = editor
			.getApi(BlockSelectionPlugin)
			.blockSelection.getNodes({ sort: true })
		if (nodes.length === 0) return
		const [, lastPath] = nodes[nodes.length - 1]
		editor.tf.insertNodes(editor.api.create.block({ type: KEYS.p }), {
			at: PathApi.next(lastPath),
			select: true,
		})
	}, [editor])

	if (isTouch) {
		return children
	}

	return (
		<ContextMenu
			onOpenChange={(open) => {
				if (!open) {
					api.blockMenu.hide()
				}
			}}
			modal={false}
		>
			<ContextMenuTrigger
				asChild
				onContextMenu={(event) => {
					const dataset = (event.target as HTMLElement).dataset
					const disabled =
						dataset?.slateEditor === "true" ||
						readOnly ||
						dataset?.plateOpenContextMenu === "false"

					if (disabled) return event.preventDefault()

					setTimeout(() => {
						api.blockMenu.show(BLOCK_CONTEXT_MENU_ID, {
							x: event.clientX,
							y: event.clientY,
						})
					}, 0)
				}}
			>
				<div className="w-full">{children}</div>
			</ContextMenuTrigger>

			{isOpen && (
				<ContextMenuContent
					className="w-56"
					onCloseAutoFocus={(e) => {
						e.preventDefault()
						editor.getApi(BlockSelectionPlugin).blockSelection.focus()
						if (value === "askAI") {
							editor.getApi(AIChatPlugin).aiChat.show()
						}
						setValue(null)
					}}
				>
					<ContextMenuGroup>
						<ContextMenuItem onClick={() => setValue("askAI")}>
							<SparklesIcon />
							Ask AI
						</ContextMenuItem>
					</ContextMenuGroup>

					<ContextMenuSeparator />

					<ContextMenuGroup>
						<ContextMenuItem onClick={handleInsertAbove}>
							<ArrowUpToLineIcon />
							Insert above
						</ContextMenuItem>
						<ContextMenuItem onClick={handleInsertBelow}>
							<ArrowDownToLineIcon />
							Insert below
						</ContextMenuItem>
						<ContextMenuItem
							onClick={() =>
								editor
									.getTransforms(BlockSelectionPlugin)
									.blockSelection.duplicate()
							}
						>
							<CopyIcon />
							Duplicate
						</ContextMenuItem>
						<ContextMenuItem
							onClick={() => {
								editor
									.getTransforms(BlockSelectionPlugin)
									.blockSelection.removeNodes()
								editor.tf.focus()
							}}
						>
							<Trash2Icon />
							Delete
						</ContextMenuItem>
					</ContextMenuGroup>

					<ContextMenuSeparator />

					<ContextMenuGroup>
						<ContextMenuSub>
							<ContextMenuSubTrigger>Turn into</ContextMenuSubTrigger>
							<ContextMenuSubContent className="w-48">
								{turnIntoItems.map(({ icon, label, value: type }) => (
									<ContextMenuItem key={type} onClick={() => handleTurnInto(type)}>
										{icon}
										{label}
									</ContextMenuItem>
								))}
							</ContextMenuSubContent>
						</ContextMenuSub>
					</ContextMenuGroup>

					<ContextMenuSeparator />

					<ContextMenuGroup>
						<ContextMenuItem
							onClick={() =>
								editor
									.getTransforms(BlockSelectionPlugin)
									.blockSelection.setIndent(1)
							}
						>
							<IndentIcon />
							Indent
						</ContextMenuItem>
						<ContextMenuItem
							onClick={() =>
								editor
									.getTransforms(BlockSelectionPlugin)
									.blockSelection.setIndent(-1)
							}
						>
							<IndentIcon className="-scale-x-100" />
							Outdent
						</ContextMenuItem>
						<ContextMenuSub>
							<ContextMenuSubTrigger>Align</ContextMenuSubTrigger>
							<ContextMenuSubContent className="w-32">
								<ContextMenuItem onClick={() => handleAlign("left")}>
									<AlignLeftIcon />
									Left
								</ContextMenuItem>
								<ContextMenuItem onClick={() => handleAlign("center")}>
									<AlignCenterIcon />
									Center
								</ContextMenuItem>
								<ContextMenuItem onClick={() => handleAlign("right")}>
									<AlignRightIcon />
									Right
								</ContextMenuItem>
							</ContextMenuSubContent>
						</ContextMenuSub>
					</ContextMenuGroup>
				</ContextMenuContent>
			)}
		</ContextMenu>
	)
}
