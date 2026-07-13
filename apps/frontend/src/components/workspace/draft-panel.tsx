import type { DraftComment, DraftStatus } from "@patrick/shared";
import { Badge } from "@patrick/ui/components/badge";
import { Button } from "@patrick/ui/components/button";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@patrick/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, MessageSquareText, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { Patrick } from "@/components/patrick";
import { useActiveTask } from "@/lib/active-task";
import { recordDocSize } from "@/lib/doc-size";
import { cn } from "@/lib/utils";

// The .docx surface after the editor teardown: Patrick edits the file on disk
// (headless tracked changes); Word is where the attorney reads, writes, and
// accepts/rejects. In-app, a draft is a REVIEW surface — its pending changes and
// comments condensed into cards you accept/reject without opening Word — plus a
// plain "Document" reading mode. Deliberately not a Word imitation.
// "Save = talk to Patrick. Close = let Patrick write."

type DocxRun = {
	text: string;
	kind: "text" | "ins" | "del";
	revisionId?: number;
	author?: string;
};
type DocxParagraph = {
	index: number;
	runs: DocxRun[];
	hasRevisions: boolean;
	resolvable: boolean;
};

/** A paragraph's accepted-view text (keep insertions, drop deletions) — what the
 *  card shows as the result, and the content-address sent with a resolve. */
function acceptedText(p: DocxParagraph): string {
	return p.runs
		.filter((r) => r.kind !== "del")
		.map((r) => r.text)
		.join("");
}

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
	const [mode, setMode] = useState<"review" | "document">("review");

	const {
		data: doc,
		isError,
		isPending,
	} = useQuery({
		queryKey: ["tasks", activeTaskId, "docx-text", filename],
		queryFn: () => tasksApi.docxText(activeTaskId ?? "", filename),
		enabled: !!activeTaskId,
	});

	// A Word-side save (or a landed parked edit/resolve) bumps lastSavedMs —
	// refresh so what's on screen tracks what's on disk.
	const lastSavedMs = status?.lastSavedMs;
	useEffect(() => {
		if (lastSavedMs == null) return;
		queryClient.invalidateQueries({
			queryKey: ["tasks", activeTaskId, "docx-text", filename],
		});
	}, [lastSavedMs, activeTaskId, filename, queryClient]);

	// Feed the context control's token estimate for read-only docx sources
	// (deleted-run text doesn't count — it's gone once accepted).
	const chars =
		doc?.paragraphs.reduce(
			(n, p) =>
				n +
				p.runs.reduce((m, r) => (r.kind === "del" ? m : m + r.text.length), 0),
			0,
		) ?? 0;
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
			{editable && (
				<DraftStatusBar
					filename={filename}
					status={status}
					mode={mode}
					onModeChange={setMode}
				/>
			)}
			<div className="min-h-0 flex-1 overflow-auto">
				{editable && mode === "review" ? (
					<ReviewView
						filename={filename}
						paragraphs={doc.paragraphs}
						comments={doc.comments}
						status={status}
					/>
				) : (
					<DocumentView paragraphs={doc.paragraphs} />
				)}
			</div>
		</div>
	);
}

// --- Review mode: only the changed / commented paragraphs, as cards ---------

function ReviewView({
	filename,
	paragraphs,
	comments,
	status,
}: {
	filename: string;
	paragraphs: DocxParagraph[];
	comments: DraftComment[];
	status: DraftStatus | undefined;
}) {
	const { activeTaskId } = useActiveTask();
	const queryClient = useQueryClient();

	const commentsByPara = useMemo(() => {
		const map = new Map<number, DraftComment[]>();
		for (const c of comments) {
			const key = c.paragraphIndex ?? 0;
			const list = map.get(key) ?? [];
			list.push(c);
			map.set(key, list);
		}
		return map;
	}, [comments]);

	const [error, setError] = useState<string | null>(null);

	// Paragraphs the reviewer cares about: a pending redline, or a comment.
	const items = paragraphs.filter(
		(p) => p.hasRevisions || commentsByPara.has(p.index),
	);
	// Comments whose anchor couldn't be placed (paragraphIndex undefined → key 0)
	// still surface, in a trailing section — never silently dropped.
	const unanchored = commentsByPara.get(0) ?? [];

	// Paragraphs with a resolve waiting for the draft to close — read structurally
	// from the parked op, not by regexing its display summary.
	const queued = useMemo(() => {
		const s = new Set<number>();
		for (const op of status?.parkedOps ?? [])
			if (op.kind === "resolve" && op.paragraphIndex != null)
				s.add(op.paragraphIndex);
		return s;
	}, [status?.parkedOps]);

	const resolve = useMutation({
		mutationFn: ({
			paragraph,
			action,
		}: {
			paragraph: DocxParagraph;
			action: "accept" | "reject";
		}) =>
			tasksApi.resolveDraft(
				activeTaskId ?? "",
				filename,
				paragraph.index,
				action,
				acceptedText(paragraph),
			),
		onSuccess: (outcome) => {
			setError(outcome.status === "failed" ? outcome.reason : null);
		},
		onError: () => setError("Couldn't apply that — please try again."),
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: ["tasks", activeTaskId, "docx-text", filename],
			});
			queryClient.invalidateQueries({
				queryKey: ["tasks", activeTaskId, "draft-status", filename],
			});
		},
	});

	if (items.length === 0 && unanchored.length === 0)
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground text-sm">
				<Check className="size-5 text-emerald-500" />
				<p>
					No pending changes. Ask Patrick to draft or amend, and its tracked
					changes will appear here to review.
				</p>
			</div>
		);

	return (
		<div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
			{error && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
					{error}
				</div>
			)}
			{items.map((p) => (
				<ChangeCard
					key={p.index}
					paragraph={p}
					comments={commentsByPara.get(p.index) ?? []}
					queued={queued.has(p.index)}
					busy={resolve.isPending}
					onAccept={() => resolve.mutate({ paragraph: p, action: "accept" })}
					onReject={() => resolve.mutate({ paragraph: p, action: "reject" })}
				/>
			))}
			{unanchored.length > 0 && (
				<div className="rounded-lg border bg-card">
					<div className="border-b px-3 py-1.5 text-muted-foreground text-xs">
						Comments (not anchored to a paragraph)
					</div>
					{unanchored.map((c) => (
						<CommentRow key={c.id} comment={c} />
					))}
				</div>
			)}
		</div>
	);
}

