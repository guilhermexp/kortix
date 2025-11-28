/**
 * Document-related types and interfaces
 * Centralized to eliminate duplication across the codebase
 */

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

export interface DocumentWithMemories extends BaseDocument {
  memories: Memory[]
  chunk_count?: number
  _count?: {
    memories: number
    chunks: number
  }
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

export interface ProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  error?: string
  started_at?: string
  completed_at?: string
}

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

export interface Chunk {
  id: string
  document_id: string
  content: string
  embedding: number[]
  chunk_index: number
  created_at: string
}

export interface CanvasPosition {
  id: string
  document_id: string
  user_id: string
  org_id: string
  x: number
  y: number
  width: number
  height: number
  z_index?: number
  created_at: string
  updated_at: string
}

export interface SearchResult {
  id: string
  title: string
  content_preview: string
  url?: string
  score: number
  document_id: string
  memory_type: 'document' | 'memory'
  created_at: string
}

export interface DocumentsResponse {
  documents: DocumentPreview[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface DocumentFilter {
  status?: ProcessingStatus['status']
  date_from?: string
  date_to?: string
  search?: string
  tags?: string[]
}

export interface DocumentCreateInput {
  title: string
  content?: string
  url?: string
  metadata?: Record<string, any>
  tags?: string[]
}

export interface DocumentUpdateInput {
  title?: string
  content?: string
  url?: string
  metadata?: Record<string, any>
  tags?: string[]
}