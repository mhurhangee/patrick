// Inline migrations — edit schema.ts then add a new entry here.
// These are compiled into the binary so no files are needed on disk at runtime.
export const migrations: { name: string; sql: string }[] = [
	{
		name: "0000_initial",
		sql: `
			CREATE TABLE IF NOT EXISTS settings (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL DEFAULT '',
				firm TEXT NOT NULL DEFAULT '',
				role TEXT NOT NULL DEFAULT '',
				jurisdiction TEXT NOT NULL DEFAULT '',
				ai_provider TEXT NOT NULL DEFAULT 'anthropic',
				ai_quick_model TEXT NOT NULL DEFAULT '',
				ai_detailed_model TEXT NOT NULL DEFAULT '',
				prompt_context TEXT NOT NULL DEFAULT '',
				prompt_askpat TEXT NOT NULL DEFAULT '',
				prompt_agentpat TEXT NOT NULL DEFAULT '',
				prompt_extractpat TEXT NOT NULL DEFAULT ''
			);
			CREATE TABLE IF NOT EXISTS projects (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				type TEXT NOT NULL DEFAULT 'us-non-final-oa-response',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS assets (
				id TEXT PRIMARY KEY,
				project_id TEXT NOT NULL REFERENCES projects(id),
				title TEXT NOT NULL,
				content TEXT NOT NULL DEFAULT '',
				type TEXT NOT NULL DEFAULT 'us-response',
				kind TEXT NOT NULL DEFAULT 'artifact',
				date TEXT NOT NULL DEFAULT '',
				notes TEXT NOT NULL DEFAULT '',
				data BLOB,
				metadata TEXT NOT NULL DEFAULT '{}',
				details TEXT,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`,
	},
]
