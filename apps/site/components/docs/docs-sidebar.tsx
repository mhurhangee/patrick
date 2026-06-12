import { getNav } from "@/lib/docs";
import { DocsNav } from "./docs-nav";

export async function DocsSidebar() {
	const nav = await getNav();
	return <DocsNav nodes={nav} />;
}
