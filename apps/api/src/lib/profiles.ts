import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	DEFAULT_MODEL,
	type Profile,
	type ProfileSummary,
	profileSummary,
} from "@patrick/shared";
import { parse, stringify } from "yaml";
import { profilePath, profilesDir } from "./config";

// Backfill the single `ai.model` for profiles written before the quick/detailed
// split was collapsed — carry over the old detailed model, else the provider default.
function normalizeProfile(profile: Profile): Profile {
	const ai = profile.ai as Profile["ai"] & {
		detailedModel?: string;
		quickModel?: string;
	};
	if (!ai.model) {
		ai.model =
			ai.detailedModel ?? DEFAULT_MODEL[ai.provider] ?? DEFAULT_MODEL.anthropic;
	}
	delete ai.detailedModel;
	delete ai.quickModel;
	return profile;
}

export async function listProfiles(): Promise<ProfileSummary[]> {
	let ids: string[];
	try {
		ids = await readdir(profilesDir());
	} catch {
		return [];
	}
	const summaries: ProfileSummary[] = [];
	for (const id of ids) {
		const profile = await readProfile(id);
		if (profile) summaries.push(profileSummary(profile));
	}
	return summaries;
}

export async function readProfile(id: string): Promise<Profile | null> {
	try {
		const text = await readFile(profilePath(id), "utf8");
		return normalizeProfile(parse(text) as Profile);
	} catch {
		return null;
	}
}

export async function writeProfile(profile: Profile): Promise<void> {
	const path = profilePath(profile.id);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, stringify(profile), "utf8");
}

export async function deleteProfile(id: string): Promise<void> {
	await rm(dirname(profilePath(id)), { recursive: true, force: true });
}
