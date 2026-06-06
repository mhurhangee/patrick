import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises"
import { dirname, extname, join } from "node:path"
import {
	type Chat,
	type ChatIndexEntry,
	DEFAULT_SETTINGS,
	EMPTY_FLAGS,
	type Flags,
	type Settings,
	type TaskEntry,
} from "@patrickos/shared"
import YAML from "yaml"

// Config dir — set by Tauri env var, overridden at runtime when user picks a profile folder
let configDir = process.env.CONFIG_DIR ?? "./dev-data"
export function getConfigDir() {
	return configDir
}
export function setConfigDir(dir: string) {
	configDir = dir
}

function settingsPath() {
	return join(configDir, "settings.yaml")
}

function tasksPath() {
	return join(configDir, "tasks.yaml")
}

function chatsDir(taskPath: string) {
	return join(taskPath, "chats")
}

function chatIndexPath(taskPath: string) {
	return join(taskPath, "chats", "index.json")
}

function chatFilePath(taskPath: string, chatId: string) {
	return join(taskPath, "chats", `chat-${chatId}.json`)
}

export function artifactsDir(taskPath: string) {
	return join(taskPath, "artifacts")
}

// Per-source human-authored notes (Plate JSON) — top-level, not a derivation.
function notesDir(taskPath: string) {
	return join(taskPath, "notes")
}

// Filename-keyed flags (excluded/starred) — one file under meta/.
function flagsPath(taskPath: string) {
	return join(taskPath, "meta", "flags.json")
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
	const path = settingsPath()
	try {
		const text = await readFile(path, "utf8")
		// Merge over defaults so settings.yaml files written before a field existed
		// (e.g. ai.effort / ai.showThinking) still get sensible values.
		const parsed = (YAML.parse(text) ?? {}) as Partial<Settings>
		return {
			...DEFAULT_SETTINGS,
			...parsed,
			profile: { ...DEFAULT_SETTINGS.profile, ...parsed.profile },
			ai: { ...DEFAULT_SETTINGS.ai, ...parsed.ai },
			prompts: { ...DEFAULT_SETTINGS.prompts, ...parsed.prompts },
			integrations: {
				...DEFAULT_SETTINGS.integrations,
				...parsed.integrations,
			},
		}
	} catch {
		// First run — write defaults so the file exists
		await writeYaml(path, DEFAULT_SETTINGS)
		return DEFAULT_SETTINGS
	}
}

export async function writeSettings(data: Settings): Promise<void> {
	await writeYaml(settingsPath(), data)
}

// ─── Tasks registry ───────────────────────────────────────────────────────

export async function readTasks(): Promise<TaskEntry[]> {
	return readYaml<TaskEntry[]>(tasksPath(), [])
}

export async function writeTasks(tasks: TaskEntry[]): Promise<void> {
	await writeYaml(tasksPath(), tasks)
}

// ─── Chats ───────────────────────────────────────────────────────────────────

export async function readChatIndex(
	taskPath: string,
): Promise<ChatIndexEntry[]> {
	return readJson<ChatIndexEntry[]>(chatIndexPath(taskPath), [])
}

export async function writeChatIndex(
	taskPath: string,
	index: ChatIndexEntry[],
): Promise<void> {
	await writeJson(chatIndexPath(taskPath), index)
}

export async function readChat(
	taskPath: string,
	chatId: string,
): Promise<Chat | null> {
	return readJson<Chat | null>(chatFilePath(taskPath, chatId), null)
}

export async function writeChat(taskPath: string, chat: Chat): Promise<void> {
	await mkdir(chatsDir(taskPath), { recursive: true })
	await writeJson(chatFilePath(taskPath, chat.id), chat)
}

export async function deleteChat(
	taskPath: string,
	chatId: string,
): Promise<void> {
	await rm(chatFilePath(taskPath, chatId), { force: true })
}

// ─── Notes (notes/{filename}.json — per-source Plate JSON) ───────────────────

function noteFilePath(taskPath: string, sourceFilename: string) {
	return join(notesDir(taskPath), `${sourceFilename}.json`)
}

export async function readNote(
	taskPath: string,
	sourceFilename: string,
): Promise<string | null> {
	try {
		return await readFile(noteFilePath(taskPath, sourceFilename), "utf8")
	} catch {
		return null
	}
}

export async function writeNote(
	taskPath: string,
	sourceFilename: string,
	content: string,
): Promise<void> {
	const path = noteFilePath(taskPath, sourceFilename)
	await mkdir(dirname(path), { recursive: true })
	const tmp = `${path}.tmp`
	await writeFile(tmp, content, "utf8")
	await rename(tmp, path)
}

export async function deleteNote(
	taskPath: string,
	sourceFilename: string,
): Promise<void> {
	await rm(noteFilePath(taskPath, sourceFilename), { force: true })
}

// ─── Flags (meta/flags.json — excluded + starred, filename-keyed) ────────────

export async function readFlags(taskPath: string): Promise<Flags> {
	return readJson<Flags>(flagsPath(taskPath), EMPTY_FLAGS)
}

export async function writeFlags(
	taskPath: string,
	flags: Flags,
): Promise<void> {
	await writeJson(flagsPath(taskPath), flags)
}

// ─── Folder roster (sources + artifacts on disk) ─────────────────────────────
// The authoritative list of documents in a task folder. Used by the /files route
// (sidebar) and the closed-docs context resolver.

export type FolderDoc = {
	filename: string
	path: string
	ext: string
	createdAt?: string
	updatedAt?: string
}

const SOURCE_EXTS = new Set([".pdf", ".docx", ".doc"])
const SKIP_DIRS = new Set([
	"artifacts",
	"chats",
	"derivations",
	"notes",
	"meta",
])
const ARTIFACT_EXTS = new Set([".json", ".docx"])

export async function listSources(taskPath: string): Promise<FolderDoc[]> {
	try {
		const entries = await readdir(taskPath, { withFileTypes: true })
		const files: FolderDoc[] = []
		for (const entry of entries) {
			if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
			if (!entry.isFile()) continue
			const ext = extname(entry.name).toLowerCase()
			if (!SOURCE_EXTS.has(ext)) continue
			files.push({
				filename: entry.name,
				path: join(taskPath, entry.name),
				ext: ext.slice(1),
			})
		}
		return files
	} catch {
		return []
	}
}

export async function listArtifacts(taskPath: string): Promise<FolderDoc[]> {
	const dir = artifactsDir(taskPath)
	try {
		const entries = await readdir(dir, { withFileTypes: true })
		const files: FolderDoc[] = []
		for (const entry of entries) {
			if (!entry.isFile()) continue
			const ext = extname(entry.name).toLowerCase()
			if (!ARTIFACT_EXTS.has(ext)) continue
			const filePath = join(dir, entry.name)
			const s = await stat(filePath)
			files.push({
				filename: entry.name,
				path: filePath,
				ext: ext.slice(1),
				createdAt: s.birthtime.toISOString(),
				updatedAt: s.mtime.toISOString(),
			})
		}
		return files
	} catch {
		return []
	}
}

export async function ensureTaskDirs(taskPath: string): Promise<void> {
	await Promise.all([
		mkdir(artifactsDir(taskPath), { recursive: true }),
		mkdir(chatsDir(taskPath), { recursive: true }),
		mkdir(notesDir(taskPath), { recursive: true }),
	])
}
