import type {
	Chart,
	ChartCell,
	ChartCitation,
	ChartColumn,
	ChartMethod,
	ClaimLimitation,
	DisclosureType,
} from "@patrick/shared";
import { Check, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useChart, useParseChart, useSaveChart } from "@/hooks/use-charts";
import { useTaskDocuments } from "@/hooks/use-tasks";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { searchDocument } from "@/lib/search/doc-index";
import { cn } from "@/lib/utils";

const CITE_TOP_K = 2;
const SEMANTIC_TOP_K = 8;
const FEATURE_W = 380;
const COLUMN_W = 360;

const DISCLOSURE_STYLE: Record<DisclosureType, string> = {
	Express: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
	Derived: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
	Suggested: "bg-amber-500/15 text-amber-700 dark:text-amber-600",
	Absent: "bg-muted text-muted-foreground",
};

const METHODS: { value: ChartMethod; label: string }[] = [
	{ value: "full-doc", label: "Full-doc (read gives cite)" },
	{ value: "hybrid", label: "Hybrid (read → search cite)" },
	{ value: "semantic", label: "Semantic (search → classify)" },
];
const METHOD_SHORT: Record<ChartMethod, string> = {
	hybrid: "hybrid",
	"full-doc": "full-doc",
	semantic: "semantic",
};

const colKey = (reference: string, method: ChartMethod) =>
	`${reference}::${method}`;

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

