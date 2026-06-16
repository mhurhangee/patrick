export { classifySlug, type SlugClassification } from "./classify";
export { extractProvision } from "./extract";
export { fileCachedFetcher, type PageFetcher } from "./fetch-page";
export { lookupProvisions } from "./lookup";
export { provisionList, type Resolution, resolveCitation } from "./resolve";
export type { EpcMap, EpcMapEntry } from "./types";
// The provision/lookup domain types are re-homed in @patrick/shared.
