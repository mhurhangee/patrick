"use client";

import { createContext, useContext } from "react";

/**
 * Optional DOM node that the Radix-based overlays (DropdownMenu, Popover,
 * Select, Tooltip) portal into, instead of the default `document.body`.
 *
 * The app leaves this null — overlays portal to `document.body` as usual. The
 * embedded docx editor sets it to a node inside its `.ep-root` so portalled
 * overlays land inside the editor's scoped-utility subtree (otherwise the
 * editor's `.ep-root`-scoped Tailwind classes wouldn't match content rendered
 * at `document.body`, leaving overlays unstyled).
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement | null {
	return useContext(PortalContainerContext);
}
