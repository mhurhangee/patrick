import { type ChartType, docKind, isEditableDoc } from "@patrick/shared";
import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useCharts } from "@/hooks/use-charts";
import { useTaskDocuments } from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";

export type DocKind = "pdf" | "docx" | "text";
export type WorkspaceDoc = {
	id: string;
	label: string;
	kind: DocKind;
	/** Patrick-created docs are editable; originals are read-only. */
	editable: boolean;
	/** Per-doc chat prompts generated alongside its label (suggestLabel). */
	suggestions?: string[];
};

/** A chart open as a tab in the content surface (alongside documents). */
export type WorkspaceChart = { id: string; label: string; type: ChartType };

export type Columns = Record<string, string[]>;
export type WorkspaceColumn = { id: string; tabs: string[] };

type WorkspaceContextValue = {
	columnList: WorkspaceColumn[];
	columns: Columns;
	focused: string | null;
	/** Resolve an open doc id (filename) to its display shape. */
	getDoc: (id: string) => WorkspaceDoc | undefined;
	/** Resolve an open chart id (uuid) to its display shape. */
	getChart: (id: string) => WorkspaceChart | undefined;
	isOpen: (id: string) => boolean;
	open: (id: string) => void;
	focus: (id: string) => void;
	close: (id: string) => void;
	splitRight: (id: string) => void;
	setColumns: Dispatch<SetStateAction<Columns>>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
	const ctx = useContext(WorkspaceContext);
	if (!ctx)
		throw new Error("useWorkspace must be used within WorkspaceProvider");
	return ctx;
}

let columnSeq = 1;
const nextColumnId = () => `col-${columnSeq++}`;

function findColumnOf(columns: Columns, id: string): string | undefined {
	return Object.keys(columns).find((c) => columns[c]?.includes(id));
}

function firstOpenDoc(columns: Columns, order: string[]): string | null {
	for (const c of order) {
		const first = columns[c]?.[0];
		if (first) return first;
	}
	return null;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const { activeTaskId } = useActiveTask();
	const { data: documents } = useTaskDocuments(activeTaskId);
	const { data: charts } = useCharts(activeTaskId);

	const docMap = useMemo(() => {
		const map = new Map<string, WorkspaceDoc>();
		for (const d of documents ?? []) {
			const kind = docKind(d.filename);
			map.set(d.filename, {
				id: d.filename,
				label: d.filename,
				kind,
				editable: isEditableDoc(d),
				suggestions: d.suggestions,
			});
		}
		return map;
	}, [documents]);

	const chartMap = useMemo(() => {
		const map = new Map<string, WorkspaceChart>();
		for (const c of charts ?? []) {
			map.set(c.id, { id: c.id, label: c.title, type: c.type });
		}
		return map;
	}, [charts]);

	const [columns, setColumns] = useState<Columns>({ "col-0": [] });
	const [order, setOrder] = useState<string[]>(["col-0"]);
	const [focused, setFocused] = useState<string | null>(null);

	// Switching tasks closes everything (a different folder = different context),
	// without remounting the shell (keeps panel sizes).
	const prevTask = useRef(activeTaskId);
	useEffect(() => {
		if (prevTask.current !== activeTaskId) {
			prevTask.current = activeTaskId;
			setColumns({ "col-0": [] });
			setOrder(["col-0"]);
			setFocused(null);
		}
	}, [activeTaskId]);

	const value = useMemo<WorkspaceContextValue>(() => {
		const columnList = order
			.map((id) => ({ id, tabs: columns[id] ?? [] }))
			.filter((c) => c.tabs.length > 0);

		return {
			columnList,
			columns,
			focused,
			setColumns,
			getDoc: (id) => docMap.get(id),
			getChart: (id) => chartMap.get(id),
			isOpen: (id) => findColumnOf(columns, id) !== undefined,
			open: (id) => {
				setColumns((cols) => {
					if (findColumnOf(cols, id)) return cols;
					const target =
						(focused && findColumnOf(cols, focused)) ?? order[0] ?? "col-0";
					return { ...cols, [target]: [...(cols[target] ?? []), id] };
				});
				setFocused(id);
			},
			focus: (id) => setFocused(id),
			close: (id) => {
				setColumns((cols) => {
					const next: Columns = {};
					for (const c of Object.keys(cols)) {
						next[c] = (cols[c] ?? []).filter((t) => t !== id);
					}
					setFocused((f) => (f === id ? firstOpenDoc(next, order) : f));
					return next;
				});
			},
			splitRight: (id) => {
				const newCol = nextColumnId();
				setColumns((cols) => {
					const next: Columns = {};
					for (const c of Object.keys(cols)) {
						next[c] = (cols[c] ?? []).filter((t) => t !== id);
					}
					next[newCol] = [id];
					return next;
				});
				setOrder((o) => [...o, newCol]);
				setFocused(id);
			},
		};
	}, [columns, order, focused, docMap, chartMap]);

	return (
		<WorkspaceContext.Provider value={value}>
			{children}
		</WorkspaceContext.Provider>
	);
}
