/**
 * Documents — barrel re-exports for backward compatibility
 *
 * External consumers (documents.router.ts, mcp.ts, process-document.ts)
 * can keep importing from "./documents" which resolves to this index.
 */

export { addDocument, checkUrlExists, ensureSpace } from "./add"
export {
	deleteDocumentAttachment,
	getDocumentAttachment,
	listDocumentAttachments,
	uploadDocumentAttachment,
} from "./attachments"
export {
	createBundle,
	getDocumentChildren,
	updateBundleParentStatus,
} from "./bundles"
export {
	cancelDocument,
	deleteDocument,
	getDocument,
	updateDocument,
} from "./crud"
export {
	listDocuments,
	listDocumentsWithMemories,
	listDocumentsWithMemoriesByIds,
} from "./listing"
export {
	findDocumentRelatedLinks,
	getDocumentStatus,
	getQueueMetrics,
	migrateMcpDocuments,
} from "./status"
export type {
	BundleCreateInput,
	DocumentsByIdsInput,
	DocumentsQueryInput,
	ListMemoriesInput,
	MemoryAddInput,
} from "./utils"
export { DocumentsByIdsSchema } from "./utils"
