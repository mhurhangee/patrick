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
import { useTaskDocuments } from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";

export type DocKind = "pdf" | "docx";
export type WorkspaceDoc = {
	id: string;
	label: string;
	kind: DocKind;
	/** Patrick-created docs are editable; originals are read-only. */
	editable: boolean;
};

function kindOf(filename: string): DocKind {
	return filename.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
}

export type Columns = Record<string, string[]>;
export type WorkspaceColumn = { id: string; tabs: string[] };

type WorkspaceContextValue = {
	columnList: WorkspaceColumn[];
	columns: Columns;
	focused: string | null;
	/** Resolve an open doc id (filename) to its display shape. */
	getDoc: (id: string) => WorkspaceDoc | undefined;
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

	const docMap = useMemo(() => {
		const map = new Map<string, WorkspaceDoc>();
		for (const d of documents ?? []) {
			const kind = kindOf(d.filename);
			map.set(d.filename, {
				id: d.filename,
				label: d.filename,
				kind,
				editable: kind === "docx" && !!d.createdInPatrick,
			});
		}
		return map;
	}, [documents]);

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
	}, [columns, order, focused, docMap]);

	return (
		<WorkspaceContext.Provider value={value}>
			{children}
		</WorkspaceContext.Provider>
	);
}
