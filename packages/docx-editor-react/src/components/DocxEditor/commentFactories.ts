/**
 * React-only comment sidebar state. The ID allocator + `createComment` factory
 * live in core (`prosemirror/commentIdAllocator`, `prosemirror/commentOps`);
 * import those from core directly.
 */

/** Stable empty Map used as the initial anchor-positions state. */
export const EMPTY_ANCHOR_POSITIONS = new Map<string, number>();
