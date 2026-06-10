import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

type LayoutContextValue = {
	navRef: RefObject<PanelImperativeHandle | null>;
	chatRef: RefObject<PanelImperativeHandle | null>;
	navCollapsed: boolean;
	chatCollapsed: boolean;
	/** Wired to the panels' onCollapse/onExpand so state tracks dragging too. */
	setNavCollapsed: (v: boolean) => void;
	setChatCollapsed: (v: boolean) => void;
	toggleNav: () => void;
	toggleChat: () => void;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayout(): LayoutContextValue {
	const ctx = useContext(LayoutContext);
	if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
	return ctx;
}

export function LayoutProvider({ children }: { children: ReactNode }) {
	const navRef = useRef<PanelImperativeHandle | null>(null);
	const chatRef = useRef<PanelImperativeHandle | null>(null);
	const [navCollapsed, setNavCollapsed] = useState(false);
	const [chatCollapsed, setChatCollapsed] = useState(false);

	const value = useMemo<LayoutContextValue>(
		() => ({
			navRef,
			chatRef,
			navCollapsed,
			chatCollapsed,
			setNavCollapsed,
			setChatCollapsed,
			// Just drive the panel; onCollapse/onExpand keep the state in sync.
			toggleNav: () => {
				const p = navRef.current;
				if (!p) return;
				if (p.isCollapsed()) p.expand();
				else p.collapse();
			},
			toggleChat: () => {
				const p = chatRef.current;
				if (!p) return;
				if (p.isCollapsed()) p.expand();
				else p.collapse();
			},
		}),
		[navCollapsed, chatCollapsed],
	);

	return (
		<LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
	);
}
