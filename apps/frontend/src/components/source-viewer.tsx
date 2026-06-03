import type { FieldLocation, FieldZone } from "@patrickos/shared"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { useAI } from "@/lib/ai-context"
import { estimatePdfTokens } from "@/lib/ai-models"
import { cn } from "@/lib/utils"

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

function formatTokens(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : `${n}`
}

export type SourceViewerHighlight = {
	page: number
	yStart: number // 0–100, percentage from top of page
	yEnd: number
	active?: boolean // brighter highlight
}

// Map a coarse page zone to a vertical band (percentage from top).
const ZONE_BAND: Record<FieldZone, { yStart: number; yEnd: number }> = {
	top: { yStart: 2, yEnd: 20 },
	"upper-centre": { yStart: 20, yEnd: 40 },
	centre: { yStart: 40, yEnd: 60 },
	"lower-centre": { yStart: 60, yEnd: 80 },
	bottom: { yStart: 80, yEnd: 98 },
}

export function locationsToHighlights(
	locations: FieldLocation[],
	activeIndex?: number,
): SourceViewerHighlight[] {
	return locations.map((l, i) => ({
		page: l.page,
		...ZONE_BAND[l.zone],
		// When an active index is given, only that one is bright; the rest dim.
		active: activeIndex === undefined ? true : i === activeIndex,
	}))
}

export function SourceViewer({
	src,
	jumpToPage,
	highlights = [],
	excludedFromAgent,
	onToggleExclude,
}: {
	src: string | File
	jumpToPage?: number
	highlights?: SourceViewerHighlight[]
	/** When set, shows an AgentPat read/exclude toggle in the toolbar. */
	excludedFromAgent?: boolean
	onToggleExclude?: () => void
}) {
	const { detailedModel } = useAI()
	const [numPages, setNumPages] = useState(0)
	const [pageNumber, setPageNumber] = useState(1)
	const [scalePercent, setScalePercent] = useState(100)
	const [containerWidth, setContainerWidth] = useState<number | undefined>()
	const [pageSize, setPageSize] = useState<{
		width: number
		height: number
	} | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		const el = containerRef.current
		if (!el) return
		const ro = new ResizeObserver(([entry]) => {
			if (resizeTimer.current) clearTimeout(resizeTimer.current)
			resizeTimer.current = setTimeout(() => {
				setContainerWidth(entry.contentRect.width)
			}, 150)
		})
		ro.observe(el)
		return () => {
			ro.disconnect()
			if (resizeTimer.current) clearTimeout(resizeTimer.current)
		}
	}, [])

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on src change
	useEffect(() => {
		setPageNumber(1)
		setNumPages(0)
		setPageSize(null)
	}, [src])

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on page change, pageNumber not used in body
	useEffect(() => {
		setPageSize(null)
	}, [pageNumber])

	// External page jump
	useEffect(() => {
		if (jumpToPage && jumpToPage >= 1 && jumpToPage <= numPages) {
			setPageNumber(jumpToPage)
		}
	}, [jumpToPage, numPages])

	const pageHighlights = highlights.filter((h) => h.page === pageNumber)

	return (
		<div className="@container relative flex h-full flex-col overflow-hidden">
			<div ref={containerRef} className="flex-1 overflow-auto">
				<Document
					file={src}
					onLoadSuccess={({ numPages }) => setNumPages(numPages)}
					className="flex flex-col items-center gap-4 py-4"
				>
					<div
						className="relative"
						style={
							pageSize
								? { width: pageSize.width, height: pageSize.height }
								: undefined
						}
					>
						<Page
							pageNumber={pageNumber}
							scale={scalePercent / 100}
							width={containerWidth ? containerWidth - 48 : undefined}
							renderTextLayer
							renderAnnotationLayer
							onRenderSuccess={({ width, height }) =>
								setPageSize({ width, height })
							}
						/>
						{pageSize &&
							pageHighlights.map((h, i) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: highlight list is stable per render
									key={i}
									className={cn(
										"absolute inset-x-0 pointer-events-none rounded-sm",
										h.active ? "bg-amber-400/50" : "bg-amber-300/25",
									)}
									style={{
										top: `${h.yStart}%`,
										height: `${h.yEnd - h.yStart}%`,
									}}
								/>
							))}
					</div>
				</Document>
			</div>

			{/* Floating toolbar — a pill centred near the bottom, over the content */}
			<div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-2 py-1 shadow-lg backdrop-blur">
				<Button
					variant="ghost"
					size="icon-xs"
					disabled={pageNumber <= 1}
					onClick={() => setPageNumber((p) => p - 1)}
				>
					<ChevronLeft size={14} />
				</Button>
				<span className="whitespace-nowrap tabular-nums text-xs text-muted-foreground">
					{numPages > 0 ? `${pageNumber} / ${numPages}` : "–"}
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					disabled={pageNumber >= numPages}
					onClick={() => setPageNumber((p) => p + 1)}
				>
					<ChevronRight size={14} />
				</Button>
				{numPages > 0 && (
					<div className="hidden items-center @md:flex">
						<div className="mx-1 h-4 w-px bg-border" />
						<span
							className="tabular-nums text-xs text-muted-foreground"
							title={`Estimated AI context cost: ${numPages} page${numPages === 1 ? "" : "s"} × ~${formatTokens(estimatePdfTokens(1, detailedModel))}/page for the current model. Each open document is re-sent every turn.`}
						>
							~{formatTokens(estimatePdfTokens(numPages, detailedModel))} tok
						</span>
					</div>
				)}
				<div className="mx-1 h-4 w-px bg-border" />
				<span className="w-8 text-right tabular-nums text-xs text-muted-foreground">
					{scalePercent}%
				</span>
				<Slider
					min={50}
					max={200}
					step={10}
					value={[scalePercent]}
					onValueChange={([v]) => setScalePercent(v)}
					className="w-24"
				/>
				{onToggleExclude && (
					<>
						<div className="mx-1 h-4 w-px bg-border" />
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={onToggleExclude}
							title={
								excludedFromAgent
									? "Excluded from AgentPat — click to include"
									: "Read by AgentPat — click to exclude"
							}
							className={excludedFromAgent ? "text-amber-600" : undefined}
						>
							{excludedFromAgent ? <EyeOff size={14} /> : <Eye size={14} />}
						</Button>
					</>
				)}
			</div>
		</div>
	)
}
