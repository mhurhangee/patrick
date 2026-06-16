import { provisionList } from "@patrick/law";
import { Hono } from "hono";

export const law = new Hono();

// The taggable EPC provisions for the chat `/` picker (key + title only). The map
// is bundled, so this is static — the client fetches it once and filters locally.
law.get("/provisions", (c) => c.json({ provisions: provisionList() }));
