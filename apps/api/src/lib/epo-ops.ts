// EPO Open Patent Services (OPS) — fetch structured patent data
// Docs: https://developers.epo.org/ops-v3-2/apis

const OPS_BASE = "https://ops.epo.org/3.2/rest-services"

type OpsAuth = { consumerKey: string; consumerSecret: string }

// Fetch an OAuth2 access token from EPO OPS
async function getToken(auth: OpsAuth): Promise<string> {
	const credentials = btoa(`${auth.consumerKey}:${auth.consumerSecret}`)
	const res = await fetch("https://ops.epo.org/3.2/auth/accesstoken", {
		method: "POST",
		headers: {
			Authorization: `Basic ${credentials}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials",
	})
	if (!res.ok) throw new Error(`EPO OPS auth failed: ${res.status}`)
	const data = (await res.json()) as { access_token: string }
	return data.access_token
}

async function opsGet(path: string, token: string): Promise<unknown> {
	const res = await fetch(`${OPS_BASE}${path}`, {
		headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
	})
	if (!res.ok) throw new Error(`EPO OPS ${res.status}: ${path}`)
	return res.json()
}

// Extract plain text from an OPS text field (handles array or string)
function extractText(field: unknown): string {
	if (!field) return ""
	if (typeof field === "string") return field
	if (Array.isArray(field)) return field.map(extractText).join("\n")
	if (typeof field === "object") {
		const f = field as Record<string, unknown>
		return extractText(f["$"] ?? f["_"] ?? f["p"] ?? "")
	}
	return String(field)
}

export type PatentData = {
	publicationNumber: string
	title: string
	abstract: string
	claims: string
	description: string
	applicants: string[]
	inventors: string[]
	filingDate: string
	publicationDate: string
	ipcClasses: string[]
}

export async function fetchPatent(
	publicationNumber: string,
	auth: OpsAuth,
): Promise<PatentData> {
	const token = await getToken(auth)

	// Normalise to epodoc format (remove spaces/dots)
	const epodoc = publicationNumber.replace(/[\s.]/g, "").toUpperCase()

	const [biblio, description, claims] = await Promise.allSettled([
		opsGet(`/published-data/publication/epodoc/${epodoc}/biblio`, token),
		opsGet(`/published-data/publication/epodoc/${epodoc}/description`, token),
		opsGet(`/published-data/publication/epodoc/${epodoc}/claims`, token),
	])

	// Biblio
	let title = ""
	let abstract = ""
	let filingDate = ""
	let publicationDate = ""
	let applicants: string[] = []
	let inventors: string[] = []
	let ipcClasses: string[] = []

	if (biblio.status === "fulfilled") {
		try {
			const doc = biblio.value as Record<string, unknown>
			const exchDoc =
				(
					(doc["ops:world-patent-data"] as Record<string, unknown>)?.[
						"exchange-documents"
					] as Record<string, unknown>
				)?.["exchange-document"] ?? {}
			const bd = (exchDoc as Record<string, unknown>)?.["bibliographic-data"] as Record<string, unknown> ?? {}

			// Title
			const titleField = bd?.["invention-title"]
			if (Array.isArray(titleField)) {
				title = extractText(titleField.find((t: Record<string, unknown>) => t?.["@lang"] === "en") ?? titleField[0])
			} else {
				title = extractText(titleField)
			}

			// Dates
			const appRef = bd?.["application-reference"] as Record<string, unknown>
			filingDate = extractText((appRef?.["document-id"] as Record<string, unknown>)?.["date"])
			const pubRef = bd?.["publication-reference"] as Record<string, unknown>
			publicationDate = extractText((pubRef?.["document-id"] as Record<string, unknown>)?.["date"])

			// Abstract (from abstract field if present in biblio)
			abstract = extractText(bd?.["abstract"])

			// Parties
			const parties = bd?.["parties"] as Record<string, unknown> ?? {}
			const applicantArr = (parties?.["applicants"] as Record<string, unknown>)?.["applicant"]
			applicants = (Array.isArray(applicantArr) ? applicantArr : applicantArr ? [applicantArr] : [])
				.map((a: unknown) => extractText((a as Record<string, unknown>)?.["applicant-name"]))
				.filter(Boolean)

			const inventorArr = (parties?.["inventors"] as Record<string, unknown>)?.["inventor"]
			inventors = (Array.isArray(inventorArr) ? inventorArr : inventorArr ? [inventorArr] : [])
				.map((i: unknown) => extractText((i as Record<string, unknown>)?.["inventor-name"]))
				.filter(Boolean)

			// IPC
			const ipcArr = (bd?.["classification-ipc"] as Record<string, unknown>)?.["classification-symbol"]
			ipcClasses = (Array.isArray(ipcArr) ? ipcArr : ipcArr ? [ipcArr] : []).map(extractText).filter(Boolean)
		} catch {
			// Partial parse failure — use what we have
		}
	}

	const descriptionText =
		description.status === "fulfilled" ? extractText(description.value) : ""
	const claimsText = claims.status === "fulfilled" ? extractText(claims.value) : ""

	return {
		publicationNumber: epodoc,
		title,
		abstract,
		claims: claimsText,
		description: descriptionText,
		applicants,
		inventors,
		filingDate,
		publicationDate,
		ipcClasses,
	}
}
