import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useContext,
	useMemo,
	useState,
} from "react";
import { mockArtifacts, mockSources } from "@/lib/mock-data";

export type WorkspaceDoc = { id: string; label: string; kind: "pdf" | "docx" };

const allDocs: WorkspaceDoc[] = [
	...mockSources.map((s) => ({ id: s.id, label: s.filename, kind: s.kind })),
	...mockArtifacts.map((a) => ({
		id: a.id,
		label: a.title,
		kind: "docx" as const,
	})),
];
const docMap = new Map(allDocs.map((d) => [d.id, d]));

export function getDoc(id: string): WorkspaceDoc | undefined {
	return docMap.get(id);
}

export type Columns = Record<string, string[]>;
export type WorkspaceColumn = { id: string; tabs: string[] };

type WorkspaceContextValue = {
	columnList: WorkspaceColumn[];
	columns: Columns;
	focused: string | null;
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
	const [columns, setColumns] = useState<Columns>({
		"col-0": ["s1", "s2", "a1"],
	});
	const [order, setOrder] = useState<string[]>(["col-0"]);
	const [focused, setFocused] = useState<string | null>("a1");

	const value = useMemo<WorkspaceContextValue>(() => {
		const columnList = order
			.map((id) => ({ id, tabs: columns[id] ?? [] }))
			.filter((c) => c.tabs.length > 0);

		return {
			columnList,
			columns,
			focused,
			setColumns,
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
	}, [columns, order, focused]);

	return (
		<WorkspaceContext.Provider value={value}>
			{children}
		</WorkspaceContext.Provider>
	);
}
