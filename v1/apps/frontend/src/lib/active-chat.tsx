import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useActiveTask } from "./active-task";

// The chat currently open in the workspace. A fresh id is minted for a new chat;
// selecting one from the sidebar switches to it. Chats are per-task, so switching
// tasks starts a new chat. Held in memory — reload starts fresh (reopen from the
// sidebar). The id is provisional until the first message persists it.
type ActiveChatState = {
	activeChatId: string;
	newChat: () => void;
	selectChat: (id: string) => void;
};

const Context = createContext<ActiveChatState | undefined>(undefined);

export function ActiveChatProvider({ children }: { children: ReactNode }) {
	const { activeTaskId } = useActiveTask();
	const [activeChatId, setId] = useState<string>(() => crypto.randomUUID());

	// New task ⇒ new chat (different folder, different conversations).
	const prevTask = useRef(activeTaskId);
	useEffect(() => {
		if (prevTask.current !== activeTaskId) {
			prevTask.current = activeTaskId;
			setId(crypto.randomUUID());
		}
	}, [activeTaskId]);

	const newChat = useCallback(() => setId(crypto.randomUUID()), []);
	const selectChat = useCallback((id: string) => setId(id), []);

	const value = useMemo(
		() => ({ activeChatId, newChat, selectChat }),
		[activeChatId, newChat, selectChat],
	);

	return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useActiveChat(): ActiveChatState {
	const ctx = useContext(Context);
	if (!ctx)
		throw new Error("useActiveChat must be used within ActiveChatProvider");
	return ctx;
}
