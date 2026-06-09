import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

const STORAGE_KEY = "patrick.activeProfileId";

/** Read the active profile id outside React (e.g. route guards). */
export function getStoredProfileId(): string | undefined {
	return localStorage.getItem(STORAGE_KEY) ?? undefined;
}

type ActiveProfileState = {
	activeProfileId: string | undefined;
	setActiveProfileId: (id: string | undefined) => void;
};

const Context = createContext<ActiveProfileState | undefined>(undefined);

export function ActiveProfileProvider({ children }: { children: ReactNode }) {
	const [activeProfileId, setId] = useState<string | undefined>(
		() => localStorage.getItem(STORAGE_KEY) ?? undefined,
	);

	const setActiveProfileId = useCallback((id: string | undefined) => {
		if (id) localStorage.setItem(STORAGE_KEY, id);
		else localStorage.removeItem(STORAGE_KEY);
		setId(id);
	}, []);

	const value = useMemo(
		() => ({ activeProfileId, setActiveProfileId }),
		[activeProfileId, setActiveProfileId],
	);

	return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useActiveProfile() {
	const ctx = useContext(Context);
	if (!ctx)
		throw new Error(
			"useActiveProfile must be used within ActiveProfileProvider",
		);
	return ctx;
}
