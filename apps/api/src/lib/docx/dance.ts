import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DraftComment, DraftStatus } from "@patrick/shared";
import {
	addComment,
	applyRedline,
	type CommentRequest,
	listComments,
	REDLINE_AUTHOR,
	type RedlineEdit,
	resolveParagraphRevision,
} from "./redline";

// THE DANCE: Word/LibreOffice holds a lock on an open draft, so Patrick and the
// attorney share it by protocol, not by force:
// - Reads never block — the last-saved bytes are always readable.
// - Writes happen only in the write window (no lock marker). While the draft is
//   open, finished edits PARK and land the moment it's closed (the tick).
//   Parked ops are persisted under .patrick/parked/ — the tools already told
//   the attorney the edit will land, so an app restart must not lose it.
// - Never write in place while open: Word won't reload an externally-changed
//   file, and its next save would clobber the write.
// "Save = talk to Patrick. Close = let Patrick write."

export type DraftOp =
	| { kind: "redline"; edit: RedlineEdit }
	| { kind: "comment"; request: CommentRequest }
	// The attorney's in-app accept/reject of a paragraph's redline — mutates the
	// file, so it rides the dance (parks while the draft is open) like an edit.
	| { kind: "resolve"; paragraphIndex: number; action: "accept" | "reject" };

export type OpOutcome =
	| { status: "applied" }
	| { status: "parked"; parkedEdits: number }
	| { status: "failed"; reason: string };

/** The parked-op shape surfaced in DraftStatus (kind + a short summary). */
function summariseOp(op: DraftOp): {
	kind: "redline" | "comment" | "resolve";
	summary: string;
} {
	if (op.kind === "redline")
		return { kind: "redline", summary: op.edit.targetText.slice(0, 80) };
	if (op.kind === "comment")
		return { kind: "comment", summary: op.request.text.slice(0, 80) };
	return {
		kind: "resolve",
		summary: `${op.action} ¶${op.paragraphIndex}`,
	};
}

function describeOp(op: DraftOp): string {
	if (op.kind === "redline")
		return `edit "${op.edit.targetText.slice(0, 60)}…"`;
	if (op.kind === "comment")
		return `comment "${op.request.text.slice(0, 60)}…"`;
	return `${op.action} paragraph ${op.paragraphIndex}`;
}

export class DraftDance {
	private parked: DraftOp[] = [];
	private failures: string[] = [];
	private loaded = false;
	// Mentions are re-derived only when the file changes — status() is polled
	// every 2s per open tab and a full unzip+parse per poll is waste.
	private mentionsCache: { mtimeMs: number; mentions: DraftComment[] } | null =
		null;

	constructor(
		readonly folder: string,
		readonly filename: string,
		private author = REDLINE_AUTHOR,
	) {}

	private get path(): string {
		return join(this.folder, this.filename);
	}

	private get parkedPath(): string {
		return join(this.folder, ".patrick", "parked", `${this.filename}.json`);
	}

	// Parked ops survive an app/api restart: the queue is mirrored to disk on
	// every change and lazily loaded before the first operation that needs it.
	private async ensureLoaded(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		try {
			const raw = await readFile(this.parkedPath, "utf8");
			const ops = JSON.parse(raw) as DraftOp[];
			if (Array.isArray(ops)) this.parked.push(...ops);
		} catch {
			// no sidecar — nothing parked from a previous session
		}
	}

	private async persistParked(): Promise<void> {
		try {
			if (this.parked.length === 0) {
				await rm(this.parkedPath, { force: true });
				return;
			}
			await mkdir(dirname(this.parkedPath), { recursive: true });
			await writeFile(this.parkedPath, JSON.stringify(this.parked), "utf8");
		} catch (err) {
			console.error("[dance] failed to persist parked ops", err);
		}
	}

	private async park(op: DraftOp): Promise<OpOutcome> {
		this.parked.push(op);
		await this.persistParked();
		return { status: "parked", parkedEdits: this.parked.length };
	}

