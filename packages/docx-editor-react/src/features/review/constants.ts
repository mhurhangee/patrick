/** Stable empty Map used as the initial anchor-positions state for the
 *  comment/annotation sidebar. A shared frozen reference keeps the
 *  `useState` initializer identity-stable across renders. */
export const EMPTY_ANCHOR_POSITIONS = new Map<string, number>();
