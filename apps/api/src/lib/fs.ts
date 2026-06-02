import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import {
	type AnalysisRecord,
	type AnalysisSummary,
	type Chat,
	type ChatIndexEntry,
	DEFAULT_SETTINGS,
	type ProjectEntry,
	type Settings,
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

function projectsPath() {
	return join(configDir, "projects.yaml")
}

function chatsDir(projectPath: string) {
	return join(projectPath, "chats")
}

function chatIndexPath(projectPath: string) {
	return join(projectPath, "chats", "index.json")
}

function chatFilePath(projectPath: string, chatId: string) {
	return join(projectPath, "chats", `chat-${chatId}.json`)
}

export function artifactsDir(projectPath: string) {
	return join(projectPath, "artifacts")
}

function analysisDir(projectPath: string) {
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

// ─── Analysis (ExtractPat results) ─────────────────────────────────────────────

function analysisFilePath(projectPath: string, sourceFilename: string) {
	return join(analysisDir(projectPath), `${sourceFilename}.json`)
}

export async function readAnalysis(
	projectPath: string,
	sourceFilename: string,
): Promise<AnalysisRecord | null> {
	return readJson<AnalysisRecord | null>(
		analysisFilePath(projectPath, sourceFilename),
		null,
	)
}

export async function writeAnalysis(
	projectPath: string,
	record: AnalysisRecord,
): Promise<void> {
	await writeJson(analysisFilePath(projectPath, record.filename), record)
}

export async function listAnalysis(
	projectPath: string,
): Promise<AnalysisSummary[]> {
	try {
		const entries = await readdir(analysisDir(projectPath), {
			withFileTypes: true,
		})
		const summaries: AnalysisSummary[] = []
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".json")) continue
			const record = await readJson<AnalysisRecord | null>(
				join(analysisDir(projectPath), entry.name),
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

export async function ensureProjectDirs(projectPath: string): Promise<void> {
	await Promise.all([
		mkdir(artifactsDir(projectPath), { recursive: true }),
		mkdir(chatsDir(projectPath), { recursive: true }),
		mkdir(analysisDir(projectPath), { recursive: true }),
	])
}
