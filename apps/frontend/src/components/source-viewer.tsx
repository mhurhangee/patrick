import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

export function SourceViewer({ src }: { src: string }) {
	const [numPages, setNumPages] = useState(0)
	const [pageNumber, setPageNumber] = useState(1)
	const [scalePercent, setScalePercent] = useState(100)
	const [containerWidth, setContainerWidth] = useState<number | undefined>()
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
	}, [src])

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
					<Page
						pageNumber={pageNumber}
						scale={scalePercent / 100}
						width={containerWidth ? containerWidth - 48 : undefined}
						renderTextLayer
						renderAnnotationLayer
					/>
				</Document>
			</div>
		</div>
	)
}