	/** A Word (`~$…`) or LibreOffice (`.~lock.…#`) lock marker is present. */
	async isLocked(): Promise<boolean> {
		// LibreOffice wraps the full name. Word's owner file replaces the leading
		// characters with ~$: two for names ≥8 chars before the extension, one for
		// 7-char names, none for shorter ones — probe all three tiers.
		const markers = new Set([
			`.~lock.${this.filename}#`,
			`~$${this.filename}`,
			`~$${this.filename.slice(1)}`,
			`~$${this.filename.slice(2)}`,
		]);
		try {
			return (await readdir(this.folder)).some((f) => markers.has(f));
		} catch {
			return false;
		}
	}

	async status(): Promise<DraftStatus> {
		await this.enqueue(() => this.ensureLoaded());
		let lastSavedMs: number | null = null;
		let exists = true;
		let mentions: DraftComment[] = [];
		try {
			lastSavedMs = (await stat(this.path)).mtimeMs;
		} catch {
			exists = false;
		}
		if (exists && lastSavedMs != null) {
			if (this.mentionsCache?.mtimeMs === lastSavedMs) {
				mentions = this.mentionsCache.mentions;
			} else {
				try {
					const comments = await listComments(
						new Uint8Array(await readFile(this.path)),
					);
					mentions = comments.filter(
						(c) => c.author !== this.author && /@patrick/i.test(c.text),
					);
					this.mentionsCache = { mtimeMs: lastSavedMs, mentions };
				} catch {
					// unreadable mid-save — mentions just come back empty this tick
				}
			}
		}
		return {
			exists,
			openInEditor: await this.isLocked(),
			parkedEdits: this.parked.length,
			parkedOps: this.parked.map(summariseOp),
			lastSavedMs,
			mentions,
			failures: [...this.failures],
		};
	}

	// Every mutation is read-file → transform → write-file, so concurrent ops
	// (the model fires tool calls in parallel) would read the same base bytes and
	// the last write would silently swallow the others — measured in the wild:
	// 3 of 12 parallel comments survived. ALL mutations serialize through this
	// per-draft chain; reads (status content) stay lock-free.
	private chain: Promise<unknown> = Promise.resolve();

	private enqueue<T>(fn: () => Promise<T>): Promise<T> {
		const next = this.chain.then(fn, fn);
		this.chain = next.catch(() => {});
		return next;
	}

	/** Apply the op now if the draft is closed; park it for the tick if not. */
	applyOrPark(op: DraftOp): Promise<OpOutcome> {
		return this.enqueue(async () => {
			await this.ensureLoaded();
			if (await this.isLocked()) return this.park(op);
			// Older parked ops go first — applying the new op ahead of them would
			// let a stale parked edit supersede it when the tick drains.
			await this.drain();
			if (await this.isLocked()) return this.park(op);
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
		let result: Awaited<
			ReturnType<
				| typeof applyRedline
				| typeof addComment
				| typeof resolveParagraphRevision
			>
		>;
		try {
			result =
				op.kind === "redline"
					? await applyRedline(bytes, op.edit, this.author)
					: op.kind === "comment"
						? await addComment(bytes, op.request, this.author)
						: await resolveParagraphRevision(
								bytes,
								op.paragraphIndex,
								op.action,
								this.author,
							);
		} catch (err) {
			return {
				status: "failed",
				reason: err instanceof Error ? err.message : "the edit engine failed",
			};
		}
		if (!result.applied) return { status: "failed", reason: result.reason };
		// The attorney may have opened the draft while we computed — park rather
		// than write under a fresh lock (the tick recomputes against their saves).
		if (await this.isLocked()) return this.park(op);
		// Write atomically: a crash mid-write must never leave a truncated .docx.
		const tmp = `${this.path}.patrick-tmp`;
		await writeFile(tmp, result.bytes);
		await rename(tmp, this.path);
		return { status: "applied" };
	}

	/**
	 * Advance the machine: when the draft is closed, drain parked ops — comments
	 * first (they anchor to visible text a redline would fragment), otherwise in
	 * arrival order. A failure (returned OR thrown) is recorded and surfaced via
	 * status; a re-lock mid-drain re-parks the remainder.
	 */
	tick(): Promise<void> {
		// Fast path: once loaded, an empty queue needs no chain slot every second.
		if (this.loaded && this.parked.length === 0) return Promise.resolve();
		return this.enqueue(async () => {
			await this.ensureLoaded();
			await this.drain();
		});
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
				// applyNow re-parked (and persisted) `op`; keep the rest behind it.
				this.parked.push(...ops);
				break;
			}
		}
		await this.persistParked();
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
