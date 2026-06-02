import type { ApiAsset } from "@patrickos/shared"
import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"

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
	const [analysedFilenames, setAnalysedFilenames] = useState<Set<string>>(
		new Set(),
	)

	const refresh = useCallback(() => {
		if (!currentTaskId) {
			setAssets([])
			setAnalysedFilenames(new Set())
			return
		}
		api.tasks.listFiles(currentTaskId).then(({ sources, artifacts }) => {
			const sourceAssets = sources.map((f) =>
				fileToAsset(f, "source", currentTaskId),
			)
			const artifactAssets = artifacts.map((f) =>
				fileToAsset(f, "artifact", currentTaskId),
			)
			setAssets([...sourceAssets, ...artifactAssets])
		})
		api.analysis
			.list(currentTaskId)
			.then((summaries) =>
				setAnalysedFilenames(new Set(summaries.map((s) => s.filename))),
			)
	}, [currentTaskId])

	useEffect(() => {
		setOpenTabIds([])
		setActiveTab("")
		refresh()
	}, [refresh])

	function openAsset(id: string) {
		setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
		setActiveTab(id)
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

	async function deleteAsset(id: string) {
		// In file-system mode, we don't delete the file — just remove from view
		closeTab(id)
		setAssets((prev) => prev.filter((a) => a.id !== id))
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

	const openAssets = openTabIds
		.map((id) => assets.find((a) => a.id === id))
		.filter(Boolean) as ApiAsset[]

	return {
		assets,
		openTabIds,
		activeTab,
		splitView,
		openAssets,
		analysedFilenames,
		refresh,
		openAsset,
		selectTab,
		toggleSplitView,
		closeTab,
		updateAsset,
		deleteAsset,
		createArtifact,
	}
}
