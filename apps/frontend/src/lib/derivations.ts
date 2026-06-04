// The derivation family. A derivation takes a source, runs an AI pass, saves a
// file beside it, and surfaces as a view in the source's tab (+ an AgentPat tool).
// ExtractPat is derivation #1. Notes is NOT a derivation (human-authored).
//
// To add a derivation:
//   1. add an entry here
//   2. add its folder + router in apps/api (see derivations/extractions/ + notes/)
//   3. in source-pane.tsx: call its hook, add a body case, add its Derive ▾ controls
export type DerivationId = "extraction" // | "summary" | "analysis" | "translation"

export type DerivationDef = {
	id: DerivationId
	/** Segment label in the source-tab view toggle. */
	label: string
	/** Item label in the Derive ▾ menu. */
	deriveLabel: string
}

export const DERIVATIONS: DerivationDef[] = [
	{ id: "extraction", label: "Extracted Data", deriveLabel: "Extract data" },
]
