import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

export type SourceViewerHighlight = {
	page: number
	yStart: number // 0–100, percentage from top of page
	yEnd: number
	active?: boolean // brighter highlight
}

export function SourceViewer({
	src,
	jumpToPage,
	highlights = [],
}: {
	src: string | File
	jumpToPage?: number
	highlights?: SourceViewerHighlight[]
}) {
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
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
				<Button
					variant="ghost"
					size="icon-xs"
					disabled={pageNumber <= 1}
					onClick={() => setPageNumber((p) => p - 1)}
				>
					<ChevronLeft size={14} />
				</Button>
				<span className="tabular-nums text-xs text-muted-foreground">
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
				<div className="ml-auto flex items-center gap-3">
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
				</div>
			</div>

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
		</div>
	)
}
