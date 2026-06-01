import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import YAML from "yaml"
import {
	type Chat,
	type ChatIndexEntry,
	DEFAULT_SETTINGS,
	type ProjectEntry,
	type Settings,
} from "@patrickos/shared"

// App config dir — Tauri sets CONFIG_DIR via env var, dev defaults to local folder
export const CONFIG_DIR = process.env.CONFIG_DIR ?? "./dev-data"

export function settingsPath() {
	return join(CONFIG_DIR, "settings.yaml")
}

export function projectsPath() {
	return join(CONFIG_DIR, "projects.yaml")
}

export function chatsDir(projectPath: string) {
	return join(projectPath, "chats")
}

export function chatIndexPath(projectPath: string) {
	return join(projectPath, "chats", "index.json")
}

export function chatFilePath(projectPath: string, chatId: string) {
	return join(projectPath, "chats", `chat-${chatId}.json`)
}

export function artifactsDir(projectPath: string) {
	return join(projectPath, "artifacts")
}

export function analysisDir(projectPath: string) {
	return join(projectPath, "analysis")
}

// ─── YAML ────────────────────────────────────────────────────────────────────

async function readYaml<T>(path: string, fallback: T): Promise<T> {
	try {
		const text = await readFile(path, "utf8")
		return YAML.parse(text) as T
	} catch {
		return fallback
	}
}

async function writeYaml(path: string, data: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const tmp = `${path}.tmp`
	await writeFile(tmp, YAML.stringify(data), "utf8")
	await rename(tmp, path)
}

// ─── JSON ────────────────────────────────────────────────────────────────────

async function readJson<T>(path: string, fallback: T): Promise<T> {
	try {
		const text = await readFile(path, "utf8")
		return JSON.parse(text) as T
	} catch {
		return fallback
	}
}

async function writeJson(path: string, data: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const tmp = `${path}.tmp`
	await writeFile(tmp, JSON.stringify(data, null, 2), "utf8")
	await rename(tmp, path)
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function readSettings(): Promise<Settings> {
	return readYaml<Settings>(settingsPath(), DEFAULT_SETTINGS)
}

export async function writeSettings(data: Settings): Promise<void> {
	await writeYaml(settingsPath(), data)
}

// ─── Projects registry ───────────────────────────────────────────────────────

export async function readProjects(): Promise<ProjectEntry[]> {
	return readYaml<ProjectEntry[]>(projectsPath(), [])
}

export async function writeProjects(projects: ProjectEntry[]): Promise<void> {
	await writeYaml(projectsPath(), projects)
}

// ─── Chats ───────────────────────────────────────────────────────────────────

export async function readChatIndex(
	projectPath: string,
): Promise<ChatIndexEntry[]> {
	return readJson<ChatIndexEntry[]>(chatIndexPath(projectPath), [])
}

export async function writeChatIndex(
	projectPath: string,
	index: ChatIndexEntry[],
): Promise<void> {
	await writeJson(chatIndexPath(projectPath), index)
}

export async function readChat(
	projectPath: string,
	chatId: string,
): Promise<Chat | null> {
	return readJson<Chat | null>(chatFilePath(projectPath, chatId), null)
}

export async function writeChat(
	projectPath: string,
	chat: Chat,
): Promise<void> {
	await mkdir(chatsDir(projectPath), { recursive: true })
	await writeJson(chatFilePath(projectPath, chat.id), chat)
}

export async function ensureProjectDirs(projectPath: string): Promise<void> {
	await Promise.all([
		mkdir(artifactsDir(projectPath), { recursive: true }),
		mkdir(chatsDir(projectPath), { recursive: true }),
		mkdir(analysisDir(projectPath), { recursive: true }),
	])
}
