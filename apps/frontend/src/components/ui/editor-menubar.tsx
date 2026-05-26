"use client"

import { AIChatPlugin } from "@platejs/ai/react"
import { exportToDocx, importDocx } from "@platejs/docx-io"
import { MarkdownPlugin } from "@platejs/markdown"
import { SuggestionPlugin } from "@platejs/suggestion/react"
import {
	Clover,
	Code2Icon,
	EyeIcon,
	FileIcon,
	FileTextIcon,
	FolderOpenIcon,
	HashIcon,
	LayoutIcon,
	MessageSquareTextIcon,
	PencilIcon,
	PencilLineIcon,
	PenIcon,
	Redo2Icon,
	Undo2Icon,
} from "lucide-react"
import type { SlatePlugin } from "platejs"
import { createSlateEditor } from "platejs"
import {
	useEditorPlugin,
	useEditorReadOnly,
	useEditorRef,
	useEditorSelector,
	usePluginOption,
} from "platejs/react"
import { getEditorDOMFromHtmlString, serializeHtml } from "platejs/static"
import { useFilePicker } from "use-file-picker"

import { BaseEditorKit } from "@/components/editor/editor-base-kit"
import { commentPlugin } from "@/components/editor/plugins/comment-kit"
import { DocxExportKit } from "@/components/editor/plugins/docx-export-kit"
import { Button } from "@/components/ui/button"
import {
	Menubar,
	MenubarContent,
	MenubarItem,
	MenubarMenu,
	MenubarRadioGroup,
	MenubarRadioItem,
	MenubarSeparator,
	MenubarShortcut,
	MenubarTrigger,
} from "@/components/ui/menubar"
import { useAI } from "@/lib/ai-context"
import { EditorStatic } from "./editor-static"

