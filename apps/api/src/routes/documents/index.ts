/**
 * Documents — barrel re-exports for backward compatibility
 *
 * External consumers (documents.router.ts, mcp.ts, process-document.ts)
 * can keep importing from "./documents" which resolves to this index.
 */

export { getDocument, updateDocument, deleteDocument, cancelDocument } from "./crud";
export { addDocument, ensureSpace, checkUrlExists } from "./add";
export { listDocuments, listDocumentsWithMemories, listDocumentsWithMemoriesByIds } from "./listing";
export { createBundle, getDocumentChildren, updateBundleParentStatus } from "./bundles";
export { getDocumentStatus, getQueueMetrics, findDocumentRelatedLinks, migrateMcpDocuments } from "./status";
export type { MemoryAddInput, ListMemoriesInput, DocumentsQueryInput, DocumentsByIdsInput, BundleCreateInput } from "./utils";
export { DocumentsByIdsSchema } from "./utils";
