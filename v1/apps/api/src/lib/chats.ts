import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type Chat,
	type ChatSummary,
	chatTitleFrom,
	type StoredChatMessage,
} from "@patrick/shared";

// Chats live as JSON files in <folder>/.patrick/chats/<id>.json. No index file —
// we derive the sidebar list by reading the chats directly (local, single-user,
// modest counts), which keeps storage simple and consistency-free.
function chatsDir(folder: string): string {
	return join(folder, ".patrick", "chats");
}
function chatPath(folder: string, id: string): string {
	return join(chatsDir(folder), `${id}.json`);
}

// Last message of a role, as a one-line slice (the most recent text part).
function lastText(
	messages: StoredChatMessage[],
	role: "user" | "assistant",
): string {
	const msg = [...messages].reverse().find((m) => m.role === role);
	const parts = msg?.parts as
		| Array<{ type: string; text?: string }>
		| undefined;
	const text = [...(parts ?? [])]
		.reverse()
		.find((p) => p.type === "text" && typeof p.text === "string")
		?.text?.trim();
	return text ? text.replace(/\s+/g, " ").slice(0, 100) : "";
}

export async function listChats(folder: string): Promise<ChatSummary[]> {
	let files: string[];
	try {
		files = await readdir(chatsDir(folder));
	} catch {
		return [];
	}
	const summaries: ChatSummary[] = [];
	for (const file of files) {
		if (!file.endsWith(".json")) continue;
		const chat = await readChat(folder, file.replace(/\.json$/, ""));
		if (chat)
			summaries.push({
				id: chat.id,
				updatedAt: chat.updatedAt,
				lastUser: lastText(chat.messages, "user"),
				lastAssistant: lastText(chat.messages, "assistant"),
			});
	}
	// Most recently touched first.
	summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return summaries;
}

export async function readChat(
	folder: string,
	id: string,
): Promise<Chat | null> {
	try {
		return JSON.parse(await readFile(chatPath(folder, id), "utf8")) as Chat;
	} catch {
		return null;
	}
}

export async function deleteChat(folder: string, id: string): Promise<void> {
	await rm(chatPath(folder, id), { force: true });
}

// Upsert a chat from a finished turn: preserve createdAt, refresh title/preview/
// updatedAt, persist the conversation + its locked template + pinned set.
export async function saveChat(
	folder: string,
	chat: Omit<Chat, "title" | "createdAt" | "updatedAt"> &
		Partial<Pick<Chat, "title" | "createdAt">>,
): Promise<Chat> {
	const existing = await readChat(folder, chat.id);
	const now = new Date().toISOString();
	const full: Chat = {
		id: chat.id,
		title: chatTitleFrom(chat.messages),
		createdAt: existing?.createdAt ?? chat.createdAt ?? now,
		updatedAt: now,
		systemTemplate: chat.systemTemplate,
		pinnedSources: chat.pinnedSources,
		messages: chat.messages,
	};
	const path = chatPath(folder, chat.id);
	await mkdir(chatsDir(folder), { recursive: true });
	await writeFile(path, JSON.stringify(full, null, 2), "utf8");
	return full;
}
