import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR =
	process.env.PATRICK_CONFIG_DIR ?? join(homedir(), ".config", "patrick");

export function profilesDir(): string {
	return join(CONFIG_DIR, "profiles");
}

export function profilePath(id: string): string {
	return join(profilesDir(), id, "profile.yaml");
}

export function tasksDir(): string {
	return join(CONFIG_DIR, "tasks");
}

export function taskPath(id: string): string {
	return join(tasksDir(), id, "task.yaml");
}

// Cached EPC provision HTML (one file per provision). Jurisdiction-global, not
// per-task — immutable consolidated law, so once fetched it serves every task
// offline. See @patrick/law's fileCachedFetcher.
export function lawCacheDir(): string {
	return join(CONFIG_DIR, "law", "epc");
}
