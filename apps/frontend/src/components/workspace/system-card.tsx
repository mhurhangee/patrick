import type { PinnedSource } from "@patrick/shared";
import { ChevronDown, Code, Lock, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { cn } from "@/lib/utils";
import { Patrick } from "../patrick";
import { VersionChip } from "./version-chip";

// The chat header doubles as a window into — and editor of — Patrick's system
// prompt for this chat. Honest by default: you see exactly what it's told. The
// instructions are editable until the first message, then locked (one system
// per chat; start a new chat to change them). The preview resolves live against
// what's currently pinned.
export function SystemCard({
	taskId,
	profileId,
	pinnedSources,
	activeDraft,
	template,
	edited,
	onChangeTemplate,
	onReset,
	onNewChat,
	locked,
	profileMismatch,
	profileName,
}: {
	taskId: string | undefined;
	profileId: string | undefined;
	pinnedSources: PinnedSource[];
	activeDraft: string | null;
	template: string;
	/** True when this chat has its own edit (vs following the profile). */
	edited: boolean;
	onChangeTemplate: (t: string) => void;
	onReset: () => void;
	onNewChat: () => void;
	locked: boolean;
	/** This chat's locked prompt no longer matches the active profile's. */
	profileMismatch?: boolean;
	profileName?: string;
}) {
	const [open, setOpen] = useState(false);
	const [preview, setPreview] = useState<string | null>(null);

	const pinnedKey = pinnedSources.map((s) => s.filename).join(",");

	// Live preview: the exact system prompt this chat would send right now. Zero
	// cost (no model call), debounced as you edit / pin / change the draft.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pinnedKey stands in for pinnedSources
	useEffect(() => {
		if (!open || !taskId || !profileId) return;
		let cancelled = false;
		const t = setTimeout(() => {
			tasksApi
				.chatPreview(taskId, {
					profileId,
					pinnedSources,
					activeDraft,
					templateOverride: template,
				})
				.then((r) => !cancelled && setPreview(r.system))
				.catch(() => !cancelled && setPreview(null));
		}, 350);
		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [open, taskId, profileId, template, pinnedKey, activeDraft]);

	return (
		<div className="@container">
			<div className="flex items-center justify-between gap-2 py-2 pr-2 pl-4">
				{/* Left: identity. The version chip is the only control here. */}
				<div className="flex min-w-0 items-center gap-2">
					<Patrick size={18} />
					<span className="@[20rem]:inline hidden font-heading text-lg font-semibold tracking-tighter">
						Patrick
					</span>
					<span className="@[20rem]:inline hidden">
						<VersionChip />
					</span>
				</div>

				{/* Right: explicit controls — open the system prompt, or start fresh. */}
				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onClick={() => setOpen((o) => !o)}
						title="System prompt for this chat"
						className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
					>
						<Code size={16} className="text-muted-foreground" />
						<span className="flex items-center gap-1 text-xs text-muted-foreground">
							Instructions
							{locked && <Lock className="size-3" />}
						</span>
						<ChevronDown
							className={cn(
								"size-4 text-muted-foreground transition-transform",
								open && "rotate-180",
							)}
						/>
					</button>
					<button
						type="button"
						onClick={onNewChat}
						title="New chat"
						className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
					>
						<Plus className="size-4" />
					</button>
				</div>
			</div>

			{profileMismatch && (
				<div className="flex items-center justify-between gap-2 border-t bg-amber-500/10 px-4 py-1.5 text-[11px]">
					<span className="min-w-0 truncate text-muted-foreground">
						Locked instructions — no longer match{" "}
						{profileName ? `${profileName}'s` : "your"} current prompt.
					</span>
					<button
						type="button"
						onClick={onNewChat}
						className="shrink-0 font-medium text-foreground hover:underline"
					>
						New chat
					</button>
				</div>
			)}

			{open && (
				<div className="space-y-3 border-t bg-muted/20 px-4 py-3">
					<div>
						<div className="mb-1 flex items-center justify-between">
							<span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
								Instructions
								{locked && <Lock className="size-2.5" />}
							</span>
							{!locked && edited && (
								<button
									type="button"
									onClick={onReset}
									className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground"
								>
									<RotateCcw className="size-3" />
									Reset to profile
								</button>
							)}
						</div>
						<textarea
							value={template}
							onChange={(e) => onChangeTemplate(e.target.value)}
							readOnly={locked}
							spellCheck={false}
							className={cn(
								"min-h-28 w-full resize-y rounded-md border bg-background p-2 font-mono text-[11px] leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-ring",
								locked && "cursor-default text-muted-foreground",
							)}
						/>
						<p className="mt-1 text-[10px] text-muted-foreground/60">
							{locked
								? "Locked for this chat — start a new chat to change the instructions."
								: "Edits apply to this chat only; your saved profile is untouched. Tokens like <OPENDOCUMENTS> fill in below."}
						</p>
					</div>

					<div>
						<span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
							What Patrick receives (live)
						</span>
						<pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
							{preview ?? "Resolving…"}
						</pre>
					</div>
				</div>
			)}
		</div>
	);
}
