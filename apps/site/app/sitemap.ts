import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/lib/docs";

const BASE = "https://usepatrick.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const now = new Date();
	const marketing = ["", "/download", "/privacy", "/contact", "/docs"].map(
		(p) => ({ url: `${BASE}${p}`, lastModified: now }),
	);
	// getAllSlugs is pages only (section labels excluded); [] is /docs, above.
	const docs = (await getAllSlugs())
		.filter((s) => s.length > 0)
		.map((s) => ({ url: `${BASE}/docs/${s.join("/")}`, lastModified: now }));
	return [...marketing, ...docs];
}