// One table. Rows are limitations; columns are (reference × method) analyses. Click a
// cell to edit it, drag a column border to resize, add a column on the right.
function ChartTable({ chart }: { chart: Chart }) {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const { data: documents } = useTaskDocuments(activeTaskId);
	const save = useSaveChart(activeTaskId);
	const parse = useParseChart(activeTaskId, chart.id);

	// chartRef always holds the freshest chart (the prop tracks the query cache), so
	// async ops (add column → run → save) never save against a stale copy and clobber.
	const chartRef = useRef(chart);
	chartRef.current = chart;
	const [rows, setRows] = useState<ClaimLimitation[]>(chart.spine);
	const rowsRef = useRef(rows);
	rowsRef.current = rows;
	const [widths, setWidths] = useState<Record<string, number>>({});
	const [running, setRunning] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);

	const [colOpen, setColOpen] = useState(false);
	const [newDoc, setNewDoc] = useState("");
	const [newMethod, setNewMethod] = useState<ChartMethod>("full-doc");
	const [claimOpen, setClaimOpen] = useState(false);
	const [claimDoc, setClaimDoc] = useState("");
	const [claimNo, setClaimNo] = useState("1");

	const columns = chart.columns;
	const distinctRefs = [...new Set(columns.map((c) => c.reference))];
	const labelFor = (f: string) => `D${distinctRefs.indexOf(f) + 1}`;
	const cellFor = (limId: string, c: ChartColumn) =>
		chart.cells.find(
			(x) =>
				x.limitationId === limId &&
				x.reference === c.reference &&
				x.method === c.method,
		);
	const isRunning = (c: ChartColumn) =>
		running.has(colKey(c.reference, c.method));
	const widthOf = (id: string, fallback: number) => widths[id] ?? fallback;
	const setWidth = (id: string, w: number) =>
		setWidths((p) => ({ ...p, [id]: Math.max(140, w) }));

	// Every save is based on chartRef.current (fresh) + the live rows.
	const update = (patch: Partial<Chart>) =>
		save.mutate({ ...chartRef.current, spine: rowsRef.current, ...patch });
	const saveSpine = (next: ClaimLimitation[]) =>
		save.mutate({ ...chartRef.current, spine: next });

	const commitField = (
		i: number,
		key: keyof ClaimLimitation,
		value: string,
	) => {
		const next = rowsRef.current.map((r, idx) =>
			idx === i ? { ...r, [key]: value } : r,
		);
		setRows(next);
		saveSpine(next);
	};
	const addRow = () => {
		const next = [...rowsRef.current, { id: "", text: "", construction: "" }];
		setRows(next);
		saveSpine(next);
	};
	const removeRow = (i: number) => {
		const next = rowsRef.current.filter((_, idx) => idx !== i);
		setRows(next);
		saveSpine(next);
	};
	const addClaim = async () => {
		if (!claimDoc || !activeProfileId) return;
		const { limitations } = await parse.mutateAsync({
			filename: claimDoc,
			profileId: activeProfileId,
			claim: claimNo || "1",
		});
		const next = [...rowsRef.current, ...limitations];
		setRows(next);
		saveSpine(next);
		setClaimOpen(false);
		setClaimNo((n) => String((Number.parseInt(n, 10) || 0) + 1));
	};

	const mkCell =
		(reference: string, method: ChartMethod) =>
		(
			limitationId: string,
			disclosureType: DisclosureType,
			reasoning: string,
			citations: ChartCitation[],
			teaching?: string,
		): ChartCell => ({
			limitationId,
			reference,
			method,
			disclosureType,
			teaching,
			reasoning,
			citations,
			checked: false,
			spineVersion: chart.spineVersion,
		});

	const runColumn = async (reference: string, method: ChartMethod) => {
		const key = colKey(reference, method);
		if (!activeTaskId || !activeProfileId || running.has(key)) return;
		const taskId = activeTaskId;
		const profileId = activeProfileId;
		const mk = mkCell(reference, method);
		setRunning((s) => new Set(s).add(key));
		setError(null);
		try {
			let cells: ChartCell[];
			if (method === "semantic") {
				cells = await Promise.all(
					rowsRef.current.map(async (lim) => {
						const o = await searchDocument(
							taskId,
							reference,
							lim.text,
							[],
							SEMANTIC_TOP_K,
						);
						if (!o.ok)
							return mk(
								lim.id,
								"Absent",
								o.reason === "no-text"
									? "No extractable text — extract or OCR this reference first."
									: "No relevant passages retrieved.",
								[],
							);
						const cls = await tasksApi.classifyCell(taskId, chart.id, {
							profileId,
							limitation: lim,
							passages: o.passages.map((p) => ({ text: p.text, page: p.page })),
						});
						const cites = cls.passages
							.map((i) => o.passages[i])
							.filter((p): p is NonNullable<typeof p> => !!p)
							.map((p) => ({ quote: p.text, location: `Page ${p.page}` }));
						return mk(lim.id, cls.disclosureType, cls.reasoning, cites);
					}),
				);
			} else {
				const reads = await tasksApi.readReference(taskId, chart.id, {
					profileId,
					reference,
					primer: chartRef.current.primer,
					limitations: rowsRef.current,
				});
				cells = await Promise.all(
					reads.map(async (r) => {
						let cites: ChartCitation[] = [];
						if (r.disclosed !== "Absent") {
							if (method === "full-doc" && r.citation) cites = [r.citation];
							else if (r.hint) {
								const o = await searchDocument(
									taskId,
									reference,
									r.hint,
									[],
									CITE_TOP_K,
								);
								const p = o.ok ? o.passages[0] : undefined;
								if (p) cites = [{ quote: p.text, location: `Page ${p.page}` }];
							}
						}
						return mk(
							r.limitationId,
							r.disclosed,
							r.reasoning,
							cites,
							r.teaching,
						);
					}),
				);
			}
			// Merge into the FRESH chart so the column (added just before) survives.
			update({
				cells: [
					...chartRef.current.cells.filter(
						(x) => !(x.reference === reference && x.method === method),
					),
					...cells,
				],
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Run failed.");
		} finally {
			setRunning((s) => {
				const n = new Set(s);
				n.delete(key);
				return n;
			});
		}
	};

	const addColumn = () => {
		setColOpen(false);
		if (!newDoc) return;
		if (
			!chartRef.current.columns.some(
				(c) => c.reference === newDoc && c.method === newMethod,
			)
		)
			update({
				columns: [
					...chartRef.current.columns,
					{ reference: newDoc, method: newMethod },
				],
			});
		runColumn(newDoc, newMethod);
	};
	const removeColumn = (c: ChartColumn) =>
		update({
			columns: chartRef.current.columns.filter(
				(x) => !(x.reference === c.reference && x.method === c.method),
			),
			cells: chartRef.current.cells.filter(
				(x) => !(x.reference === c.reference && x.method === c.method),
			),
		});
	const setChecked = (target: ChartCell, value: boolean) =>
		update({
			cells: chartRef.current.cells.map((x) =>
				x.limitationId === target.limitationId &&
				x.reference === target.reference &&
				x.method === target.method
					? { ...x, checked: value }
					: x,
			),
		});

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
				<Select
					value={chart.primer ?? "__none__"}
					onValueChange={(v) =>
						update({ primer: v === "__none__" ? undefined : v })
					}
				>
					<SelectTrigger className="h-7 w-40 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__none__">Primer: none</SelectItem>
						{documents?.map((d) => (
							<SelectItem key={d.filename} value={d.filename}>
								Primer: {d.filename}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{error && (
					<span className="truncate text-xs text-destructive">{error}</span>
				)}
			</div>

			<div className="min-h-0 flex-1 overflow-auto">
				<table className="w-max border-separate border-spacing-0 text-sm">
					<colgroup>
						<col style={{ width: widthOf("feature", FEATURE_W) }} />
						{columns.map((c) => (
							<col
								key={colKey(c.reference, c.method)}
								style={{
									width: widthOf(colKey(c.reference, c.method), COLUMN_W),
								}}
							/>
						))}
						<col style={{ width: 48 }} />
					</colgroup>
					<thead>
						<tr>
							<th className="relative border-r border-b bg-background px-3 py-2 text-left font-medium text-muted-foreground text-xs">
								Feature
								<ResizeHandle
									width={widthOf("feature", FEATURE_W)}
									onResize={(w) => setWidth("feature", w)}
								/>
							</th>
							{columns.map((c) => (
								<th
									key={colKey(c.reference, c.method)}
									className="relative border-r border-b bg-background px-3 py-2 text-left align-top font-normal"
								>
									<ColumnHeader
										label={labelFor(c.reference)}
										reference={c.reference}
										method={c.method}
										running={isRunning(c)}
										onRun={() => runColumn(c.reference, c.method)}
										onRemove={() => removeColumn(c)}
									/>
									<ResizeHandle
										width={widthOf(colKey(c.reference, c.method), COLUMN_W)}
										onResize={(w) => setWidth(colKey(c.reference, c.method), w)}
									/>
								</th>
							))}
							<th className="border-b bg-background p-1 align-top">
								<AddColumn
									open={colOpen}
									onOpenChange={setColOpen}
									documents={documents?.map((d) => d.filename) ?? []}
									doc={newDoc}
									setDoc={setNewDoc}
									method={newMethod}
									setMethod={setNewMethod}
									onAdd={addColumn}
								/>
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((lim, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: editable rows have no stable id
							<tr key={i} className="group">
								<td className="border-r border-b px-2 py-1.5 align-top">
									<FeatureCell
										lim={lim}
										onCommit={(field, value) => commitField(i, field, value)}
										onRemove={() => removeRow(i)}
									/>
								</td>
								{columns.map((c) => (
									<td
										key={colKey(c.reference, c.method)}
										className="border-r border-b px-3 py-2 align-top"
									>
										<DisclosureContent
											cell={cellFor(lim.id, c)}
											running={isRunning(c)}
											onChecked={setChecked}
										/>
									</td>
								))}
								<td className="border-b" />
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
						<PopoverContent align="start" className="w-72 space-y-3">
							<div className="space-y-1.5">
								<Label className="text-xs">Claims document</Label>
								<Select value={claimDoc} onValueChange={setClaimDoc}>
									<SelectTrigger className="w-full text-xs">
										<SelectValue placeholder="Choose a document…" />
									</SelectTrigger>
									<SelectContent>
										{documents?.map((d) => (
											<SelectItem key={d.filename} value={d.filename}>
												{d.filename}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs">Claim number</Label>
								<Input
									value={claimNo}
									onChange={(e) => setClaimNo(e.target.value)}
									className="w-24"
								/>
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
			</div>
		</div>
	);
}

// Drag handle on a column's right border.
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

// Click-to-edit text: looks like content, becomes a field on click, commits on blur.
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
}: {
	initial: string;
	onDone: (value: string) => void;
	className?: string;
	mono?: boolean;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const [draft, setDraft] = useState(initial);
	useEffect(() => {
		const el = ref.current;
		if (el) {
			el.focus();
			el.setSelectionRange(el.value.length, el.value.length);
		}
	}, []);
	return (
		<Textarea
			ref={ref}
			value={draft}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={() => onDone(draft)}
			rows={1}
			className={cn(
				"min-h-0 w-full resize-y px-1 py-0.5",
				mono && "font-mono",
				className,
			)}
		/>
	);
}

// The Feature cell — ID, verbatim limitation and construction together (one cell).
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
					value={lim.id}
					onCommit={(v) => onCommit("id", v)}
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
				<div className="flex items-start gap-1 text-xs text-muted-foreground">
					<span className="shrink-0 pt-0.5 font-medium">Constr.</span>
					<InlineEdit
						value={lim.construction}
						onCommit={(v) => onCommit("construction", v)}
						placeholder="add construction…"
						className="text-xs"
					/>
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
	method,
	setMethod,
	onAdd,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	documents: string[];
	doc: string;
	setDoc: (v: string) => void;
	method: ChartMethod;
	setMethod: (v: ChartMethod) => void;
	onAdd: () => void;
}) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="icon-sm" tooltip="Add column">
					<Plus />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 space-y-3">
				<div className="space-y-1.5">
					<Label className="text-xs">Reference document</Label>
					<Select value={doc} onValueChange={setDoc}>
						<SelectTrigger className="w-full text-xs">
							<SelectValue placeholder="Choose a document…" />
						</SelectTrigger>
						<SelectContent>
							{documents.map((d) => (
								<SelectItem key={d} value={d}>
									{d}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label className="text-xs">Method</Label>
					<Select
						value={method}
						onValueChange={(v) => setMethod(v as ChartMethod)}
					>
						<SelectTrigger className="w-full text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{METHODS.map((m) => (
								<SelectItem key={m.value} value={m.value}>
									{m.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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
	method,
	running,
	onRun,
	onRemove,
}: {
	label: string;
	reference: string;
	method: ChartMethod;
	running: boolean;
	onRun: () => void;
	onRemove: () => void;
}) {
	return (
		<div className="flex items-start justify-between gap-1">
			<div className="min-w-0">
				<div className="text-xs">
					<span className="font-medium font-mono text-foreground">{label}</span>
					<span className="ml-1.5 text-muted-foreground">
						{METHOD_SHORT[method]}
					</span>
				</div>
				<div className="truncate text-[10px] text-muted-foreground">
					{reference}
				</div>
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
	onChecked,
}: {
	cell: ChartCell | undefined;
	running: boolean;
	onChecked: (cell: ChartCell, value: boolean) => void;
}) {
	if (!cell)
		return (
			<span className="text-muted-foreground text-xs">
				{running ? "reading…" : "—"}
			</span>
		);
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<span
					className={cn(
						"rounded px-1.5 py-0.5 font-semibold text-xs uppercase tracking-wide",
						DISCLOSURE_STYLE[cell.disclosureType],
					)}
				>
					{cell.disclosureType}
				</span>
				<Button
					variant={cell.checked ? "secondary" : "ghost"}
					size="icon-xs"
					tooltip={cell.checked ? "Verified" : "Mark verified"}
					onClick={() => onChecked(cell, !cell.checked)}
				>
					<Check
						className={
							cell.checked
								? "text-emerald-600 dark:text-emerald-400"
								: "text-muted-foreground"
						}
					/>
				</Button>
			</div>
			{cell.citations.map((cit) => (
				<blockquote
					key={cit.quote.slice(0, 48)}
					className="break-words rounded-sm border-primary/40 border-l-2 bg-muted/50 px-2 py-1 text-xs italic"
				>
					“{cit.quote}”
					{cit.location && (
						<span className="mt-0.5 block text-[11px] text-muted-foreground not-italic">
							{cit.location}
						</span>
					)}
				</blockquote>
			))}
			<p className="break-words text-sm leading-snug">{cell.reasoning}</p>
			{cell.teaching && (
				<p className="break-words border-border/60 border-t pt-1.5 text-[11px] text-muted-foreground">
					<span className="font-semibold uppercase tracking-wide">
						Teaching
					</span>
					<span className="mt-0.5 block">{cell.teaching}</span>
				</p>
			)}
		</div>
	);
}
