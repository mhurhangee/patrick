import { FolderOpen, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

// Tauri v2 runtime detection
const isTauri =
	typeof window !== "undefined" &&
	// biome-ignore lint/suspicious/noExplicitAny: runtime detection
	!!(window as any).__TAURI_INTERNALS__

async function pickFolderNative(): Promise<string | null> {
	if (!isTauri) return null
	try {
		const { open } = await import("@tauri-apps/plugin-dialog")
		const result = await open({ directory: true, multiple: false })
		return typeof result === "string" ? result : null
	} catch {
		return null
	}
}

type FolderState =
	| { status: "idle" }
	| { status: "checking" }
	| { status: "exists"; name: string; firm: string }
	| { status: "new" }
	| { status: "error"; message: string }

export function ProfilePicker({
	initialDir = "",
	onLoad,
	onSetup,
}: {
	/** Pre-fill the folder input (e.g. from last session) without auto-continuing */
	initialDir?: string
	/** Profile folder chosen and existing settings loaded — go straight to workspace */
	onLoad: (configDir: string) => void
	/** Profile folder chosen but no settings.yaml — run setup flow */
	onSetup: (configDir: string) => void
}) {
	const [dir, setDir] = useState(initialDir)
	const [folderState, setFolderState] = useState<FolderState>({
		status: "idle",
	})
	const [picking, setPicking] = useState(false)
	const [confirming, setConfirming] = useState(false)

	// Probe the folder whenever dir changes (debounced)
	useEffect(() => {
		const trimmed = dir.trim()
		if (!trimmed) {
			setFolderState({ status: "idle" })
			return
		}
		setFolderState({ status: "checking" })
		const timer = setTimeout(async () => {
			try {
				const { exists } = await api.config.probe(trimmed)
				if (exists) {
					// Load the settings to show who this profile belongs to
					await api.config.setDir(trimmed)
					const s = await api.settings.get()
					setFolderState({
						status: "exists",
						name: s.profile.name || "Unknown",
						firm: s.profile.firm || "",
					})
				} else {
					setFolderState({ status: "new" })
				}
			} catch {
				setFolderState({ status: "error", message: "Can't reach that folder" })
			}
		}, 400)
		return () => clearTimeout(timer)
	}, [dir])

	async function handleBrowse() {
		setPicking(true)
		try {
			const picked = await pickFolderNative()
			if (picked) setDir(picked)
		} finally {
			setPicking(false)
		}
	}

	async function handleConfirm() {
		const trimmed = dir.trim()
		if (!trimmed) return
		setConfirming(true)
		try {
			await api.config.setDir(trimmed)
			localStorage.setItem("patrickos-config-dir", trimmed)
			if (folderState.status === "exists") {
				onLoad(trimmed)
			} else {
				onSetup(trimmed)
			}
		} finally {
			setConfirming(false)
		}
	}

	const canConfirm =
		dir.trim() &&
		(folderState.status === "exists" || folderState.status === "new")

	return (
		<div className="flex h-full flex-col items-center justify-center bg-background p-8">
			<div className="w-full max-w-md space-y-8">
				<div>
					<h1 className="text-4xl font-semibold font-heading tracking-tight">
						PatrickOS
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Load an existing profile or create a new one. Your settings, API
						key, and preferences are stored as plain files in the folder you
						choose — readable, portable, and yours. Different folders =
						different profiles.
					</p>
				</div>

				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label>Profile folder</Label>
						<div className="flex gap-2">
							<Input
								value={dir}
								onChange={(e) => setDir(e.target.value)}
								placeholder="/Users/jane/patrickos-profile"
								className="font-mono text-xs"
								autoFocus={!isTauri}
							/>
							{isTauri && (
								<Button
									type="button"
									variant="secondary"
									onClick={handleBrowse}
									disabled={picking}
								>
									{picking ? (
										<Loader2 size={12} className="animate-spin" />
									) : (
										<>
											<FolderOpen size={12} />
											Browse
										</>
									)}
								</Button>
							)}
						</div>
					</div>

					{/* Folder status */}
					{folderState.status === "checking" && (
						<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Loader2 size={10} className="animate-spin" /> Checking…
						</p>
					)}
					{folderState.status === "exists" && (
						<div className="rounded-md border bg-muted/40 px-3 py-2">
							<p className="text-xs font-medium">
								Profile found — {folderState.name}
								{folderState.firm ? ` · ${folderState.firm}` : ""}
							</p>
							<p className="text-xs text-muted-foreground mt-0.5">
								Your existing settings will be loaded.
							</p>
						</div>
					)}
					{folderState.status === "new" && (
						<div className="rounded-md border bg-muted/40 px-3 py-2">
							<p className="text-xs font-medium">New profile</p>
							<p className="text-xs text-muted-foreground mt-0.5">
								A settings.yaml will be created here.
							</p>
						</div>
					)}
					{folderState.status === "error" && (
						<p className="text-xs text-destructive">{folderState.message}</p>
					)}
				</div>

				<div className="flex items-center justify-between">
					<p className="text-xs text-muted-foreground">
						Switch profiles any time from Settings.
					</p>
					<Button
						type="button"
						disabled={!canConfirm || confirming}
						onClick={handleConfirm}
					>
						{confirming ? (
							<Loader2 size={12} className="animate-spin" />
						) : folderState.status === "exists" ? (
							"Continue"
						) : (
							"Set up"
						)}
					</Button>
				</div>
			</div>
		</div>
	)
}
