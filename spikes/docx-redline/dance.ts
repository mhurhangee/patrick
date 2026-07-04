// Spike 3: THE DANCE — canonical file + lock detection + parked writes + save-triggered comments.
//
//   bun dance.ts         interactive: open dance-draft.docx in LibreOffice/Word and play.
//                        stdin commands: edit | status | quit
//   bun dance.ts --sim   automated: fakes a LibreOffice lock marker to verify park/apply.
//
// Protocol under test: reads never block; writes only when unlocked (else park, apply on
// lock release); every save is scanned for new @Patrick comments, which queue a response.
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { configureXmlProvider, setDefaultAuthor } from "@ansonlai/docx-redline-js";
import { applyOperationToDocumentXml } from "@ansonlai/docx-redline-js/services/standalone-operation-runner.js";
import { copyFileSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";

configureXmlProvider({ DOMParser, XMLSerializer });
setDefaultAuthor("Patrick");

const SOURCE = "Non-Final Rejection(1).docx";
const DRAFT = "dance-draft.docx";
const LO_LOCK = `.~lock.${DRAFT}#`;
const sim = process.argv.includes("--sim");

const log = (msg: string) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

// Word owner files start with ~$; LibreOffice uses .~lock.<name>#
const isLocked = () =>
	readdirSync(".").some((f) => f === LO_LOCK || (f.startsWith("~$") && f.endsWith(".docx")));

const EDITS = [
	{
		label: "amend the 'on the merits' sentence",
		target: "This communication is a First Office Action Non-Final Rejection on the merits.",
		modified:
			"This communication is a First Office Action Non-Final Rejection on the merits, responsive to the amendment filed 12 May 2026.",
	},
	{
		label: "contest the Heinla/Iagnemma combination",
		target:
			"Heinla and Iagnemma both teach analogous arts of autonomous vehicle control using LIDAR and camera sensor and processing units.",
		modified:
			"Heinla and Iagnemma are directed to unrelated fields and do not teach autonomous vehicle control combining LIDAR and camera sensing.",
	},
];

type Edit = (typeof EDITS)[number];
const parked: Edit[] = [];
const seenComments = new Set<string>();
let editCursor = 0;
let lastMtime = 0;
let prevLocked = false;

// Patrick makes text edits only, so Patrick-authored rPrChange is always engine noise.
const stripGhosts = (xml: string) =>
	xml
		.replace(/<w:rPrChange w:id="[^"]*" w:author="Patrick"[^>]*>[\s\S]*?<\/w:rPrChange>/g, "")
		.replace(/<w:rPrChange w:id="[^"]*" w:author="Patrick"[^>]*\/>/g, "");

async function applyEdits(edits: Edit[]) {
	const zip = await JSZip.loadAsync(await Bun.file(DRAFT).arrayBuffer());
	let xml = await zip.file("word/document.xml")!.async("string");
	for (const e of edits) {
		const r = await applyOperationToDocumentXml(
			xml,
			{ type: "redline", target: e.target, modified: e.modified },
			"Patrick",
		);
		if (r.hasChanges) {
			xml = r.documentXml;
			log(`✅ redline applied: ${e.label}`);
		} else {
			log(`⚠️ target text not found (paragraph changed since queued?): ${e.label}`);
		}
	}
	zip.file("word/document.xml", stripGhosts(xml));
	await Bun.write(DRAFT, await zip.generateAsync({ type: "uint8array" }));
	lastMtime = statSync(DRAFT).mtimeMs; // our own write is not a user save
}

async function queueNextEdit(why: string) {
	const edit = EDITS[editCursor++];
	if (!edit) {
		log("no scripted edits left");
		return;
	}
	if (isLocked()) {
		parked.push(edit);
		log(`🔒 draft is open — parked "${edit.label}" (${why}). Close the doc and I'll write.`);
	} else {
		log(`🔓 write window open — applying "${edit.label}" (${why})`);
		await applyEdits([edit]);
		log("   reopen the draft to review the redline");
	}
}

async function scanComments(seedOnly = false) {
	const zip = await JSZip.loadAsync(await Bun.file(DRAFT).arrayBuffer());
	const file = zip.file("word/comments.xml");
	if (!file) return;
	const xml = await file.async("string");
	for (const m of xml.matchAll(/<w:comment [^>]*?w:author="([^"]*)"[^>]*?>([\s\S]*?)<\/w:comment>/g)) {
		const [whole, author, body] = m;
		const id = /w:id="(\d+)"/.exec(whole)?.[1] ?? whole.slice(0, 60);
		if (seenComments.has(id) || author === "Patrick") continue;
		seenComments.add(id);
		if (seedOnly) continue;
		const text = [...body.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => x[1]).join("");
		if (/@patrick/i.test(text)) {
			log(`💬 @Patrick comment from ${author}: "${text}"`);
			await queueNextEdit("responding to your comment");
		}
	}
}

async function tick() {
	const locked = isLocked();
	if (locked !== prevLocked) {
		prevLocked = locked;
		if (locked) {
			log("🔒 draft opened in an editor — writes will park until you close it");
		} else {
			log("🔓 draft closed — write window open");
			if (parked.length) await applyEdits(parked.splice(0));
		}
	}
	const mtime = statSync(DRAFT).mtimeMs;
	if (mtime !== lastMtime) {
		lastMtime = mtime;
		log("💾 save detected — re-reading latest state");
		await scanComments();
	}
}

// --- setup ---
if (sim && existsSync(DRAFT)) rmSync(DRAFT);
if (!existsSync(DRAFT)) {
	copyFileSync(SOURCE, DRAFT);
	log(`created ${DRAFT} from ${SOURCE}`);
}
lastMtime = statSync(DRAFT).mtimeMs;
prevLocked = isLocked();
await scanComments(true); // seed: don't react to comments that pre-exist (examiner's own)

if (sim) {
	log("--- SIM: edit while unlocked → applies immediately ---");
	await queueNextEdit("sim");
	log("--- SIM: fake LibreOffice lock, edit while locked → parks ---");
	writeFileSync(LO_LOCK, "sim");
	await tick();
	await queueNextEdit("sim");
	if (parked.length !== 1) throw new Error("expected 1 parked edit");
	log("--- SIM: release lock → parked edit applies ---");
	rmSync(LO_LOCK);
	await tick();
	if (parked.length !== 0) throw new Error("expected parked queue drained");
	const zip = await JSZip.loadAsync(await Bun.file(DRAFT).arrayBuffer());
	const xml = await zip.file("word/document.xml")!.async("string");
	const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => x[1]).join("");
	const ok =
		text.includes("responsive to the amendment filed 12 May 2026") &&
		text.includes("unrelated fields") &&
		xml.includes("<w:ins ") &&
		xml.includes("<w:del ");
	log(ok ? "SIM PASS — both redlines present as tracked changes" : "SIM FAIL");
	process.exit(ok ? 0 : 1);
}

log(`watching ${DRAFT} — open it in LibreOffice/Word and play`);
log("commands: edit (queue next scripted redline) | status | quit");
setInterval(tick, 1000);

for await (const line of console) {
	const cmd = line.trim().toLowerCase();
	if (cmd === "edit") await queueNextEdit("on your command");
	else if (cmd === "status")
		log(`locked: ${isLocked()} | parked: ${parked.length} | edits left: ${EDITS.length - editCursor}`);
	else if (cmd === "quit") process.exit(0);
	else if (cmd) log("commands: edit | status | quit");
}
