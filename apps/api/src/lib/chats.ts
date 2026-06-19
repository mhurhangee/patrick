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
	// Read the chats in parallel (the sidebar refetches this after every turn).
	const chats = await Promise.all(
		files
			.filter((f) => f.endsWith(".json"))
			.map((f) => readChat(folder, f.replace(/\.json$/, ""))),
	);
	return (
		chats
			.filter((c): c is Chat => c != null)
			.map((chat) => ({
				id: chat.id,
				updatedAt: chat.updatedAt,
				lastUser: lastText(chat.messages, "user"),
				lastAssistant: lastText(chat.messages, "assistant"),
				starred: chat.starred,
				title: chat.customTitle,
			}))
			// Starred float to the top; otherwise most-recent first.
			.sort(
				(a, b) =>
					Number(!!b.starred) - Number(!!a.starred) ||
					b.updatedAt.localeCompare(a.updatedAt),
			)
	);
}

/** Apply attorney-set chat meta (star, custom title). Empty title clears it.
 *  This and saveChat are non-atomic read-modify-writes on the same file; a star
 *  landing in the same instant a turn finishes saving could drop one or the
 *  other. Accepted: local single-user, the window is a few ms, and there's no
 *  locking anywhere in this file-per-chat model. Any new attorney-set field must
 *  also be threaded through saveChat (below) or a turn-save would drop it. */
export async function updateChatMeta(
	folder: string,
	id: string,
	patch: { starred?: boolean; customTitle?: string },
): Promise<Chat | null> {
	const existing = await readChat(folder, id);
	if (!existing) return null;
	const updated: Chat = { ...existing };
	if (patch.starred !== undefined) updated.starred = patch.starred || undefined;
	if (patch.customTitle !== undefined)
		updated.customTitle = patch.customTitle.trim() || undefined;
	await writeFile(
		chatPath(folder, id),
		JSON.stringify(updated, null, 2),
		"utf8",
	);
	return updated;
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
		// Attorney-set meta survives turn-saves.
		starred: existing?.starred,
		customTitle: existing?.customTitle,
	};
	const path = chatPath(folder, chat.id);
	await mkdir(chatsDir(folder), { recursive: true });
	await writeFile(path, JSON.stringify(full, null, 2), "utf8");
	return full;
}
