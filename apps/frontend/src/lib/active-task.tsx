import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

const STORAGE_KEY = "patrick.activeTaskId";

type ActiveTaskState = {
	activeTaskId: string | undefined;
	setActiveTaskId: (id: string | undefined) => void;
};

const Context = createContext<ActiveTaskState | undefined>(undefined);

export function ActiveTaskProvider({ children }: { children: ReactNode }) {
	const [activeTaskId, setId] = useState<string | undefined>(
		() => localStorage.getItem(STORAGE_KEY) ?? undefined,
	);

	const setActiveTaskId = useCallback((id: string | undefined) => {
		if (id) localStorage.setItem(STORAGE_KEY, id);
		else localStorage.removeItem(STORAGE_KEY);
		setId(id);
	}, []);

	const value = useMemo(
		() => ({ activeTaskId, setActiveTaskId }),
		[activeTaskId, setActiveTaskId],
	);

	return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useActiveTask() {
	const ctx = useContext(Context);
	if (!ctx)
		throw new Error("useActiveTask must be used within ActiveTaskProvider");
	return ctx;
}
