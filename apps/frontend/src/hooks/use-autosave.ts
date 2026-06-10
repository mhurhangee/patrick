import { useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved";

/**
 * Debounced auto-save for a value. Skips the initial value, saves ~delay after
 * the last change, and flushes on unmount. Mount the host with `key=` so a new
 * subject starts fresh. Returns the local status (combine with a mutation's
 * pending flag for the in-flight window) and a `flush` for "save then leave".
 */
export function useAutosave<T>(
	value: T,
	onSave: (value: T) => void,
	delay = 600,
) {
	const [pending, setPending] = useState(false);
	const [hasSaved, setHasSaved] = useState(false);

	const valueRef = useRef(value);
	valueRef.current = value;
	const onSaveRef = useRef(onSave);
	onSaveRef.current = onSave;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const first = useRef(true);

	useEffect(() => {
		if (first.current) {
			first.current = false;
			return;
		}
		setPending(true);
		if (timer.current) clearTimeout(timer.current);
		// The surviving timer (from the last change) closes over the latest value.
		timer.current = setTimeout(() => {
			timer.current = null;
			setPending(false);
			setHasSaved(true);
			onSaveRef.current(value);
		}, delay);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [value, delay]);

	// Flush a pending save on unmount.
	useEffect(() => {
		return () => {
			if (timer.current) {
				clearTimeout(timer.current);
				onSaveRef.current(valueRef.current);
			}
		};
	}, []);

	function flush() {
		if (timer.current) {
			clearTimeout(timer.current);
			timer.current = null;
			setPending(false);
			setHasSaved(true);
			onSaveRef.current(valueRef.current);
		}
	}

	// Drop a pending save without writing (e.g. before deleting the subject).
	function cancel() {
		if (timer.current) {
			clearTimeout(timer.current);
			timer.current = null;
		}
		setPending(false);
	}

	const status: SaveState = pending ? "saving" : hasSaved ? "saved" : "idle";
	return { status, flush, cancel };
}
