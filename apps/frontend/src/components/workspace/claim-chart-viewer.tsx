import type {
	CellStatus,
	Chart,
	ChartCell,
	ChartCitation,
	ChartColumn,
	ClaimLimitation,
	DisclosureType,
} from "@patrick/shared";
import { docKind, mergeColumnReads } from "@patrick/shared";
import { useNavigate } from "@tanstack/react-router";
import {
	Info,
	Locate,
	MoreHorizontal,
	Play,
	Plus,
	RotateCcw,
	Trash2,
	TriangleAlert,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { DocIcon } from "@/components/doc-icon";
import { ModelPicker } from "@/components/model-picker";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useChart, useParseChart, useSaveChart } from "@/hooks/use-charts";
import { useProfile } from "@/hooks/use-profiles";
import { useTaskDocuments } from "@/hooks/use-tasks";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { useCitationNav } from "@/lib/search/citation-nav";
import { cn } from "@/lib/utils";
import { Patrick } from "../patrick";
import { Skeleton } from "../ui/skeleton";

const FEATURE_W = 380;
const COLUMN_W = 360;
const ADD_W = 220;

const DISCLOSURE_STYLE: Record<DisclosureType, string> = {
	Express: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
	Derived: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
	Suggested: "bg-amber-500/15 text-amber-700 dark:text-amber-600",
	Absent: "bg-muted text-muted-foreground",
};

const VERDICTS: DisclosureType[] = [
	"Express",
	"Derived",
	"Suggested",
	"Absent",
];

const STATUS_STYLE: Record<CellStatus, { label: string; className: string }> = {
	ai: { label: "AI", className: "text-[var(--patrick-coral)]" },
	edited: {
		label: "Edited",
		className: "text-primary-foreground",
	},
	approved: {
		label: "Checked",
		className: "text-primary",
	},
	stale: {
		label: "Stale",
		className: "text-destructive",
	},
};

const uuid = () => crypto.randomUUID();
const NONE = "__none__";

function DocSelectItem({ filename }: { filename: string }) {
	return (
		<SelectItem value={filename}>
			<span className="flex items-center gap-2">
				<DocIcon kind={docKind(filename)} className="size-3.5" />
				{filename}
			</span>
		</SelectItem>
	);
}

export function ClaimChartViewer({ chartId }: { chartId: string }) {
	const { activeTaskId } = useActiveTask();
	const { data: chart, isLoading } = useChart(activeTaskId, chartId);

	if (isLoading)
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading chart…
			</div>
		);
	if (!chart)
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Couldn't load this chart.
			</div>
		);
	return <ChartTable key={chartId} chart={chart} />;
}

