import { Image, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Slide definitions ────────────────────────────────────────────────────────

type Slide = {
	id: string
	navLabel: string
	title: string
	description: string
	/** Text shown inside the placeholder box describing what the screenshot will show. */
	screenshotHint: string
	/** Optional path to the actual screenshot once available. */
	screenshotSrc?: string
	bullets: string[]
}

export const SLIDES: Slide[] = [
	{
		id: "tasks",
		navLabel: "Tasks",
		title: "A task is a folder",
		description:
			"PatrickOS works with folders you already have — no import, no upload. Point it at a task folder and everything inside becomes available. Your files are never modified.",
		screenshotHint:
			"Sidebar showing a task selected with the file tree visible — sources (PDFs, Word docs) listed under the task name",
		bullets: [
			"Sources are existing files — PDFs, Word documents, anything in your folder",
			"PatrickOS creates chats/, artifacts/, and extractions/ subfolders for its own output",
			"Switch between tasks from the sidebar — each is a separate folder",
		],
	},
	{
		id: "sources",
		navLabel: "Sources",
		title: "Sources are your existing files",
		description:
			"PDFs and Word documents in your task folder appear as sources in the sidebar. PatrickOS reads them for context — the originals are never touched.",
		screenshotHint:
			"A PDF open in the document viewer panel, showing the source file with page navigation controls",
		bullets: [
			"Click a source to open it in the viewer",
			"PDFs render natively — no conversion, no upload",
			"Add per-source notes that always travel with the document",
		],
	},
	{
		id: "context",
		navLabel: "Context",
		title: "Open files = AgentPat's context",
		description:
			"Whatever you have open in the viewer is what AgentPat can see and reason about. Open a file to add it to context; close it to remove it.",
		screenshotHint:
			"Multiple source tabs open in the viewer, with the AgentPat chat panel visible on the right — showing how open files feed into the conversation",
		bullets: [
			"Open multiple files to give AgentPat broader context",
			"PDFs are injected as native file parts — AgentPat reads the actual content",
			"Context is explicit: you control exactly what the AI sees",
		],
	},
	{
		id: "agentpat",
		navLabel: "AgentPat",
		title: "Chat with your task",
		description:
			"AgentPat is your task-aware research assistant. Ask it anything about the open documents, request a draft response strategy, or get a summary of cited prior art.",
		screenshotHint:
			"AgentPat chat panel showing a conversation — a question about an office action and a detailed response citing specific claims from the open source files",
		bullets: [
			"AgentPat sees all open source files as context",
			"Ask for response strategies, prior art summaries, or claim analysis",
			"Conversations are saved as JSON in chats/ — readable without the app",
		],
	},
	{
		id: "artifacts",
		navLabel: "Artifacts",
		title: "AI-drafted documents as artifacts",
		description:
			"When AgentPat drafts a document, it's saved as an artifact. Artifacts open in the Plate editor where you can refine them with AskPat.",
		screenshotHint:
			"Plate editor open with a draft response artifact, showing the rich text editor with the AskPat toolbar available for in-editor AI assistance",
		bullets: [
			"Artifacts are saved as .docx in artifacts/ — open in Word at any time",
			"Use AskPat inside the editor to strengthen arguments or reformat text",
			"Export a finished artifact to file with the USPTO or send to a client",
		],
	},
]

// ─── Placeholder image ────────────────────────────────────────────────────────

export function ScreenshotPlaceholder({
	hint,
	src,
	alt,
}: {
	hint: string
	src?: string
	alt: string
}) {
	if (src) {
		return (
			<img
				src={src}
				alt={alt}
				className="w-full rounded-lg border object-cover shadow-sm"
			/>
		)
	}

	return (
		<div className="aspect-video w-full rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30 flex flex-col items-center justify-center gap-3 px-6">
			<Image size={28} className="text-muted-foreground/30" strokeWidth={1.5} />
			<p className="text-xs text-muted-foreground/50 text-center leading-relaxed max-w-sm">
				{hint}
			</p>
		</div>
	)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TutorialOverlay({
	open,
	onClose,
}: {
	open: boolean
	onClose: () => void
}) {
	const [activeId, setActiveId] = useState(SLIDES[0].id)
	const activeIndex = SLIDES.findIndex((s) => s.id === activeId)
	const slide = SLIDES[activeIndex]

	function goTo(id: string) {
		setActiveId(id)
	}
	function goPrev() {
		if (activeIndex > 0) setActiveId(SLIDES[activeIndex - 1].id)
	}
	function goNext() {
		if (activeIndex < SLIDES.length - 1) setActiveId(SLIDES[activeIndex + 1].id)
	}

	return (
		<div
			className={cn(
				"fixed inset-0 z-50 bg-background flex transition-opacity duration-200",
				open ? "opacity-100" : "opacity-0 pointer-events-none",
			)}
		>
			{/* Sidebar nav */}
			<div className="w-44 border-r flex flex-col shrink-0">
				<div className="px-5 py-4 border-b">
					<p className="text-sm font-semibold font-heading">How it works</p>
				</div>
				<nav className="flex-1 p-2 overflow-y-auto">
					{SLIDES.map((s, i) => (
						<button
							key={s.id}
							type="button"
							onClick={() => goTo(s.id)}
							className={cn(
								"w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center gap-2",
								s.id === activeId
									? "bg-accent text-accent-foreground font-medium"
									: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
							)}
						>
							<span
								className={cn(
									"text-xs tabular-nums w-4 shrink-0",
									s.id === activeId
										? "text-primary"
										: "text-muted-foreground/50",
								)}
							>
								{i + 1}
							</span>
							{s.navLabel}
						</button>
					))}
				</nav>
			</div>

			{/* Content */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{/* Top bar */}
				<div className="flex items-center justify-between border-b px-6 py-2 shrink-0">
					<p className="text-sm font-semibold font-heading">How it works</p>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onClose}
							className="text-muted-foreground"
						>
							Skip
						</Button>
						<Button type="button" variant="ghost" size="icon" onClick={onClose}>
							<X size={16} />
						</Button>
					</div>
				</div>

				{/* Slide content */}
				<div className="flex-1 overflow-y-auto px-10 py-8">
					<div className="mx-auto max-w-2xl space-y-6">
						<ScreenshotPlaceholder
							hint={slide.screenshotHint}
							src={slide.screenshotSrc}
							alt={slide.title}
						/>

						<div className="space-y-2">
							<h2 className="text-xl font-semibold font-heading tracking-tight">
								{slide.title}
							</h2>
							<p className="text-sm text-muted-foreground leading-relaxed">
								{slide.description}
							</p>
						</div>

						<ul className="space-y-2">
							{slide.bullets.map((b) => (
								<li key={b} className="flex items-start gap-2 text-sm">
									<span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
									{b}
								</li>
							))}
						</ul>
					</div>
				</div>

				{/* Navigation */}
				<div className="shrink-0 border-t px-10 py-3 flex items-center justify-between">
					<Button
						type="button"
						variant="outline"
						onClick={goPrev}
						disabled={activeIndex === 0}
					>
						← Previous
					</Button>
					<span className="text-xs text-muted-foreground tabular-nums">
						{activeIndex + 1} / {SLIDES.length}
					</span>
					{activeIndex < SLIDES.length - 1 ? (
						<Button type="button" onClick={goNext}>
							Next →
						</Button>
					) : (
						<Button type="button" variant="outline" onClick={onClose}>
							Done
						</Button>
					)}
				</div>
			</div>
		</div>
	)
}
