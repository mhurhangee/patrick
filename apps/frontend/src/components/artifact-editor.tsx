import { DragHandle } from "@tiptap/extension-drag-handle-react"
import Highlight from "@tiptap/extension-highlight"
import Placeholder from "@tiptap/extension-placeholder"
import Subscript from "@tiptap/extension-subscript"
import Superscript from "@tiptap/extension-superscript"
import { TableKit } from "@tiptap/extension-table"
import TextAlign from "@tiptap/extension-text-align"
import Typography from "@tiptap/extension-typography"
import Underline from "@tiptap/extension-underline"
import { EditorContent, useEditor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	Bold,
	GripVertical,
	Highlighter,
	Italic,
	List,
	ListOrdered,
	Redo,
	Strikethrough,
	Subscript as SubscriptIcon,
	Superscript as SuperscriptIcon,
	Table as TableIcon,
	UnderlineIcon,
	Undo,
} from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { type ApiAsset, api } from "@/lib/api"
import { cn } from "@/lib/utils"

import "./artifact-editor.css"

const SAVE_DELAY_MS = 600

type SaveState = "saved" | "saving" | "unsaved"

function getHeadingValue(editor: ReturnType<typeof useEditor>): string {
	if (!editor) return "paragraph"
	if (editor.isActive("heading", { level: 1 })) return "h1"
	if (editor.isActive("heading", { level: 2 })) return "h2"
	if (editor.isActive("heading", { level: 3 })) return "h3"
	return "paragraph"
}

