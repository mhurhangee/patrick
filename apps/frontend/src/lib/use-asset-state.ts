import type { ApiAsset, DocMeta, DocMetaMap } from "@patrickos/shared"
import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"

// Which view of a source tab is active. "source" + "notes" are always available;
// derivation views (e.g. "extraction") appear once a record exists.
export type AssetView = string

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
		content: "",
		createdAt: file.createdAt ?? "",
		updatedAt: file.updatedAt ?? "",
	}
}

export function useAssetState(currentTaskId: string) {
	const [assets, setAssets] = useState<ApiAsset[]>([])
	const [openTabIds, setOpenTabIds] = useState<string[]>([])
	const [activeTab, setActiveTab] = useState("")
	const [splitView, setSplitView] = useState(false)
	// Per-source-tab toggle: Source | Notes. Default "source".
	const [tabView, setTabView] = useState<Record<string, AssetView>>({})
	// Per-doc metadata (signpost/tags/excluded/starred), keyed by filename — the
	// single source of truth; excluded/starred sets below are derived from it.
	const [docMeta, setDocMeta] = useState<DocMetaMap>({})

	const refresh = useCallback(() => {
		if (!currentTaskId) {
			setAssets([])
			setDocMeta({})
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
		})
		api.docmeta.get(currentTaskId).then(setDocMeta)
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

	async function renameArtifact(id: string, newTitle: string) {
		const asset = assets.find((a) => a.id === id)
		if (!asset || asset.kind !== "artifact") return
		const updated = await api.artifacts.rename(
			currentTaskId,
			asset.filename,
			newTitle,
		)
		// Artifact identity is its path — migrate any open-tab/view state to the new id.
		const newId = updated.path
		if (newId !== id) {
			setOpenTabIds((prev) => prev.map((t) => (t === id ? newId : t)))
			setActiveTab((a) => (a === id ? newId : a))
			setTabView((prev) => {
				if (!(id in prev)) return prev
				const { [id]: view, ...rest } = prev
				return { ...rest, [newId]: view }
			})
		}
		refresh()
	}

	async function deleteArtifact(id: string) {
		const asset = assets.find((a) => a.id === id)
		if (!asset || asset.kind !== "artifact") return
		await api.artifacts.delete(currentTaskId, asset.filename)
		closeTab(id)
		refresh()
	}

	// Metadata is keyed by filename so it travels with the task folder; the UI
	// keys most things by asset id, so map id → filename when persisting.
	const filenameFor = (id: string) => assets.find((a) => a.id === id)?.filename

	// Merge a patch into one doc's metadata — optimistic local update + persist.
	function patchDocMeta(filename: string, patch: Partial<DocMeta>) {
		setDocMeta((prev) => {
			const merged: DocMeta = { ...prev[filename], ...patch }
			// Mirror the server's prune so derived sets update immediately.
			const clean: DocMeta = {}
			if (merged.signpost?.trim()) clean.signpost = merged.signpost.trim()
			if (merged.tags?.length) clean.tags = merged.tags
			if (merged.excluded) clean.excluded = true
			if (merged.starred) clean.starred = true
			const next = { ...prev }
			if (Object.keys(clean).length) next[filename] = clean
			else delete next[filename]
			return next
		})
		api.docmeta.update(currentTaskId, filename, patch).catch(() => {})
	}

	function toggleDoNotRead(id: string) {
		const filename = filenameFor(id)
		if (filename)
			patchDocMeta(filename, { excluded: !docMeta[filename]?.excluded })
	}

	function toggleStar(id: string) {
		const filename = filenameFor(id)
		if (filename)
			patchDocMeta(filename, { starred: !docMeta[filename]?.starred })
	}

	function setSignpost(filename: string, signpost: string) {
		patchDocMeta(filename, { signpost })
	}

	function setTags(filename: string, tags: string[]) {
		patchDocMeta(filename, { tags })
	}

	// Derived id-sets — excluded/starred live in docMeta (by filename); most of
	// the UI works in asset ids, so project them across the current assets.
	const doNotRead = new Set(
		assets.filter((a) => docMeta[a.filename]?.excluded).map((a) => a.id),
	)
	const starred = new Set(
		assets.filter((a) => docMeta[a.filename]?.starred).map((a) => a.id),
	)

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
		docMeta,
		openAssets,
		doNotRead,
		starred,
		refresh,
		openAsset,
		setAssetView,
		selectTab,
		toggleSplitView,
		closeTab,
		updateAsset,
		createArtifact,
		renameArtifact,
		deleteArtifact,
		toggleDoNotRead,
		toggleStar,
		setSignpost,
		setTags,
	}
}
