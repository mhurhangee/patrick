// The embedding model id — shared by the worker (which loads it) and the index
// persistence (which stamps it, so a persisted index built with a different model
// is rebuilt rather than trusted). Keep in sync with scripts/fetch-search-model.mjs.
export const EMBED_MODEL = "Xenova/bge-small-en-v1.5";
