import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import {
	type AnalysisRecord,
	type AnalysisSummary,
	type Chat,
	type ChatIndexEntry,
	DEFAULT_SETTINGS,
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

function analysisDir(taskPath: string) {
	return join(taskPath, "analysis")
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
		return YAML.parse(text) as Settings
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

// ─── Analysis (ExtractPat results) ─────────────────────────────────────────────

function analysisFilePath(taskPath: string, sourceFilename: string) {
	return join(analysisDir(taskPath), `${sourceFilename}.json`)
}

export async function readAnalysis(
	taskPath: string,
	sourceFilename: string,
): Promise<AnalysisRecord | null> {
	return readJson<AnalysisRecord | null>(
		analysisFilePath(taskPath, sourceFilename),
		null,
	)
}

export async function writeAnalysis(
	taskPath: string,
	record: AnalysisRecord,
): Promise<void> {
	await writeJson(analysisFilePath(taskPath, record.filename), record)
}

export async function deleteAnalysis(
	taskPath: string,
	sourceFilename: string,
): Promise<void> {
	await rm(analysisFilePath(taskPath, sourceFilename), { force: true })
}

export async function listAnalysis(
	taskPath: string,
): Promise<AnalysisSummary[]> {
	try {
		const entries = await readdir(analysisDir(taskPath), {
			withFileTypes: true,
		})
		const summaries: AnalysisSummary[] = []
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".json")) continue
			const record = await readJson<AnalysisRecord | null>(
				join(analysisDir(taskPath), entry.name),
				null,
			)
			if (!record) continue
			summaries.push({
				filename: record.filename ?? basename(entry.name, ".json"),
				assetType: record.assetType,
				updatedAt: record.updatedAt,
			})
		}
		return summaries
	} catch {
		return []
	}
}

export async function ensureTaskDirs(taskPath: string): Promise<void> {
	await Promise.all([
		mkdir(artifactsDir(taskPath), { recursive: true }),
		mkdir(chatsDir(taskPath), { recursive: true }),
		mkdir(analysisDir(taskPath), { recursive: true }),
	])
}