export function ArtifactEditor({
	asset,
	onSaved,
}: {
	asset: ApiAsset
	onSaved: (updated: ApiAsset) => void
}) {
	const [saveState, setSaveState] = React.useState<SaveState>("saved")
	const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const latestContent = React.useRef(asset.content)

	async function save(content: string) {
		setSaveState("saving")
		const updated = await api.assets.update(asset.id, { content })
		setSaveState("saved")
		onSaved(updated)
	}

	const editor = useEditor({
		extensions: [
			StarterKit,
			Underline,
			Typography,
			Highlight.configure({ multicolor: false }),
			Subscript,
			Superscript,
			TextAlign.configure({ types: ["heading", "paragraph"] }),
			TableKit,
			Placeholder.configure({ placeholder: "Start writing…" }),
		],
		content: asset.content || "",
		onUpdate({ editor }) {
			const html = editor.getHTML()
			latestContent.current = html
			setSaveState("unsaved")
			if (saveTimer.current) clearTimeout(saveTimer.current)
			saveTimer.current = setTimeout(() => {
				saveTimer.current = null
				save(html)
			}, SAVE_DELAY_MS)
		},
	})

	// Flush any pending save on unmount
	// biome-ignore lint/correctness/useExhaustiveDependencies: cleanup only, runs once on unmount
	React.useEffect(() => {
		return () => {
			if (saveTimer.current) {
				clearTimeout(saveTimer.current)
				saveTimer.current = null
				api.assets.update(asset.id, { content: latestContent.current })
			}
		}
	}, [])

	if (!editor) return null

	const headingValue = getHeadingValue(editor)

	function setHeading(value: string) {
		if (!editor) return
		if (value === "paragraph") {
			editor.chain().focus().setParagraph().run()
		} else {
			const level = Number(value.replace("h", "")) as 1 | 2 | 3
			editor.chain().focus().toggleHeading({ level }).run()
		}
	}

	function insertTable() {
		editor
			.chain()
			.focus()
			.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
			.run()
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Toolbar */}
			<div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1">
				<Select value={headingValue} onValueChange={setHeading}>
					<SelectTrigger className="h-7 w-[110px] text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="paragraph">Paragraph</SelectItem>
						<SelectItem value="h1">Heading 1</SelectItem>
						<SelectItem value="h2">Heading 2</SelectItem>
						<SelectItem value="h3">Heading 3</SelectItem>
					</SelectContent>
				</Select>

				<Separator orientation="vertical" className="mx-1 h-5" />

				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleBold().run()}
					className={cn(editor.isActive("bold") && "bg-muted")}
				>
					<Bold size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleItalic().run()}
					className={cn(editor.isActive("italic") && "bg-muted")}
				>
					<Italic size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleUnderline().run()}
					className={cn(editor.isActive("underline") && "bg-muted")}
				>
					<UnderlineIcon size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleStrike().run()}
					className={cn(editor.isActive("strike") && "bg-muted")}
				>
					<Strikethrough size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleHighlight().run()}
					className={cn(editor.isActive("highlight") && "bg-muted")}
				>
					<Highlighter size={13} />
				</Button>

				<Separator orientation="vertical" className="mx-1 h-5" />

				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleSubscript().run()}
					className={cn(editor.isActive("subscript") && "bg-muted")}
				>
					<SubscriptIcon size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleSuperscript().run()}
					className={cn(editor.isActive("superscript") && "bg-muted")}
				>
					<SuperscriptIcon size={13} />
				</Button>

				<Separator orientation="vertical" className="mx-1 h-5" />

				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().setTextAlign("left").run()}
					className={cn(editor.isActive({ textAlign: "left" }) && "bg-muted")}
				>
					<AlignLeft size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().setTextAlign("center").run()}
					className={cn(editor.isActive({ textAlign: "center" }) && "bg-muted")}
				>
					<AlignCenter size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().setTextAlign("right").run()}
					className={cn(editor.isActive({ textAlign: "right" }) && "bg-muted")}
				>
					<AlignRight size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().setTextAlign("justify").run()}
					className={cn(
						editor.isActive({ textAlign: "justify" }) && "bg-muted",
					)}
				>
					<AlignJustify size={13} />
				</Button>

				<Separator orientation="vertical" className="mx-1 h-5" />

				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleBulletList().run()}
					className={cn(editor.isActive("bulletList") && "bg-muted")}
				>
					<List size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleOrderedList().run()}
					className={cn(editor.isActive("orderedList") && "bg-muted")}
				>
					<ListOrdered size={13} />
				</Button>

				<Separator orientation="vertical" className="mx-1 h-5" />

				<Button
					variant="ghost"
					size="icon-xs"
					onClick={insertTable}
					title="Insert table"
				>
					<TableIcon size={13} />
				</Button>

				<Separator orientation="vertical" className="mx-1 h-5" />

				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().undo().run()}
					disabled={!editor.can().undo()}
				>
					<Undo size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().redo().run()}
					disabled={!editor.can().redo()}
				>
					<Redo size={13} />
				</Button>

				<span className="ml-auto text-xs text-muted-foreground">
					{saveState === "saving"
						? "Saving…"
						: saveState === "unsaved"
							? "Unsaved"
							: "Saved"}
				</span>
			</div>

			{/* Bubble menu — appears on text selection */}
			<BubbleMenu
				editor={editor}
				className="flex items-center gap-0.5 rounded-md border bg-popover p-0.5 shadow-md"
			>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleBold().run()}
					className={cn(editor.isActive("bold") && "bg-muted")}
				>
					<Bold size={12} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleItalic().run()}
					className={cn(editor.isActive("italic") && "bg-muted")}
				>
					<Italic size={12} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleUnderline().run()}
					className={cn(editor.isActive("underline") && "bg-muted")}
				>
					<UnderlineIcon size={12} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleHighlight().run()}
					className={cn(editor.isActive("highlight") && "bg-muted")}
				>
					<Highlighter size={12} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => editor.chain().focus().toggleStrike().run()}
					className={cn(editor.isActive("strike") && "bg-muted")}
				>
					<Strikethrough size={12} />
				</Button>
			</BubbleMenu>

			{/* Editor */}
			<div className="relative flex-1 overflow-auto">
				<DragHandle editor={editor} className="drag-handle">
					<GripVertical size={14} className="text-muted-foreground" />
				</DragHandle>
				<EditorContent
					editor={editor}
					className="prose prose-stone dark:prose-invert mx-auto max-w-2xl px-8 py-6 focus:outline-none"
				/>
			</div>
		</div>
	)
}
