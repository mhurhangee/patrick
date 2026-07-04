import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DraftComment, DraftStatus } from "@patrick/shared";
import {
	addComment,
	applyRedline,
	type CommentRequest,
	listComments,
	REDLINE_AUTHOR,
	type RedlineEdit,
} from "./redline";

// THE DANCE: Word/LibreOffice holds a lock on an open draft, so Patrick and the
// attorney share it by protocol, not by force:
// - Reads never block — the last-saved bytes are always readable.
// - Writes happen only in the write window (no lock marker). While the draft is
//   open, finished edits PARK and land the moment it's closed (the tick).
// - Never write in place while open: Word won't reload an externally-changed
//   file, and its next save would clobber the write.
// "Save = talk to Patrick. Close = let Patrick write."

export type DraftOp =
	| { kind: "redline"; edit: RedlineEdit }
	| { kind: "comment"; request: CommentRequest };

export type OpOutcome =
	| { status: "applied" }
	| { status: "parked"; parkedEdits: number }
	| { status: "failed"; reason: string };

function describeOp(op: DraftOp): string {
	return op.kind === "redline"
		? `edit "${op.edit.targetText.slice(0, 60)}…"`
		: `comment "${op.request.text.slice(0, 60)}…"`;
}

export class DraftDance {
	private parked: DraftOp[] = [];
	private failures: string[] = [];

	constructor(
		readonly folder: string,
		readonly filename: string,
		private author = REDLINE_AUTHOR,
	) {}

	private get path(): string {
		return join(this.folder, this.filename);
	}

	/** A Word (`~$…`) or LibreOffice (`.~lock.…#`) lock marker is present. */
	async isLocked(): Promise<boolean> {
		// Word's owner file replaces the filename's first two characters with ~$
		// (short names keep them), LibreOffice wraps the full name.
		const markers = new Set([
			`.~lock.${this.filename}#`,
			`~$${this.filename}`,
			`~$${this.filename.slice(2)}`,
		]);
		try {
			return (await readdir(this.folder)).some((f) => markers.has(f));
		} catch {
			return false;
		}
	}

	async status(): Promise<DraftStatus> {
		let lastSavedMs: number | null = null;
		let exists = true;
		let mentions: DraftComment[] = [];
		try {
			lastSavedMs = (await stat(this.path)).mtimeMs;
		} catch {
			exists = false;
		}
		if (exists) {
			try {
				const comments = await listComments(
					new Uint8Array(await readFile(this.path)),
				);
				mentions = comments.filter(
					(c) => c.author !== this.author && /@patrick/i.test(c.text),
				);
			} catch {
				// unreadable mid-save — mentions just come back empty this tick
			}
		}
		return {
			exists,
			openInEditor: await this.isLocked(),
			parkedEdits: this.parked.length,
			lastSavedMs,
			mentions,
			failures: [...this.failures],
		};
	}

	// Every mutation is read-file → transform → write-file, so concurrent ops
	// (the model fires tool calls in parallel) would read the same base bytes and
	// the last write would silently swallow the others — measured in the wild:
	// 3 of 12 parallel comments survived. ALL mutations serialize through this
	// per-draft chain; reads (status) stay lock-free.
	private chain: Promise<unknown> = Promise.resolve();

	private enqueue<T>(fn: () => Promise<T>): Promise<T> {
		const next = this.chain.then(fn, fn);
		this.chain = next.catch(() => {});
		return next;
	}

	/** Apply the op now if the draft is closed; park it for the tick if not. */
	applyOrPark(op: DraftOp): Promise<OpOutcome> {
		return this.enqueue(async () => {
			if (await this.isLocked()) {
				this.parked.push(op);
				return { status: "parked", parkedEdits: this.parked.length };
			}
			return this.applyNow(op);
		});
	}

	private async applyNow(op: DraftOp): Promise<OpOutcome> {
		let bytes: Uint8Array;
		try {
			bytes = new Uint8Array(await readFile(this.path));
		} catch {
			return { status: "failed", reason: `cannot read ${this.filename}` };
		}
		const result =
			op.kind === "redline"
				? await applyRedline(bytes, op.edit, this.author)
				: await addComment(bytes, op.request, this.author);
		if (!result.applied) return { status: "failed", reason: result.reason };
		// The attorney may have opened the draft while we computed — park rather
		// than write under a fresh lock (the tick recomputes against their saves).
		if (await this.isLocked()) {
			this.parked.push(op);
			return { status: "parked", parkedEdits: this.parked.length };
		}
		await writeFile(this.path, result.bytes);
		return { status: "applied" };
	}

	/**
	 * Advance the machine: when the draft is closed, drain parked ops — comments
	 * first (they anchor to visible text a redline would fragment), otherwise in
	 * arrival order. A failure is recorded and surfaced via status; a re-lock
	 * mid-drain re-parks the remainder.
	 */
	tick(): Promise<void> {
		if (this.parked.length === 0) return Promise.resolve();
		return this.enqueue(() => this.drain());
	}

	private async drain(): Promise<void> {
		if (this.parked.length === 0 || (await this.isLocked())) return;
		const ops = this.parked.splice(0);
		ops.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "comment" ? -1 : 1));
		while (ops.length > 0) {
			const op = ops.shift() as DraftOp;
			const outcome = await this.applyNow(op);
			if (outcome.status === "failed")
				this.failures.push(`${describeOp(op)} — ${outcome.reason}`);
			if (outcome.status === "parked") {
				// applyNow re-parked `op`; keep the rest queued behind it, in order.
				this.parked.push(...ops);
				return;
			}
		}
	}

	/** Clear surfaced failures once the UI has shown them. */
	clearFailures(): void {
		this.failures = [];
	}
}

// One dance per draft file, created on first touch. Each runs a 1s tick so
// parked edits land the moment the attorney closes the draft — unref'd, so an
// idle process (or a test run) can still exit.
const dances = new Map<string, DraftDance>();

export function danceFor(folder: string, filename: string): DraftDance {
	const key = join(folder, filename);
	const existing = dances.get(key);
	if (existing) return existing;
	const dance = new DraftDance(folder, filename);
	dances.set(key, dance);
	const timer = setInterval(() => {
		dance.tick().catch((err) => console.error("[dance]", key, err));
	}, 1000);
	timer.unref?.();
	return dance;
}
