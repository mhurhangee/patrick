import type {
	CellStatus,
	Chart,
	ChartCell,
	ChartCitation,
	ChartColumn,
	ClaimLimitation,
	DisclosureType,
} from "@patrick/shared";
import { docKind } from "@patrick/shared";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { DocIcon } from "@/components/doc-icon";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
import { useTaskDocuments } from "@/hooks/use-tasks";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { cn } from "@/lib/utils";

const FEATURE_W = 380;
const COLUMN_W = 360;

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
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const { data: documents } = useTaskDocuments(activeTaskId);
	const save = useSaveChart(activeTaskId);
	const parse = useParseChart(activeTaskId, chart.id);

	// chartRef holds the freshest chart so async ops never save against a stale copy.
	const chartRef = useRef(chart);
	chartRef.current = chart;
	// Defensive defaults so a pre-v2 chart on disk degrades to empty rather than crashing.
	const [rows, setRows] = useState<ClaimLimitation[]>(chart.limitations ?? []);
	const rowsRef = useRef(rows);
	rowsRef.current = rows;
	const [widths, setWidths] = useState<Record<string, number>>({});
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
	const cellFor = (uid: string, columnId: string) =>
		cells.find((x) => x.limitationUid === uid && x.columnId === columnId);

	const widthOf = (id: string, fallback: number) => widths[id] ?? fallback;
	const setWidth = (id: string, w: number) =>
		setWidths((p) => ({ ...p, [id]: Math.max(140, w) }));

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

	const runColumn = async (column: ChartColumn) => {
		if (!activeTaskId || !activeProfileId || running.has(column.id)) return;
		const taskId = activeTaskId;
		const profileId = activeProfileId;
		setRunning((s) => new Set(s).add(column.id));
		setError(null);
		try {
			const reads = await tasksApi.readReference(taskId, chart.id, {
				profileId,
				reference: column.reference,
				primer: column.primer,
				limitations: rowsRef.current,
			});
			const byLabel = new Map(rowsRef.current.map((l) => [l.label, l.uid]));
			const existing = new Map(
				chartRef.current.cells
					.filter((c) => c.columnId === column.id)
					.map((c) => [c.limitationUid, c]),
			);
			const cells: ChartCell[] = [];
			for (const r of reads) {
				const uid = byLabel.get(r.limitationLabel);
				if (!uid) continue;
				const prev = existing.get(uid);
				// Preserve human work; refresh AI / stale / new cells.
				if (prev && (prev.status === "edited" || prev.status === "approved")) {
					cells.push(prev);
				} else {
					cells.push({
						limitationUid: uid,
						columnId: column.id,
						disclosureType: r.disclosed,
						reasoning: r.reasoning,
						citations: r.citation ? [r.citation] : [],
						status: "ai",
					});
				}
			}
			update({
				cells: [
					...chartRef.current.cells.filter((x) => x.columnId !== column.id),
					...cells,
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
					</colgroup>
					<thead>
						<tr>
							<th className="sticky top-0 z-20 border-r border-b bg-background px-3 py-2 text-left font-medium text-muted-foreground text-xs">
								Feature
								<ResizeHandle
									width={widthOf("feature", FEATURE_W)}
									onResize={(w) => setWidth("feature", w)}
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
										running={running.has(c.id)}
										onRun={() => runColumn(c)}
										onRemove={() => removeColumn(c)}
									/>
									<ResizeHandle
										width={widthOf(c.id, COLUMN_W)}
										onResize={(w) => setWidth(c.id, w)}
									/>
								</th>
							))}
							{columns.length === 0 && (
								<th className="sticky top-0 z-20 border-r border-b border-dashed bg-background px-3 py-2 text-left align-top font-normal text-muted-foreground/40 text-xs">
									Disclosure
								</th>
							)}
							<th className="sticky top-0 z-20 bg-background p-1 align-top">
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
											running={running.has(c.id)}
											onEdit={editCell}
											onSetStatus={setCellStatus}
										/>
									</td>
								))}
								{columns.length === 0 && (
									<td className="border-r border-b border-dashed" />
								)}
							</tr>
						))}
					</tbody>
				</table>

				<div className="flex items-center gap-1 p-2">
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
											<DocSelectItem key={d.filename} filename={d.filename} />
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs">
									Construction support (optional)
								</Label>
								<Select value={claimSupport} onValueChange={setClaimSupport}>
									<SelectTrigger className="w-full text-xs">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE}>None</SelectItem>
										{documents?.map((d) => (
											<DocSelectItem key={d.filename} filename={d.filename} />
										))}
									</SelectContent>
								</Select>
								<p className="text-[11px] text-muted-foreground leading-snug">
									The description / application as filed — claims are construed
									in light of it (Art 69 EPC). Leave as None if the claims
									document already includes the description.
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
									e.g. <code>1</code> · <code>1-3</code> · <code>1, 4</code> ·{" "}
									<code>all independent</code>
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
							>
								{parse.isPending ? (
									<Loader2 className="animate-spin" />
								) : (
									<Sparkles />
								)}
								{parse.isPending ? "Parsing…" : "Parse & add rows"}
							</Button>
						</PopoverContent>
					</Popover>
				</div>

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
}: {
	width: number;
	onResize: (w: number) => void;
}) {
	return (
		<button
			type="button"
			aria-label="Resize column"
			onMouseDown={(e) => {
				e.preventDefault();
				const startX = e.clientX;
				const startW = width;
				const move = (ev: MouseEvent) => onResize(startW + ev.clientX - startX);
				const up = () => {
					window.removeEventListener("mousemove", move);
					window.removeEventListener("mouseup", up);
				};
				window.addEventListener("mousemove", move);
				window.addEventListener("mouseup", up);
			}}
			onKeyDown={(e) => {
				if (e.key === "ArrowLeft") onResize(width - 16);
				if (e.key === "ArrowRight") onResize(width + 16);
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
			<Button
				variant="ghost"
				size="icon-xs"
				tooltip="Delete row"
				className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
				onClick={onRemove}
			>
				<Trash2 />
			</Button>
		</div>
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
					<Sparkles />
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
	running,
	onRun,
	onRemove,
}: {
	label: string;
	reference: string;
	primer?: string;
	running: boolean;
	onRun: () => void;
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
				<Button
					variant="ghost"
					size="icon-xs"
					tooltip="Re-run"
					disabled={running}
					onClick={onRun}
					className="text-muted-foreground"
				>
					{running ? <Loader2 className="animate-spin" /> : <Sparkles />}
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					tooltip="Remove column"
					onClick={onRemove}
					className="text-muted-foreground"
				>
					<X />
				</Button>
			</div>
		</div>
	);
}

function DisclosureContent({
	cell,
	running,
	onEdit,
	onSetStatus,
}: {
	cell: ChartCell | undefined;
	running: boolean;
	onEdit: (cell: ChartCell, patch: Partial<ChartCell>) => void;
	onSetStatus: (cell: ChartCell, status: CellStatus) => void;
}) {
	const reading = (
		<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
			<Loader2 className="size-3 animate-spin" />
			reading…
		</span>
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
				onChange={(c) => onEdit(cell, { citations: c })}
			/>
		</div>
	);
}

function CitationList({
	citations,
	onChange,
}: {
	citations: ChartCitation[];
	onChange: (citations: ChartCitation[]) => void;
}) {
	const set = (i: number, patch: Partial<ChartCitation>) =>
		onChange(citations.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
	return (
		<div className="space-y-1.5">
			{citations.map((cit, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: citations have no stable id
					key={i}
					className="group/c rounded-sm text-muted-foreground bg-muted/50 py-1 pr-1 pl-2 text-xs italic"
				>
					<div className="flex items-start gap-1">
						<div className="min-w-0 flex-1">
							<InlineEdit
								value={cit.quote}
								onCommit={(v) => set(i, { quote: v })}
								placeholder="quote…"
							/>
							<InlineEdit
								value={cit.location ?? ""}
								onCommit={(v) => set(i, { location: v })}
								placeholder="location"
								className="text-[11px]"
							/>
						</div>
						<Button
							variant="ghost"
							size="icon-xxs"
							tooltip="Remove citation"
							className="shrink-0 text-muted-foreground opacity-0 group-hover/c:opacity-100"
							onClick={() => onChange(citations.filter((_, idx) => idx !== i))}
						>
							<X />
						</Button>
					</div>
				</div>
			))}
			<Button
				variant="ghost"
				size="sm"
				className="h-6 gap-1 px-1 text-[11px] text-muted-foreground"
				onClick={() => onChange([...citations, { quote: "", location: "" }])}
			>
				<Plus className="size-3" />
				citation
			</Button>
		</div>
	);
}
