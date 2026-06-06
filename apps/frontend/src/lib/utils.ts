import type { ApiAsset } from "@patrickos/shared"
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

// How an asset is labelled in the UI. Sources show their real filename (with
// extension) so identically-titled files stay unambiguous and the label matches
// what AgentPat references; artifacts show their user-given title (the .json
// extension would just be noise).
export function assetLabel(
	asset: Pick<ApiAsset, "kind" | "filename" | "title">,
): string {
	return asset.kind === "source" ? asset.filename : asset.title
}
