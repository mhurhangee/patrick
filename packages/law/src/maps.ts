import caselawData from "../data/caselaw-map.json" with { type: "json" };
import epcData from "../data/epc-map.json" with { type: "json" };
import guidelinesEpcData from "../data/guidelines-epc-map.json" with {
	type: "json",
};
import guidelinesPctData from "../data/guidelines-pct-map.json" with {
	type: "json",
};
import type { EpcMap, EpcMapEntry } from "./types";

/** Every indexed page across all source maps. */
export const ENTRIES: EpcMapEntry[] = [
	epcData,
	guidelinesEpcData,
	guidelinesPctData,
	caselawData,
].flatMap((m) => (m as EpcMap).entries);