export function EditorMenubar() {
	const editor = useEditorRef()
	const readOnly = useEditorReadOnly()
	const undoDisabled = useEditorSelector(
		(e) => e.history.undos.length === 0,
		[],
	)
	const redoDisabled = useEditorSelector(
		(e) => e.history.redos.length === 0,
		[],
	)
	const { api: aiApi } = useEditorPlugin(AIChatPlugin)
	const { connectedToAI } = useAI()
	const isSuggesting = usePluginOption(SuggestionPlugin, "isSuggesting")

	const currentMode = readOnly
		? "viewing"
		: isSuggesting
			? "suggestion"
			: "editing"

	const handleModeChange = (value: string) => {
		if (value === "viewing") {
			editor.store.setReadOnly(true)
			return
		}
		editor.store.setReadOnly(false)
		editor.setOption(SuggestionPlugin, "isSuggesting", value === "suggestion")
		if (value === "editing") editor.tf.focus()
	}

	// Import file pickers
	const { openFilePicker: openHtmlPicker } = useFilePicker({
		accept: ["text/html"],
		multiple: false,
		onFilesSelected: async ({ plainFiles }) => {
			const text = await plainFiles[0].text()
			const editorNode = getEditorDOMFromHtmlString(text)
			const nodes = editor.api.html.deserialize({ element: editorNode })
			editor.tf.insertNodes(nodes)
		},
	})

	const { openFilePicker: openMdPicker } = useFilePicker({
		accept: [".md", ".mdx"],
		multiple: false,
		onFilesSelected: async ({ plainFiles }) => {
			const text = await plainFiles[0].text()
			const nodes = editor.getApi(MarkdownPlugin).markdown.deserialize(text)
			editor.tf.insertNodes(nodes)
		},
	})

	const { openFilePicker: openDocxPicker } = useFilePicker({
		accept: [".docx"],
		multiple: false,
		onFilesSelected: async ({ plainFiles }) => {
			const arrayBuffer = await plainFiles[0].arrayBuffer()
			const result = await importDocx(editor, arrayBuffer)
			editor.tf.insertNodes(result.nodes as typeof editor.children)
		},
	})

	// Export helpers
	const downloadFile = async (url: string, filename: string) => {
		const response = await fetch(url)
		const blob = await response.blob()
		const blobUrl = window.URL.createObjectURL(blob)
		const link = document.createElement("a")
		link.href = blobUrl
		link.download = filename
		document.body.append(link)
		link.click()
		link.remove()
		window.URL.revokeObjectURL(blobUrl)
	}

	const exportToHtml = async () => {
		const editorStatic = createSlateEditor({
			plugins: BaseEditorKit,
			value: editor.children,
		})
		const editorHtml = await serializeHtml(editorStatic, {
			editorComponent: EditorStatic,
			props: { style: { padding: "0 calc(50% - 350px)", paddingBottom: "" } },
		})
		const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body>${editorHtml}</body></html>`
		await downloadFile(
			`data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
			"document.html",
		)
	}

	const exportToMarkdown = async () => {
		const md = editor.getApi(MarkdownPlugin).markdown.serialize()
		await downloadFile(
			`data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`,
			"document.md",
		)
	}

	const exportToWord = async () => {
		const blob = await exportToDocx(editor.children, {
			editorPlugins: [...BaseEditorKit, ...DocxExportKit] as SlatePlugin[],
		})
		const url = URL.createObjectURL(blob)
		const link = document.createElement("a")
		link.href = url
		link.download = "document.docx"
		document.body.append(link)
		link.click()
		link.remove()
		URL.revokeObjectURL(url)
	}

	const exportToPdf = async () => {
		const { default: html2canvas } = await import("html2canvas-pro")
		const canvas = await html2canvas(editor.api.toDOMNode(editor)!)
		const PDFLib = await import("pdf-lib")
		const pdfDoc = await PDFLib.PDFDocument.create()
		const page = pdfDoc.addPage([canvas.width, canvas.height])
		const imageEmbed = await pdfDoc.embedPng(canvas.toDataURL("PNG"))
		const { height, width } = imageEmbed.scale(1)
		page.drawImage(imageEmbed, { height, width, x: 0, y: 0 })
		const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true })
		await downloadFile(pdfBase64, "document.pdf")
	}

	return (
		<div className="scrollbar-hide sticky top-0 left-0 z-50 flex w-full items-center justify-between rounded-t-lg border-b border-border bg-background/95 px-1 py-0.5 backdrop-blur-sm supports-backdrop-blur:bg-background/60">
			<Menubar className="h-auto rounded-none border-0 bg-transparent p-0 shadow-none">
				{!readOnly && (
					<>
						<MenubarMenu>
							<MenubarTrigger>
								<FolderOpenIcon className="mr-1 size-3.5" />
								File
							</MenubarTrigger>
							<MenubarContent>
								<MenubarItem onSelect={() => openHtmlPicker()}>
									<Code2Icon />
									Import from HTML
								</MenubarItem>
								<MenubarItem onSelect={() => openMdPicker()}>
									<HashIcon />
									Import from Markdown
								</MenubarItem>
								<MenubarItem onSelect={() => openDocxPicker()}>
									<FileTextIcon />
									Import from Word
								</MenubarItem>
								<MenubarSeparator />
								<MenubarItem onSelect={exportToHtml}>
									<Code2Icon />
									Export as HTML
								</MenubarItem>
								<MenubarItem onSelect={exportToPdf}>
									<FileIcon />
									Export as PDF
								</MenubarItem>
								<MenubarItem onSelect={exportToMarkdown}>
									<HashIcon />
									Export as Markdown
								</MenubarItem>
								<MenubarItem onSelect={exportToWord}>
									<FileTextIcon />
									Export as Word
								</MenubarItem>
							</MenubarContent>
						</MenubarMenu>

						<MenubarMenu>
							<MenubarTrigger>
								<PencilIcon className="mr-1 size-3.5" />
								Edit
							</MenubarTrigger>
							<MenubarContent>
								<MenubarItem
									disabled={undoDisabled}
									onSelect={() => editor.undo()}
								>
									<Undo2Icon />
									Undo
									<MenubarShortcut>⌘Z</MenubarShortcut>
								</MenubarItem>
								<MenubarItem
									disabled={redoDisabled}
									onSelect={() => editor.redo()}
								>
									<Redo2Icon />
									Redo
									<MenubarShortcut>⌘⇧Z</MenubarShortcut>
								</MenubarItem>
							</MenubarContent>
						</MenubarMenu>
					</>
				)}

				<MenubarMenu>
					<MenubarTrigger>
						<LayoutIcon className="mr-1 size-3.5" />
						View
					</MenubarTrigger>
					<MenubarContent>
						<MenubarRadioGroup
							value={currentMode}
							onValueChange={handleModeChange}
						>
							<MenubarRadioItem value="editing">
								<PenIcon />
								Editing
							</MenubarRadioItem>
							<MenubarRadioItem value="viewing">
								<EyeIcon />
								Viewing
							</MenubarRadioItem>
							<MenubarRadioItem value="suggestion">
								<PencilLineIcon />
								Suggestion
							</MenubarRadioItem>
						</MenubarRadioGroup>
					</MenubarContent>
				</MenubarMenu>
			</Menubar>

			<div className="flex items-center gap-0.5">
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2"
					onClick={() => editor.getTransforms(commentPlugin).comment.setDraft()}
					data-plate-prevent-overlay
				>
					<MessageSquareTextIcon className="size-4" />
				</Button>
				{!readOnly && (
					<Button
						variant="default"
						size="sm"
						className="h-7 gap-1.5 px-2 text-sm cursor-pointer hover:bg-primary/90"
						disabled={!connectedToAI}
						title={!connectedToAI ? "Add an API key in Settings to use AskPat" : undefined}
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => aiApi.aiChat.show()}
					>
						<Clover className="size-4" />
						<span className="hidden lg:inline">AskPat</span>
					</Button>
				)}
			</div>
		</div>
	)
}
