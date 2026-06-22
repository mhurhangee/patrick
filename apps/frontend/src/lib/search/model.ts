// The embedding model id — shared by the worker (which loads it) and the index
// persistence (which stamps it, so a persisted index built with a different model
// is rebuilt rather than trusted). Keep in sync with scripts/fetch-search-model.mjs.
export const EMBED_MODEL = "Xenova/bge-small-en-v1.5";

// The cross-encoder reranker — re-scores the top hybrid candidates by reading
// query+passage together. Small + fast (MS MARCO MiniLM-L6). Keep in sync with
// scripts/fetch-search-model.mjs.
export const RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";
