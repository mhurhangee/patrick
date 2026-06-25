import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { useWorkspace } from "@/lib/workspace";

// App-level channel for "navigate to a citation": a chart cell (or, later, the search
// panel) clicks a citation → we open the referenced document and ask its viewer to scroll
// to and highlight the cited passage. Each doc viewer has its OWN per-instance highlight
// provider (doc-search-context), so this cross-surface request rides above them, keyed by
// filename; the target viewer's DocSearchLayout consumes the pending target for its file.

/** A request to locate a passage in a document. `snippet` is the verbatim locator (matched
 *  against the doc text); `label` is the human citation ("[0021]", "leaf 6") kept for a
 *  future label-disambiguation / parse fallback. `token` makes repeat clicks re-fire. */
export type CitationTarget = {
	filename: string;
	snippet: string;
	label?: string;
	token: number;
};

type CitationNavValue = {
	pending: CitationTarget | null;
	/** Open the document and request its viewer scroll to + highlight the passage. */
	goToCitation: (filename: string, snippet: string, label?: string) => void;
};

const Ctx = createContext<CitationNavValue | null>(null);

export function CitationNavProvider({ children }: { children: ReactNode }) {
	const { open } = useWorkspace();
	const [pending, setPending] = useState<CitationTarget | null>(null);
	const token = useRef(0);

	const goToCitation = useCallback(
		(filename: string, snippet: string, label?: string) => {
			open(filename); // open (if needed) + focus the document tab
			token.current += 1;
			setPending({ filename, snippet, label, token: token.current });
		},
		[open],
	);

	const value = useMemo(
		() => ({ pending, goToCitation }),
		[pending, goToCitation],
	);
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCitationNav(): CitationNavValue {
	return (
		useContext(Ctx) ?? {
			pending: null,
			goToCitation: () => {},
		}
	);
}
