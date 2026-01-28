/**
 * Memory graph types
 * Re-exported from validation package for backwards compatibility
 */

export interface Memory {
	id: string
	content: string
	document_id: string
	user_id: string
	org_id: string
	created_at: string
	embedding?: number[]
	metadata?: Record<string, any>
}

export interface BaseDocument {
	id: string
	title: string
	content?: string
	url?: string
	created_at: string
	updated_at: string
	user_id: string
	org_id: string
	processing_status?: ProcessingStatus
	metadata?: Record<string, any>
}

export interface ProcessingStatus {
	status: "pending" | "processing" | "completed" | "failed"
	progress?: number
	error?: string
	started_at?: string
	completed_at?: string
}

export interface DocumentWithMemories extends BaseDocument {
	memories: Memory[]
	chunk_count?: number
	_count?: {
		memories: number
		chunks: number
	}
	// Extended fields commonly used in the app
	type?: string
	customId?: string
	raw?: Record<string, any>
	orgId?: string
	userId?: string
	containerTags?: string[]
	[key: string]: any // Allow additional properties
}

export interface DocumentPreview {
	id: string
	title: string
	url?: string
	content_preview?: string
	thumbnail_url?: string
	favicon?: string
	processing_status: ProcessingStatus
	created_at: string
	memory_count: number
}

export interface SearchResult {
	id: string
	title: string
	content_preview: string
	url?: string
	score: number
	document_id: string
	memory_type: "document" | "memory"
	created_at: string
}
