import type { DocxEditorRef } from "@eigenpal/docx-editor-react";
import {
	createContext,
	type ReactNode,
	type RefObject,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react";

// The editable .docx editors live in the viewer panel; Patrick lives in the
// chat panel. This registry bridges them: each editable DocxViewer registers its
// ref by document id, and the chat resolves the focused editable editor to drive
// tool calls against. Keyed by filename (a workspace doc id).
type Registry = {
	register: (id: string, ref: RefObject<DocxEditorRef | null>) => void;
	unregister: (id: string) => void;
	getEditor: (id: string | null | undefined) => DocxEditorRef | null;
};

const Context = createContext<Registry | null>(null);

export function ActiveEditorProvider({ children }: { children: ReactNode }) {
	const refs = useRef(new Map<string, RefObject<DocxEditorRef | null>>());

	const register = useCallback(
		(id: string, ref: RefObject<DocxEditorRef | null>) => {
			refs.current.set(id, ref);
		},
		[],
	);
	const unregister = useCallback((id: string) => {
		refs.current.delete(id);
	}, []);
	const getEditor = useCallback((id: string | null | undefined) => {
		return id ? (refs.current.get(id)?.current ?? null) : null;
	}, []);

	const value = useMemo<Registry>(
		() => ({ register, unregister, getEditor }),
		[register, unregister, getEditor],
	);

	return <Context.Provider value={value}>{children}</Context.Provider>;
}

function useEditorRegistry(): Registry {
	const ctx = useContext(Context);
	if (!ctx)
		throw new Error(
			"useEditorRegistry must be used within ActiveEditorProvider",
		);
	return ctx;
}

/** Register an editable editor's ref while it's mounted (no-op when disabled). */
export function useRegisterEditor(
	id: string,
	ref: RefObject<DocxEditorRef | null>,
	enabled: boolean,
): void {
	const registry = useEditorRegistry();
	useEffect(() => {
		if (!enabled) return;
		registry.register(id, ref);
		return () => registry.unregister(id);
	}, [id, ref, enabled, registry]);
}

/** Resolve once the editor for `id` is mounted AND its document agent is ready
 *  to take tool calls. Used to gate a freshly-created/unlocked draft: opening it
 *  mounts the editor and loads its bytes asynchronously, so the agent's first
 *  edit would otherwise race the editor and silently fail. Resolves `false` on
 *  timeout (the caller proceeds anyway — worst case a retry). */
export function useEditorReadiness(): (
	id: string,
	timeoutMs?: number,
) => Promise<boolean> {
	const registry = useEditorRegistry();
	return useCallback(
		(id: string, timeoutMs = 5000) =>
			new Promise<boolean>((resolve) => {
				const start = Date.now();
				const tick = () => {
					if (registry.getEditor(id)?.getAgent()) return resolve(true);
					if (Date.now() - start > timeoutMs) return resolve(false);
					setTimeout(tick, 80);
				};
				tick();
			}),
		[registry],
	);
}

/** A stable ref whose `.current` always resolves to the editor for `id` right
 *  now — survives editors mounting/unmounting as tabs change. */
export function useEditorRefFor(
	id: string | null | undefined,
): RefObject<DocxEditorRef | null> {
	const registry = useEditorRegistry();
	const idRef = useRef(id);
	idRef.current = id;
	return useMemo(
		() => ({
			get current() {
				return registry.getEditor(idRef.current);
			},
		}),
		[registry],
	);
}
