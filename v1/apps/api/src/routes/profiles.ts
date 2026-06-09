import { createProfile, type Profile } from "@patrick/shared";
import { Hono } from "hono";
import { listProfiles, readProfile, writeProfile } from "../lib/profiles";

export const profiles = new Hono();

profiles.get("/", async (c) => c.json(await listProfiles()));

profiles.get("/:id", async (c) => {
	const profile = await readProfile(c.req.param("id"));
	return profile ? c.json(profile) : c.json({ error: "not found" }, 404);
});

profiles.post("/", async (c) => {
	const { name } = await c.req.json<{ name?: string }>();
	const profile = createProfile(
		crypto.randomUUID(),
		name?.trim() || "Untitled",
	);
	await writeProfile(profile);
	return c.json(profile, 201);
});

profiles.put("/:id", async (c) => {
	const id = c.req.param("id");
	const body = await c.req.json<Profile>();
	const profile: Profile = { ...body, id };
	await writeProfile(profile);
	return c.json(profile);
});
