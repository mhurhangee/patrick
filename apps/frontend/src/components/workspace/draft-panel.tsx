import type { DraftStatus } from "@patrick/shared";
import { Button } from "@patrick/ui/components/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, MessageSquareText, X } from "lucide-react";
import { useEffect } from "react";
import { tasksApi } from "@/api/tasks";
import { Patrick } from "@/components/patrick";
import { useActiveTask } from "@/lib/active-task";
import { recordDocSize } from "@/lib/doc-size";
import { cn } from "@/lib/utils";

// The .docx surface after the editor teardown: Patrick edits the file on disk
// (headless tracked changes); Word is where the attorney reads, writes, and
// accepts/rejects. In-app, a draft is a live text preview + the dance status —
// deliberately not a Word imitation. "Save = talk to Patrick. Close = let
// Patrick write."

function useDraftStatus(filename: string, enabled: boolean) {
	const { activeTaskId } = useActiveTask();
	return useQuery({
		queryKey: ["tasks", activeTaskId, "draft-status", filename],
		queryFn: () => tasksApi.draftStatus(activeTaskId ?? "", filename),
		enabled: enabled && !!activeTaskId,
		refetchInterval: 2000,
	});
}

export function DraftPanel({
	filename,
	editable,
}: {
	filename: string;
	editable: boolean;
}) {
	const { activeTaskId } = useActiveTask();
	const queryClient = useQueryClient();
	const { data: status } = useDraftStatus(filename, editable);

	const {
		data: doc,
		isError,
		isPending,
	} = useQuery({
		queryKey: ["tasks", activeTaskId, "docx-text", filename],
		queryFn: () => tasksApi.docxText(activeTaskId ?? "", filename),
		enabled: !!activeTaskId,
	});

	// A Word-side save (or a landed parked edit) bumps lastSavedMs — refresh the
	// preview so what's on screen tracks what's on disk.
	const lastSavedMs = status?.lastSavedMs;
	useEffect(() => {
		if (lastSavedMs == null) return;
		queryClient.invalidateQueries({
			queryKey: ["tasks", activeTaskId, "docx-text", filename],
		});
	}, [lastSavedMs, activeTaskId, filename, queryClient]);

	// Feed the context control's token estimate for read-only docx sources.
	const chars = doc?.paragraphs.reduce((n, p) => n + p.text.length, 0) ?? 0;
	useEffect(() => {
		if (doc && !editable)
			recordDocSize(activeTaskId ?? "", filename, { chars });
	}, [doc, editable, activeTaskId, filename, chars]);

	if (isError)
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
				Couldn't read this document.
			</div>
		);
	if (isPending || !doc)
		return (
			<div className="flex h-full items-center justify-center bg-background">
				<Patrick variant="drawing" size={48} label="Reading document" />
			</div>
		);

	return (
		<div className="flex h-full flex-col bg-background">
			{editable && <DraftStatusBar filename={filename} status={status} />}
			<div className="min-h-0 flex-1 overflow-auto px-6 py-8 text-foreground">
				<div className="mx-auto max-w-3xl text-sm">
					{doc.paragraphs.filter((p) => p.text.trim()).length === 0 ? (
						<p className="text-muted-foreground">
							This document is empty — ask Patrick to start drafting, or open it
							in Word.
						</p>
					) : (
						doc.paragraphs.map((p) =>
							p.text.trim() ? (
								<p
									key={p.index}
									className={cn(
										"mt-3 leading-relaxed",
										// A pending-redline cue, not a redline rendering: the real
										// review (with strikethrough/underline) happens in Word.
										p.hasRevisions &&
											"-ml-3 border-l-2 border-l-primary/60 pl-3",
									)}
								>
									{p.text}
								</p>
							) : null,
						)
					)}
				</div>
			</div>
		</div>
	);
}

function DraftStatusBar({
	filename,
	status,
}: {
	filename: string;
	status: DraftStatus | undefined;
}) {
	const { activeTaskId } = useActiveTask();
	const queryClient = useQueryClient();
	const open = status?.openInEditor ?? false;
	const parked = status?.parkedEdits ?? 0;

	return (
		<div className="border-b">
			<div className="flex items-center gap-3 px-4 py-2 text-xs">
				<span className="flex items-center gap-1.5 text-muted-foreground">
					<span
						className={cn(
							"size-1.5 rounded-full",
							open ? "bg-amber-500" : "bg-emerald-500",
						)}
					/>
					{open
						? parked > 0
							? `Open in Word — ${parked} edit${parked === 1 ? "" : "s"} waiting (close it and they'll appear)`
							: "Open in Word — Patrick will apply edits when you close it"
						: "Closed — Patrick can edit right now"}
				</span>
				<span className="flex-1" />
				<Button
					variant="outline"
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={() => tasksApi.openDocument(activeTaskId ?? "", filename)}
				>
					<ExternalLink className="size-3.5" />
					Open in Word
				</Button>
			</div>
			{status?.mentions.map((m) => (
				<div
					key={m.id}
					className="flex items-start gap-2 border-t bg-muted/40 px-4 py-2 text-muted-foreground text-xs"
				>
					<MessageSquareText className="mt-0.5 size-3.5 shrink-0" />
					<span>
						<span className="font-medium text-foreground">{m.author}</span>{" "}
						commented: {m.text} — mention it to Patrick in chat and it'll
						respond.
					</span>
				</div>
			))}
			{(status?.failures.length ?? 0) > 0 && (
				<div className="flex items-start gap-2 border-t bg-destructive/10 px-4 py-2 text-destructive text-xs">
					<span className="min-w-0 flex-1">
						{status?.failures.map((f) => (
							<span key={f} className="block truncate">
								A parked edit couldn't be applied: {f}
							</span>
						))}
					</span>
					<button
						type="button"
						aria-label="Dismiss"
						className="shrink-0 opacity-70 hover:opacity-100"
						onClick={async () => {
							await tasksApi.clearDraftFailures(activeTaskId ?? "", filename);
							queryClient.invalidateQueries({
								queryKey: ["tasks", activeTaskId, "draft-status", filename],
							});
						}}
					>
						<X className="size-3.5" />
					</button>
				</div>
			)}
		</div>
	);
}