function ChangeCard({
	paragraph,
	comments,
	queued,
	busy,
	onAccept,
	onReject,
}: {
	paragraph: DocxParagraph;
	comments: DraftComment[];
	queued: boolean;
	busy: boolean;
	onAccept: () => void;
	onReject: () => void;
}) {
	return (
		<div className="rounded-lg border bg-card">
			<div className="flex items-center gap-2 border-b px-3 py-1.5">
				<Badge variant="outline" className="font-mono text-[10px]">
					¶{paragraph.index}
				</Badge>
				{queued && (
					<Badge variant="secondary" className="text-[10px]">
						queued — close the draft in Word to apply
					</Badge>
				)}
				{/* A tracked change that isn't Patrick's own can only be resolved in
				    Word — offer no in-app buttons that would silently no-op. */}
				{paragraph.hasRevisions && !paragraph.resolvable && (
					<span className="text-muted-foreground text-[10px]">
						tracked change — accept/reject in Word
					</span>
				)}
				<span className="flex-1" />
				{paragraph.resolvable && !queued && (
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1 text-emerald-600 text-xs hover:text-emerald-600"
							disabled={busy}
							onClick={onAccept}
						>
							<Check className="size-3.5" /> Accept
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1 text-muted-foreground text-xs"
							disabled={busy}
							onClick={onReject}
						>
							<Undo2 className="size-3.5" /> Reject
						</Button>
					</div>
				)}
			</div>
			<p className="px-3 py-2.5 text-sm leading-relaxed">
				{renderRuns(paragraph.runs)}
			</p>
			{comments.map((c) => (
				<CommentRow key={c.id} comment={c} />
			))}
		</div>
	);
}

function CommentRow({ comment }: { comment: DraftComment }) {
	return (
		<div className="flex items-start gap-2 border-t bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
			<MessageSquareText className="mt-0.5 size-3.5 shrink-0" />
			<span>
				<span className="font-medium text-foreground">{comment.author}</span>:{" "}
				{comment.text}
			</span>
		</div>
	);
}

// --- Document mode: the whole draft as plain text with redline marks --------

function DocumentView({ paragraphs }: { paragraphs: DocxParagraph[] }) {
	if (paragraphs.every((p) => !paragraphHasText(p)))
		return (
			<div className="mx-auto max-w-3xl px-6 py-8 text-muted-foreground text-sm">
				This document is empty — ask Patrick to start drafting, or open it in
				Word.
			</div>
		);
	return (
		<div className="mx-auto max-w-3xl px-6 py-8 text-foreground text-sm">
			{paragraphs.map((p) =>
				paragraphHasText(p) ? (
					<p
						key={p.index}
						className={cn(
							"mt-3 leading-relaxed",
							p.hasRevisions && "-ml-3 border-l-2 border-l-primary/60 pl-3",
						)}
					>
						{renderRuns(p.runs)}
					</p>
				) : null,
			)}
		</div>
	);
}

function paragraphHasText(p: { runs: { text: string }[] }): boolean {
	return p.runs.some((r) => r.text.trim());
}

// Keys derive from each run's kind + character offset — stable for a given
// fetched paragraph, no array-index keys.
function renderRuns(runs: DocxRun[]) {
	let offset = 0;
	return runs.map((r) => {
		const key = `${r.kind}@${offset}`;
		offset += r.text.length;
		if (r.kind === "ins")
			return (
				<ins
					key={key}
					className="text-primary no-underline decoration-primary/60"
				>
					{r.text}
				</ins>
			);
		if (r.kind === "del")
			return (
				<del key={key} className="text-muted-foreground/70">
					{r.text}
				</del>
			);
		return <span key={key}>{r.text}</span>;
	});
}

function DraftStatusBar({
	filename,
	status,
	mode,
	onModeChange,
}: {
	filename: string;
	status: DraftStatus | undefined;
	mode: "review" | "document";
	onModeChange: (m: "review" | "document") => void;
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
							? `Open in Word — ${parked} change${parked === 1 ? "" : "s"} waiting (close it and they'll apply)`
							: "Open in Word — Patrick will apply changes when you close it"
						: "Closed — Patrick can edit right now"}
				</span>
				<span className="flex-1" />
				<ToggleGroup
					type="single"
					size="sm"
					value={mode}
					onValueChange={(v) => v && onModeChange(v as "review" | "document")}
				>
					<ToggleGroupItem value="review" className="h-7 px-2 text-xs">
						Review
					</ToggleGroupItem>
					<ToggleGroupItem value="document" className="h-7 px-2 text-xs">
						Document
					</ToggleGroupItem>
				</ToggleGroup>
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
								A parked change couldn't be applied: {f}
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