// One table. Rows are limitations; columns are references (each read as a whole, with an
// optional primer). Click a cell to edit, drag a column border to resize.
function ChartTable({ chart }: { chart: Chart }) {
	const navigate = useNavigate();
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const { data: profile } = useProfile(activeProfileId);
	const { data: documents } = useTaskDocuments(activeTaskId);
	const save = useSaveChart(activeTaskId);
	const parse = useParseChart(activeTaskId, chart.id);

	// The analysis model: the chart's pick, else the profile default. Provider gates which
	// models the picker offers (BYOK).
	const provider = profile?.ai.provider ?? "anthropic";
	const analysisModel = chart.model ?? profile?.ai.model ?? "";

	// chartRef holds the freshest chart so async ops never save against a stale copy.
	const chartRef = useRef(chart);
	chartRef.current = chart;
	// Defensive defaults so a pre-v2 chart on disk degrades to empty rather than crashing.
	const [rows, setRows] = useState<ClaimLimitation[]>(chart.limitations ?? []);
	const rowsRef = useRef(rows);
	rowsRef.current = rows;
	// Adopt limitations written elsewhere — the agent's parse_claim, or another window —
	// when the refetched chart carries them (columns/cells already read straight off the
	// prop). Local edits round-trip through `chart` too, so an unchanged refetch just
	// re-sets identical rows; InlineField buffers its own draft, so an in-progress cell
	// edit is never interrupted.
	useEffect(() => {
		setRows(chart.limitations ?? []);
	}, [chart.limitations]);
	const [widths, setWidths] = useState<Record<string, number>>(
		chart.columnWidths ?? {},
	);
	const [running, setRunning] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);

	const [colOpen, setColOpen] = useState(false);
	const [newDoc, setNewDoc] = useState("");
	const [newPrimer, setNewPrimer] = useState(NONE);
	const [claimOpen, setClaimOpen] = useState(false);
	const [claimDoc, setClaimDoc] = useState("");
	const [claimsSpec, setClaimsSpec] = useState("1");
	const [claimSupport, setClaimSupport] = useState(
		chart.constructionSupport ?? NONE,
	);

	const columns = chart.columns ?? [];
	const cells = chart.cells ?? [];
	const distinctRefs = [...new Set(columns.map((c) => c.reference))];
	const labelFor = (ref: string) => `D${distinctRefs.indexOf(ref) + 1}`;
	// One lookup map per render instead of a linear find per rendered cell (the sparse
	// cells array can hold rows×columns entries).
	const cellByKey = useMemo(() => {
		const m = new Map<string, ChartCell>();
		for (const c of cells) m.set(`${c.limitationUid}|${c.columnId}`, c);
		return m;
	}, [cells]);
	const cellFor = (uid: string, columnId: string) =>
		cellByKey.get(`${uid}|${columnId}`);

	const widthOf = (id: string, fallback: number) => widths[id] ?? fallback;
	const setWidth = (id: string, w: number) =>
		setWidths((p) => ({ ...p, [id]: Math.max(140, w) }));
	// Persist on drag-end (not per mousemove) so a resize survives reload.
	const persistWidth = (id: string, w: number) =>
		update({
			columnWidths: {
				...(chartRef.current.columnWidths ?? {}),
				[id]: Math.max(140, w),
			},
		});

	const update = (patch: Partial<Chart>) =>
		save.mutate({
			...chartRef.current,
			limitations: rowsRef.current,
			...patch,
		});
	const saveLimitations = (next: ClaimLimitation[]) =>
		save.mutate({ ...chartRef.current, limitations: next });

	const commitField = (
		i: number,
		key: keyof ClaimLimitation,
		value: string,
	) => {
		const next = rowsRef.current.map((r, idx) =>
			idx === i ? { ...r, [key]: value } : r,
		);
		setRows(next);
		// Changing the limitation text or construction makes that row's cells stale.
		if (key === "text" || key === "construction") {
			const uid = next[i]?.uid;
			save.mutate({
				...chartRef.current,
				limitations: next,
				cells: chartRef.current.cells.map((c) =>
					c.limitationUid === uid ? { ...c, status: "stale" } : c,
				),
			});
		} else {
			saveLimitations(next);
		}
	};
	const addRow = () => {
		const next = [
			...rowsRef.current,
			{ uid: uuid(), label: "", text: "", construction: "" },
		];
		setRows(next);
		saveLimitations(next);
	};
	const removeRow = (i: number) => {
		const next = rowsRef.current.filter((_, idx) => idx !== i);
		setRows(next);
		saveLimitations(next);
	};
	const addClaim = async () => {
		if (!claimDoc || !activeProfileId) return;
		const support = claimSupport === NONE ? undefined : claimSupport;
		const { limitations } = await parse.mutateAsync({
			filename: claimDoc,
			profileId: activeProfileId,
			claims: claimsSpec || "1",
			constructionSupport: support,
			model: chartRef.current.model,
		});
		const next = [...rowsRef.current, ...limitations];
		setRows(next);
		save.mutate({
			...chartRef.current,
			limitations: next,
			constructionSupport: support,
		});
		setClaimOpen(false);
	};

	const runColumn = async (column: ChartColumn, force = false) => {
		if (!activeTaskId || !activeProfileId || running.has(column.id)) return;
		const taskId = activeTaskId;
		const profileId = activeProfileId;
		setRunning((s) => new Set(s).add(column.id));
		setError(null);
		// Snapshot the rows this read judges, so a row edited mid-read lands as Stale, not a
		// fresh verdict computed against the now-changed text/construction.
		const sent = rowsRef.current;
		const sentByUid = new Map(sent.map((l) => [l.uid, l]));
		try {
			const reads = await tasksApi.readReference(taskId, chart.id, {
				profileId,
				reference: column.reference,
				primer: column.primer,
				limitations: sent,
				model: chartRef.current.model,
			});
			// Merge by the stable uid the read echoes (never the editable, non-unique label) —
			// the same shared rule the agent's run uses. Rows whose text/construction changed
			// while the read was in flight land Stale, not as a fresh verdict.
			const currentRows = rowsRef.current;
			const currentByUid = new Map(currentRows.map((l) => [l.uid, l]));
			const staleUids = new Set<string>();
			for (const [uid, at] of sentByUid) {
				const now = currentByUid.get(uid);
				if (
					now &&
					(at.text !== now.text || at.construction !== now.construction)
				)
					staleUids.add(uid);
			}
			const merged = mergeColumnReads({
				columnId: column.id,
				reads,
				cells: chartRef.current.cells,
				validUids: new Set(currentRows.map((l) => l.uid)),
				force,
				staleUids,
			});
			update({
				cells: [
					...chartRef.current.cells.filter((x) => x.columnId !== column.id),
					...merged,
				],
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Run failed.");
		} finally {
			setRunning((s) => {
				const n = new Set(s);
				n.delete(column.id);
				return n;
			});
		}
	};

	const addColumn = () => {
		setColOpen(false);
		if (!newDoc) return;
		const column: ChartColumn = {
			id: uuid(),
			reference: newDoc,
			primer: newPrimer === NONE ? undefined : newPrimer,
		};
		update({ columns: [...chartRef.current.columns, column] });
		runColumn(column);
		setNewPrimer(NONE);
	};
	const removeColumn = (column: ChartColumn) =>
		update({
			columns: chartRef.current.columns.filter((x) => x.id !== column.id),
			cells: chartRef.current.cells.filter((x) => x.columnId !== column.id),
		});

	const sameCell = (a: ChartCell, b: ChartCell) =>
		a.limitationUid === b.limitationUid && a.columnId === b.columnId;
	// Any human edit flips the cell to "edited" (clearing approval).
	const editCell = (target: ChartCell, patch: Partial<ChartCell>) =>
		update({
			cells: chartRef.current.cells.map((x) =>
				sameCell(x, target) ? { ...x, ...patch, status: "edited" } : x,
			),
		});
	const setCellStatus = (target: ChartCell, status: CellStatus) =>
		update({
			cells: chartRef.current.cells.map((x) =>
				sameCell(x, target) ? { ...x, status } : x,
			),
		});

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5">
				<p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
					<TriangleAlert className="size-4 shrink-0" />
					<span className="truncate">
						AI-generated — always verify each citation against the source.{" "}
						<Button
							variant="link"
							className="text-[11px] text-muted-foreground px-0"
							onClick={() => navigate({ to: "/profile", hash: "prompt" })}
						>
							See prompts
						</Button>
						.
					</span>
				</p>
				<div className="flex shrink-0 items-center gap-1">
					<ModelPicker
						value={analysisModel}
						onChange={(id) => update({ model: id })}
						provider={provider}
						variant="ghost"
						align="end"
						className="h-7 gap-1.5 px-2 text-xs"
					/>
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground"
						tooltip="Analysis quality is model dependent; we recommend choosing a stronger model."
					>
						<Info />
					</Button>
				</div>
			</div>
			{error && (
				<p className="shrink-0 border-b px-3 py-1.5 text-xs text-destructive">
					{error}
				</p>
			)}

			<div className="flex min-h-0 flex-1 flex-col overflow-auto">
				<table className="w-max border-separate border-spacing-0 text-sm">
					<colgroup>
						<col style={{ width: widthOf("feature", FEATURE_W) }} />
						{columns.map((c) => (
							<col key={c.id} style={{ width: widthOf(c.id, COLUMN_W) }} />
						))}
						<col style={{ width: ADD_W }} />
					</colgroup>
					<thead>
						<tr>
							<th className="sticky top-0 z-20 border-r border-b bg-background px-3 py-2 text-left font-medium text-muted-foreground text-xs">
								Feature
								<ResizeHandle
									width={widthOf("feature", FEATURE_W)}
									onResize={(w) => setWidth("feature", w)}
									onCommit={(w) => persistWidth("feature", w)}
								/>
							</th>
							{columns.map((c) => (
								<th
									key={c.id}
									className="sticky top-0 z-20 border-r border-b bg-background px-3 py-2 text-left align-top font-normal"
								>
									<ColumnHeader
										label={labelFor(c.reference)}
										reference={c.reference}
										primer={c.primer}
										busy={running.has(c.id)}
										onRun={() => runColumn(c)}
										onForceRun={() => runColumn(c, true)}
										onRemove={() => removeColumn(c)}
									/>
									<ResizeHandle
										width={widthOf(c.id, COLUMN_W)}
										onResize={(w) => setWidth(c.id, w)}
										onCommit={(w) => persistWidth(c.id, w)}
									/>
								</th>
							))}
							<th className="sticky top-0 z-20 border-r border-b border-dashed bg-background p-1 text-left align-top">
								<AddColumn
									open={colOpen}
									onOpenChange={setColOpen}
									documents={documents?.map((d) => d.filename) ?? []}
									doc={newDoc}
									setDoc={setNewDoc}
									primer={newPrimer}
									setPrimer={setNewPrimer}
									onAdd={addColumn}
								/>
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((lim, i) => (
							<tr key={lim.uid} className="group">
								<td className="border-r border-b px-2 py-1.5 align-top">
									<FeatureCell
										lim={lim}
										onCommit={(field, value) => commitField(i, field, value)}
										onRemove={() => removeRow(i)}
									/>
								</td>
								{columns.map((c) => (
									<td
										key={c.id}
										className="border-r border-b px-3 py-2 align-top"
									>
										<DisclosureContent
											cell={cellFor(lim.uid, c.id)}
											reference={c.reference}
											running={running.has(c.id)}
											onEdit={editCell}
											onSetStatus={setCellStatus}
										/>
									</td>
								))}
								<td className="border-r border-b border-dashed" />
							</tr>
						))}
						<tr>
							<td className="border-l border-b border-r border-dashed">
								<Button
									variant="ghost"
									size="sm"
									onClick={addRow}
									className="text-muted-foreground"
								>
									<Plus />
									Add row
								</Button>
								<Popover open={claimOpen} onOpenChange={setClaimOpen}>
									<PopoverTrigger asChild>
										<Button
											variant="ghost"
											size="sm"
											className="text-muted-foreground"
										>
											<Plus />
											Add claim
										</Button>
									</PopoverTrigger>
									<PopoverContent align="start" className="w-80 space-y-3">
										<div className="space-y-1.5">
											<Label className="text-xs">Claims document</Label>
											<Select value={claimDoc} onValueChange={setClaimDoc}>
												<SelectTrigger className="w-full text-xs">
													<SelectValue placeholder="Choose a document…" />
												</SelectTrigger>
												<SelectContent>
													{documents?.map((d) => (
														<DocSelectItem
															key={d.filename}
															filename={d.filename}
														/>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-1.5">
											<Label className="text-xs">
												Construction support (optional)
											</Label>
											<Select
												value={claimSupport}
												onValueChange={setClaimSupport}
											>
												<SelectTrigger className="w-full text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={NONE}>None</SelectItem>
													{documents?.map((d) => (
														<DocSelectItem
															key={d.filename}
															filename={d.filename}
														/>
													))}
												</SelectContent>
											</Select>
											<p className="text-[11px] text-muted-foreground leading-snug">
												The description / application as filed — claims are
												construed in light of it (Art 69 EPC). Leave as None if
												the claims document already includes the description.
											</p>
										</div>
										<div className="space-y-1.5">
											<Label className="text-xs">Claims</Label>
											<Input
												value={claimsSpec}
												onChange={(e) => setClaimsSpec(e.target.value)}
												placeholder="1"
											/>
											<p className="text-[11px] text-muted-foreground leading-snug">
												e.g. <code>1</code> · <code>1-3</code> ·{" "}
												<code>1, 4</code> · <code>all independent</code>
											</p>
										</div>
										{parse.isError && (
											<p className="text-xs text-destructive">
												{parse.error instanceof Error
													? parse.error.message
													: "Parse failed."}
											</p>
										)}
										<Button
											size="sm"
											className="w-full"
											disabled={!claimDoc || parse.isPending}
											onClick={addClaim}
											variant={parse.isPending ? "secondary" : "default"}
										>
											{parse.isPending ? (
												<Patrick variant="scanning" />
											) : (
												<Play />
											)}
											{parse.isPending ? "Parsing…" : "Parse & add rows"}
										</Button>
									</PopoverContent>
								</Popover>
							</td>
							<td className="border border-dashed"></td>
						</tr>
					</tbody>
				</table>

				<div className="flex items-center gap-1 p-2"></div>

				{rows.length === 0 && (
					<div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
						<p className="max-w-sm">
							This chart is empty. Use{" "}
							<span className="font-medium">Add claim</span> to parse a claim
							from a document (or <span className="font-medium">Add row</span>{" "}
							manually), then <span className="font-medium">Add column</span> to
							analyse the claim against a reference.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

function ResizeHandle({
	width,
	onResize,
	onCommit,
}: {
	width: number;
	onResize: (w: number) => void;
	/** Fired once on drag-end / keypress with the final width — to persist it. */
	onCommit: (w: number) => void;
}) {
	return (
		<button
			type="button"
			aria-label="Resize column"
			onMouseDown={(e) => {
				e.preventDefault();
				const startX = e.clientX;
				const startW = width;
				let latest = startW;
				const move = (ev: MouseEvent) => {
					latest = startW + ev.clientX - startX;
					onResize(latest);
				};
				const up = () => {
					window.removeEventListener("mousemove", move);
					window.removeEventListener("mouseup", up);
					onCommit(latest);
				};
				window.addEventListener("mousemove", move);
				window.addEventListener("mouseup", up);
			}}
			onKeyDown={(e) => {
				if (e.key === "ArrowLeft") {
					onResize(width - 16);
					onCommit(width - 16);
				}
				if (e.key === "ArrowRight") {
					onResize(width + 16);
					onCommit(width + 16);
				}
			}}
			className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/40"
		/>
	);
}

function InlineEdit({
	value,
	onCommit,
	placeholder,
	className,
	mono,
}: {
	value: string;
	onCommit: (value: string) => void;
	placeholder?: string;
	className?: string;
	mono?: boolean;
}) {
	const [editing, setEditing] = useState(false);
	if (editing)
		return (
			<InlineField
				initial={value}
				mono={mono}
				className={className}
				placeholder={placeholder}
				onDone={(v) => {
					setEditing(false);
					if (v !== value) onCommit(v);
				}}
			/>
		);
	return (
		<button
			type="button"
			onClick={() => setEditing(true)}
			className={cn(
				"w-full cursor-text whitespace-pre-wrap break-words rounded px-1 py-0.5 text-left hover:bg-muted/50",
				!value && "text-muted-foreground/60",
				mono && "font-mono",
				className,
			)}
		>
			{value || placeholder || "—"}
		</button>
	);
}

function InlineField({
	initial,
	onDone,
	className,
	mono,
	placeholder,
}: {
	initial: string;
	onDone: (value: string) => void;
	className?: string;
	mono?: boolean;
	placeholder?: string;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const [draft, setDraft] = useState(initial);
	useEffect(() => {
		const el = ref.current;
		if (el) {
			el.focus();
			el.setSelectionRange(el.value.length, el.value.length);
			el.style.height = "0px";
			el.style.height = `${el.scrollHeight}px`;
		}
	}, []);
	const autosize = (el: HTMLTextAreaElement) => {
		el.style.height = "0px";
		el.style.height = `${el.scrollHeight}px`;
	};
	// A plain textarea pixel-matched to the display button (same font/padding via the
	// shared className, auto-grown to content) so click-to-edit doesn't shift the layout.
	return (
		<textarea
			ref={ref}
			value={draft}
			placeholder={placeholder}
			onChange={(e) => {
				setDraft(e.target.value);
				autosize(e.target);
			}}
			onBlur={() => onDone(draft)}
			className={cn(
				"block w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded bg-transparent px-1 py-0.5 text-left outline-none ring-1 ring-ring/60",
				mono && "font-mono",
				className,
			)}
		/>
	);
}

function FeatureCell({
	lim,
	onCommit,
	onRemove,
}: {
	lim: ClaimLimitation;
	onCommit: (field: keyof ClaimLimitation, value: string) => void;
	onRemove: () => void;
}) {
	return (
		<div className="flex items-start gap-1.5">
			<div className="w-9 shrink-0 pt-0.5">
				<InlineEdit
					value={lim.label}
					onCommit={(v) => onCommit("label", v)}
					placeholder="1a"
					mono
					className="text-muted-foreground text-xs"
				/>
			</div>
			<div className="min-w-0 flex-1 space-y-0.5">
				<InlineEdit
					value={lim.text}
					onCommit={(v) => onCommit("text", v)}
					placeholder="Verbatim limitation…"
					className="text-sm leading-snug"
				/>
				<div className="space-y-0.5 pl-3">
					<InlineEdit
						value={lim.construction}
						onCommit={(v) => onCommit("construction", v)}
						placeholder="add construction…"
						className="text-muted-foreground text-xs"
					/>
					{lim.construction && (
						<InlineEdit
							value={lim.constructionBasis ?? ""}
							onCommit={(v) => onCommit("constructionBasis", v)}
							placeholder="+ basis in spec"
							className="text-[11px] text-muted-foreground/70 italic"
						/>
					)}
				</div>
			</div>
			<div className="shrink-0 opacity-0 group-hover:opacity-100">
				<RowMenu onDelete={onRemove} />
			</div>
		</div>
	);
}

function RowMenu({ onDelete }: { onDelete: () => void }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-xs"
					tooltip="Row actions"
					className="text-muted-foreground"
				>
					<MoreHorizontal />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onSelect={onDelete} variant="destructive">
					<Trash2 />
					Delete row
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function AddColumn({
	open,
	onOpenChange,
	documents,
	doc,
	setDoc,
	primer,
	setPrimer,
	onAdd,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	documents: string[];
	doc: string;
	setDoc: (v: string) => void;
	primer: string;
	setPrimer: (v: string) => void;
	onAdd: () => void;
}) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="sm" className="text-muted-foreground">
					<Plus />
					Add column
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 space-y-3">
				<div className="space-y-1.5">
					<Label className="text-xs">Reference document</Label>
					<Select value={doc} onValueChange={setDoc}>
						<SelectTrigger className="w-full text-xs">
							<SelectValue placeholder="Choose a document…" />
						</SelectTrigger>
						<SelectContent>
							{documents.map((d) => (
								<DocSelectItem key={d} filename={d} />
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label className="text-xs">Primer (optional)</Label>
					<Select value={primer} onValueChange={setPrimer}>
						<SelectTrigger className="w-full text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NONE}>None</SelectItem>
							{documents.map((d) => (
								<DocSelectItem key={d} filename={d} />
							))}
						</SelectContent>
					</Select>
					<p className="text-[11px] text-muted-foreground leading-snug">
						An exam report, search report or product description — shapes how
						this reference is assessed (the analysis lens for this column).
					</p>
				</div>
				<Button size="sm" className="w-full" disabled={!doc} onClick={onAdd}>
					<Play />
					Add &amp; run
				</Button>
			</PopoverContent>
		</Popover>
	);
}

function ColumnHeader({
	label,
	reference,
	primer,
	busy,
	onRun,
	onForceRun,
	onRemove,
}: {
	label: string;
	reference: string;
	primer?: string;
	busy: boolean;
	onRun: () => void;
	onForceRun: () => void;
	onRemove: () => void;
}) {
	return (
		<div className="flex items-start justify-between gap-1">
			<div className="min-w-0">
				<div className="font-medium font-mono text-foreground text-xs">
					{label}
				</div>
				<div className="truncate text-[10px] text-muted-foreground">
					{reference}
				</div>
				{primer && (
					<div className="truncate text-[10px] text-muted-foreground/70">
						+ {primer}
					</div>
				)}
			</div>
			<div className="flex shrink-0 items-center">
				{busy ? (
					<Patrick variant="scanning" className="w-4 h-4" />
				) : (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon-xs"
								tooltip="Column actions"
								className="text-muted-foreground"
							>
								<MoreHorizontal />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem onSelect={onRun}>
								<Play />
								Re-run
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={onForceRun}>
								<RotateCcw />
								Re-run &amp; overwrite edits
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onSelect={onRemove} variant="destructive">
								<Trash2 />
								Remove column
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
		</div>
	);
}

function DisclosureContent({
	cell,
	reference,
	running,
	onEdit,
	onSetStatus,
}: {
	cell: ChartCell | undefined;
	reference: string;
	running: boolean;
	onEdit: (cell: ChartCell, patch: Partial<ChartCell>) => void;
	onSetStatus: (cell: ChartCell, status: CellStatus) => void;
}) {
	// h-full would collapse here — a <td> is content-height (auto), so 100% has nothing to
	// resolve against. Explicit-height lines that echo the cell shape (pill + reasoning).
	const reading = (
		<div className="space-y-2">
			<Skeleton className="h-5 w-16 rounded" />
			<Skeleton className="h-3 w-full" />
			<Skeleton className="h-3 w-4/5" />
		</div>
	);
	if (!cell)
		return running ? (
			reading
		) : (
			<span className="text-muted-foreground text-xs">—</span>
		);
	const status = cell.status ?? "ai";
	const approved = status === "approved";
	// During a run the cells that will be refreshed (AI / stale) blank to a spinner so you
	// can see them get replaced; edited/approved cells stay put.
	if (running && (status === "ai" || status === "stale")) return reading;
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className={cn(
									"rounded px-1.5 py-0.5 font-semibold text-xs uppercase tracking-wide",
									DISCLOSURE_STYLE[cell.disclosureType],
								)}
							>
								{cell.disclosureType}
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							{VERDICTS.map((t) => (
								<DropdownMenuItem
									key={t}
									onSelect={() => onEdit(cell, { disclosureType: t })}
								>
									{t}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<div>
					<Button
						variant="bare"
						size="xs"
						tooltip={approved ? "Click to mark unchecked" : "Mark as checked"}
						onClick={() => onSetStatus(cell, approved ? "ai" : "approved")}
					>
						<span
							className={cn(
								"rounded px-1 py-0.5 font-medium text-[10px] uppercase tracking-wide",
								STATUS_STYLE[status].className,
							)}
						>
							{STATUS_STYLE[status].label}
						</span>
					</Button>
				</div>
			</div>

			<InlineEdit
				value={cell.reasoning}
				onCommit={(v) => onEdit(cell, { reasoning: v })}
				placeholder="reasoning…"
				className="text-xs leading-snug"
			/>
			<CitationList
				citations={cell.citations}
				reference={reference}
				onChange={(c) => onEdit(cell, { citations: c })}
			/>
		</div>
	);
}

function CitationList({
	citations,
	reference,
	onChange,
}: {
	citations: ChartCitation[];
	reference: string;
	onChange: (citations: ChartCitation[]) => void;
}) {
	const { goToCitation } = useCitationNav();
	const [addOpen, setAddOpen] = useState(false);
	const [draft, setDraft] = useState("");
	const add = () => {
		const v = draft.trim();
		if (v) onChange([...citations, { location: v }]);
		setDraft("");
		setAddOpen(false);
	};
	const remove = (i: number) =>
		onChange(citations.filter((_, idx) => idx !== i));
	// Citations are chips, not editable text: click one to jump to the cited passage, ✕ to
	// remove. A chip with a snippet is "linked" (located precisely); a typed-label-only one is
	// best-effort (navigated by parsing the label). Editing a label would desync it from its
	// locator, so we add/remove rather than edit.
	return (
		<div className="flex flex-wrap items-center gap-1">
			{citations.map((cit, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: citations have no stable id
					key={i}
					className="group/c inline-flex items-center gap-0.5 rounded border bg-muted/50 py-0.5 pr-0.5 pl-1.5 text-[11px] text-muted-foreground"
				>
					<button
						type="button"
						title="Go to the cited passage in the reference"
						className="inline-flex items-center gap-1 hover:text-foreground"
						onClick={() =>
							goToCitation(reference, cit.snippet ?? "", cit.location)
						}
					>
						<Locate
							className={cn(
								"size-3",
								cit.snippet ? "opacity-70" : "opacity-30",
							)}
						/>
						<span className="font-mono">{cit.location || "—"}</span>
					</button>
					<button
						type="button"
						title="Remove citation"
						className="rounded opacity-0 hover:bg-muted group-hover/c:opacity-100"
						onClick={() => remove(i)}
					>
						<X className="size-2.5" />
					</button>
				</span>
			))}
			<Popover
				open={addOpen}
				onOpenChange={(o) => {
					setAddOpen(o);
					if (!o) setDraft("");
				}}
			>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="xs"
						tooltip="Add a citation"
						className="h-5 px-1 text-muted-foreground"
					>
						<Plus className="size-3" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-52 p-1.5">
					<Input
						value={draft}
						autoFocus
						placeholder="leaf 6, ll. 5–12  /  [0021]"
						className="h-7 text-xs"
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") add();
						}}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
