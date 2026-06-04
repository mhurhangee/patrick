import type { ApiAsset } from "@patrickos/shared"
import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"

// A source tab shows either its document (PDF) or its ExtractPat extraction.
export type AssetView = "source" | "extraction"

function fileToAsset(
	file: {
		filename: string
		path: string
		ext: string
		createdAt?: string
		updatedAt?: string
	},
	kind: "source" | "artifact",
	taskPath: string,
): ApiAsset {
	const title = file.filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
	return {
		id: file.path,
		taskId: taskPath,
		kind,
		title,
		filename: file.filename,
		path: file.path,
		type: "",
		content: "",
		date: file.createdAt ?? "",
		notes: "",
		metadata: {},
		details: null,
		tags: [],
		createdAt: file.createdAt ?? "",
		updatedAt: file.updatedAt ?? "",
	}
}

export function useAssetState(currentTaskId: string) {
	const [assets, setAssets] = useState<ApiAsset[]>([])
	const [openTabIds, setOpenTabIds] = useState<string[]>([])
	const [activeTab, setActiveTab] = useState("")
	const [splitView, setSplitView] = useState(false)
	// Per-source-tab toggle: document (PDF) vs ExtractPat extraction. Default "source".
	const [tabView, setTabView] = useState<Record<string, AssetView>>({})
	const [extractedFilenames, setExtractedFilenames] = useState<Set<string>>(
		new Set(),
	)
	// Sources the user has flagged "do not read" — excluded from AgentPat context.
	const [doNotRead, setDoNotRead] = useState<Set<string>>(new Set())

	const refresh = useCallback(() => {
		if (!currentTaskId) {
			setAssets([])
			setExtractedFilenames(new Set())
			setDoNotRead(new Set())
			return
		}
		api.tasks.listFiles(currentTaskId).then(async ({ sources, artifacts }) => {
			const sourceAssets = sources.map((f) =>
				fileToAsset(f, "source", currentTaskId),
			)
			const artifactAssets = artifacts.map((f) =>
				fileToAsset(f, "artifact", currentTaskId),
			)
			setAssets([...sourceAssets, ...artifactAssets])
			// Restore persisted "do not read" exclusions (stored by filename).
			const excludedFilenames = new Set(
				await api.extractions.getExcluded(currentTaskId),
			)
			setDoNotRead(
				new Set(
					sourceAssets
						.filter((s) => excludedFilenames.has(s.filename))
						.map((s) => s.id),
				),
			)
		})
		api.extractions
			.list(currentTaskId)
			.then((summaries) =>
				setExtractedFilenames(new Set(summaries.map((s) => s.filename))),
			)
	}, [currentTaskId])

	useEffect(() => {
		setOpenTabIds([])
		setActiveTab("")
		refresh()
	}, [refresh])

	function openAsset(id: string, view?: AssetView) {
		setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
		setActiveTab(id)
		// Set the requested view; otherwise default a first-time open to "source".
		setTabView((prev) =>
			view
				? { ...prev, [id]: view }
				: prev[id]
					? prev
					: { ...prev, [id]: "source" },
		)
	}

	function setAssetView(id: string, view: AssetView) {
		setTabView((prev) => ({ ...prev, [id]: view }))
	}

	function selectTab(id: string) {
		setActiveTab(id)
		setSplitView(false)
	}

	function toggleSplitView() {
		setSplitView((v) => !v)
	}

	function closeTab(id: string) {
		setOpenTabIds((prev) => {
			const next = prev.filter((t) => t !== id)
			if (activeTab === id) setActiveTab(next[0] ?? "")
			if (next.length < 2) setSplitView(false)
			return next
		})
	}

	function updateAsset(updated: ApiAsset) {
		setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
	}

	async function createArtifact() {
		if (!currentTaskId) return
		// Pick a unique title so the backend's slug → filename doesn't overwrite.
		const taken = new Set(
			assets
				.filter((a) => a.kind === "artifact")
				.map((a) => a.title.toLowerCase()),
		)
		let title = "Untitled"
		for (let n = 2; taken.has(title.toLowerCase()); n++) title = `Untitled ${n}`
		const created = await api.artifacts.create(currentTaskId, title)
		refresh()
		openAsset(created.path)
	}

	function toggleDoNotRead(id: string) {
		const next = new Set(doNotRead)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		setDoNotRead(next)
		// Persist by filename so it travels with the task folder.
		const filenames = [...next]
			.map((x) => assets.find((a) => a.id === x)?.filename)
			.filter((f): f is string => !!f)
		api.extractions.setExcluded(currentTaskId, filenames).catch(() => {})
	}

	// Open documents for chat context/chips.
	const openAssets = openTabIds
		.map((id) => assets.find((a) => a.id === id))
		.filter(Boolean) as ApiAsset[]

	return {
		assets,
		openTabIds,
		activeTab,
		splitView,
		tabView,
		openAssets,
		extractedFilenames,
		doNotRead,
		refresh,
		openAsset,
		setAssetView,
		selectTab,
		toggleSplitView,
		closeTab,
		updateAsset,
		createArtifact,
		toggleDoNotRead,
	}
}
