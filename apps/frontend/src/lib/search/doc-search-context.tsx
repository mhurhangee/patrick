import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

/** The match to emphasise in the document: the nth occurrence of `text`. */
export type HighlightSelected = { text: string; nth: number } | null;

type DocSearchHighlightValue = {
	/** Literal strings to highlight every occurrence of (faint). */
	texts: string[];
	selected: HighlightSelected;
	/** Bumped only when a deliberate navigation should scroll the doc. */
	scrollKey: number;
	setHighlights: (
		texts: string[],
		selected: HighlightSelected,
		scroll?: boolean,
	) => void;
};

const NOOP: DocSearchHighlightValue = {
	texts: [],
	selected: null,
	scrollKey: 0,
	setHighlights: () => {},
};

const Ctx = createContext<DocSearchHighlightValue | null>(null);

/** Shared between the search panel (writes) and the viewer (reads) — both are
 *  descendants of DocSearchLayout, so no registry is needed. */
export function DocSearchHighlightProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [state, setState] = useState<{
		texts: string[];
		selected: HighlightSelected;
		scrollKey: number;
	}>({ texts: [], selected: null, scrollKey: 0 });

	const setHighlights = useCallback(
		(texts: string[], selected: HighlightSelected, scroll = false) => {
			setState((prev) => ({
				texts,
				selected,
				scrollKey: scroll ? prev.scrollKey + 1 : prev.scrollKey,
			}));
		},
		[],
	);

	const value = useMemo(
		() => ({ ...state, setHighlights }),
		[state, setHighlights],
	);
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDocSearchHighlights(): DocSearchHighlightValue {
	return useContext(Ctx) ?? NOOP;
}
