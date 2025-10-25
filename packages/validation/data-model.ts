/**
 * Supermemory Data Model Types & Validation
 *
 * This is the SINGLE SOURCE OF TRUTH for:
 * - TypeScript type definitions
 * - Zod validation schemas
 * - Runtime validation
 * - Code generation guardrails
 *
 * Generated from: DATA_MODEL_REFERENCE.md
 * Last updated: 2025-10-25
 */

import { z } from "zod"

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const DocumentStatus = {
  Unknown: "unknown",
  Queued: "queued",
  Extracting: "extracting",
  Chunking: "chunking",
  Embedding: "embedding",
  Indexing: "indexing",
  Done: "done",
  Failed: "failed",
} as const

export type DocumentStatus = typeof DocumentStatus[keyof typeof DocumentStatus]

export const DocumentType = {
  Text: "text",
  Link: "link",
  File: "file",
  Email: "email",
} as const

export type DocumentType = typeof DocumentType[keyof typeof DocumentType]

export const ConnectionProvider = {
  GoogleDrive: "google_drive",
  Notion: "notion",
  OneDrive: "onedrive",
} as const

export type ConnectionProvider = typeof ConnectionProvider[keyof typeof ConnectionProvider]

export const OrganizationRole = {
  Owner: "owner",
  Admin: "admin",
  Member: "member",
} as const

export type OrganizationRole = typeof OrganizationRole[keyof typeof OrganizationRole]

export const Visibility = {
  Private: "private",
  Shared: "shared",
  Public: "public",
} as const

export type Visibility = typeof Visibility[keyof typeof Visibility]

export const RelationshipType = {
  Related: "related",
  References: "references",
  Contradicts: "contradicts",
  Similar: "similar",
  Extends: "extends",
} as const

export type RelationshipType = typeof RelationshipType[keyof typeof RelationshipType]

export const IngestionJobStatus = {
  Queued: "queued",
  Running: "running",
  Done: "done",
  Failed: "failed",
} as const

export type IngestionJobStatus = typeof IngestionJobStatus[keyof typeof IngestionJobStatus]

export const ProcessingStage = {
  Extracting: "extracting",
  Chunking: "chunking",
  Embedding: "embedding",
  Summarizing: "summarizing",
} as const

export type ProcessingStage = typeof ProcessingStage[keyof typeof ProcessingStage]

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

// Base schemas for common validations
const UUIDSchema = z.string().uuid()
const EmailSchema = z.string().email()
const URLSchema = z.string().url()
const SHA256Schema = z.string().regex(/^[a-f0-9]{64}$/i)
const SlugSchema = z.string().regex(/^[a-z0-9-]+$/).min(3).max(50)

// ============================================================================
// ORGANIZATIONS
// ============================================================================

export const OrganizationSchema = z.object({
  id: UUIDSchema,
  slug: SlugSchema,
  name: z.string().min(1).max(255),
  metadata: z.record(z.any()).default({}),
  created_at: z.string().datetime(),
})

export type Organization = z.infer<typeof OrganizationSchema>

export const CreateOrganizationSchema = OrganizationSchema.pick({
  slug: true,
  name: true,
  metadata: true,
})

export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>

// ============================================================================
// USERS
// ============================================================================

export const UserSchema = z.object({
  id: UUIDSchema,
  email: EmailSchema,
  hashed_password: z.string().nullable(),
  name: z.string().max(255).nullable(),
  image_url: z.string().url().nullable(),
  metadata: z.record(z.any()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type User = z.infer<typeof UserSchema>

export const CreateUserSchema = z.object({
  email: EmailSchema,
  name: z.string().max(255).optional(),
  image_url: URLSchema.optional(),
  metadata: z.record(z.any()).optional(),
})

export type CreateUser = z.infer<typeof CreateUserSchema>

// ============================================================================
// SESSIONS
// ============================================================================

export const SessionSchema = z.object({
  id: UUIDSchema,
  user_id: UUIDSchema,
  organization_id: UUIDSchema.nullable(),
  session_token: z.string().min(32),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
})

export type Session = z.infer<typeof SessionSchema>

export const CreateSessionSchema = SessionSchema.pick({
  user_id: true,
  organization_id: true,
  session_token: true,
  expires_at: true,
})

export type CreateSession = z.infer<typeof CreateSessionSchema>

// ============================================================================
// SPACES
// ============================================================================

export const SpaceSchema = z.object({
  id: UUIDSchema,
  organization_id: UUIDSchema,
  container_tag: z.string(),
  name: z.string().max(255).nullable(),
  description: z.string().nullable(),
  visibility: z.enum(["private", "shared", "public"]),
  is_experimental: z.boolean(),
  metadata: z.record(z.any()),
  content_text_index: z.record(z.any()),
  index_size: z.number().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Space = z.infer<typeof SpaceSchema>

export const CreateSpaceSchema = z.object({
  organization_id: UUIDSchema,
  container_tag: z.string(),
  name: z.string().max(255).optional(),
  description: z.string().optional(),
  visibility: z.enum(["private", "shared", "public"]).default("private"),
  is_experimental: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
})

export type CreateSpace = z.infer<typeof CreateSpaceSchema>

// ============================================================================
// DOCUMENTS
// ============================================================================

export const DocumentSchema = z.object({
  id: UUIDSchema,
  org_id: UUIDSchema,
  user_id: UUIDSchema,
  connection_id: UUIDSchema.nullable(),
  custom_id: z.string().nullable(),
  content_hash: SHA256Schema.nullable(),
  title: z.string().max(1000).nullable(),
  content: z.string().max(1000000).nullable(),
  summary: z.string().max(5000).nullable(),
  url: URLSchema.nullable(),
  source: z.string().nullable(),
  type: z.enum(["text", "link", "file", "email"]),
  status: z.enum([
    "unknown",
    "queued",
    "extracting",
    "chunking",
    "embedding",
    "indexing",
    "done",
    "failed",
  ]),
  metadata: z.record(z.any()).nullable(),
  processing_metadata: z.record(z.any()).nullable(),
  raw: z.record(z.any()).nullable(),
  og_image: URLSchema.nullable(),
  token_count: z.number().int().nullable(),
  word_count: z.number().int().nullable(),
  chunk_count: z.number().int().min(0),
  average_chunk_size: z.number().int().nullable(),
  summary_embedding: z.array(z.number()).length(1536).nullable(),
  summary_embedding_model: z.string().nullable(),
  summary_embedding_new: z.array(z.number()).length(1536).nullable(),
  summary_embedding_model_new: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  search_vector: z.any().nullable(),
})

export type Document = z.infer<typeof DocumentSchema>

export const CreateDocumentSchema = z.object({
  org_id: UUIDSchema,
  user_id: UUIDSchema,
  title: z.string().max(1000).optional(),
  content: z.string().max(1000000).optional(),
  url: URLSchema.optional(),
  source: z.string().optional(),
  type: z.enum(["text", "link", "file", "email"]).default("text"),
  metadata: z.record(z.any()).optional(),
})

export type CreateDocument = z.infer<typeof CreateDocumentSchema>

// ============================================================================
// DOCUMENT CHUNKS
// ============================================================================

export const DocumentChunkSchema = z.object({
  id: UUIDSchema,
  document_id: UUIDSchema,
  org_id: UUIDSchema,
  content: z.string(),
  embedded_content: z.string().nullable(),
  type: z.enum(["text", "heading", "code", "table"]),
  position: z.number().int().nullable(),
  metadata: z.record(z.any()).nullable(),
  embedding: z.array(z.number()).length(1536).nullable(),
  embedding_model: z.string().nullable(),
  embedding_new: z.array(z.number()).length(1536).nullable(),
  embedding_new_model: z.string().nullable(),
  created_at: z.string().datetime(),
  fts: z.any().nullable(),
})

export type DocumentChunk = z.infer<typeof DocumentChunkSchema>

export const CreateDocumentChunkSchema = z.object({
  document_id: UUIDSchema,
  org_id: UUIDSchema,
  content: z.string(),
  type: z.enum(["text", "heading", "code", "table"]).default("text"),
  position: z.number().int().optional(),
  metadata: z.record(z.any()).optional(),
})

export type CreateDocumentChunk = z.infer<typeof CreateDocumentChunkSchema>

// ============================================================================
// MEMORIES
// ============================================================================

export const MemorySchema = z.object({
  id: UUIDSchema,
  document_id: UUIDSchema.nullable(),
  space_id: UUIDSchema.nullable(),
  org_id: UUIDSchema,
  user_id: UUIDSchema.nullable(),
  content: z.string(),
  metadata: z.record(z.any()).nullable(),
  memory_embedding: z.array(z.number()).length(1536).nullable(),
  memory_embedding_model: z.string().nullable(),
  memory_embedding_new: z.array(z.number()).length(1536).nullable(),
  memory_embedding_new_model: z.string().nullable(),
  is_latest: z.boolean(),
  version: z.number().int().min(1),
  is_inference: z.boolean(),
  is_forgotten: z.boolean(),
  forget_after: z.string().datetime().nullable(),
  forget_reason: z.string().nullable(),
  source_count: z.number().int().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Memory = z.infer<typeof MemorySchema>

export const CreateMemorySchema = z.object({
  org_id: UUIDSchema,
  document_id: UUIDSchema.optional(),
  space_id: UUIDSchema.optional(),
  user_id: UUIDSchema.optional(),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
})

export type CreateMemory = z.infer<typeof CreateMemorySchema>

// ============================================================================
// MEMORY RELATIONSHIPS
// ============================================================================

export const MemoryRelationshipSchema = z.object({
  id: UUIDSchema,
  org_id: UUIDSchema,
  source_memory_id: UUIDSchema,
  target_memory_id: UUIDSchema,
  relationship_type: z.enum(["related", "references", "contradicts", "similar", "extends"]),
  metadata: z.record(z.any()).nullable(),
  created_at: z.string().datetime(),
})

export type MemoryRelationship = z.infer<typeof MemoryRelationshipSchema>

export const CreateMemoryRelationshipSchema = z.object({
  org_id: UUIDSchema,
  source_memory_id: UUIDSchema,
  target_memory_id: UUIDSchema,
  relationship_type: z.enum(["related", "references", "contradicts", "similar", "extends"]),
  metadata: z.record(z.any()).optional(),
})

export type CreateMemoryRelationship = z.infer<typeof CreateMemoryRelationshipSchema>

// ============================================================================
// API KEYS
// ============================================================================

export const ApiKeySchema = z.object({
  id: UUIDSchema,
  org_id: UUIDSchema,
  user_id: UUIDSchema.nullable(),
  name: z.string(),
  prefix: z.string().length(4).nullable(),
  secret_hash: z.string().length(64),
  token_hint: z.string().length(4),
  metadata: z.record(z.any()),
  last_used_at: z.string().datetime().nullable(),
  expires_at: z.string().datetime().nullable(),
  revoked_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type ApiKey = z.infer<typeof ApiKeySchema>

export const CreateApiKeySchema = z.object({
  org_id: UUIDSchema,
  user_id: UUIDSchema.optional(),
  name: z.string(),
  metadata: z.record(z.any()).optional(),
})

export type CreateApiKey = z.infer<typeof CreateApiKeySchema>

// ============================================================================
// INGESTION JOBS
// ============================================================================

export const IngestionJobSchema = z.object({
  id: UUIDSchema,
  document_id: UUIDSchema,
  org_id: UUIDSchema,
  status: z.enum(["queued", "running", "done", "failed"]),
  attempts: z.number().int().min(0),
  payload: z.record(z.any()).nullable(),
  error_message: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type IngestionJob = z.infer<typeof IngestionJobSchema>

export const CreateIngestionJobSchema = z.object({
  document_id: UUIDSchema,
  org_id: UUIDSchema,
  payload: z.record(z.any()).optional(),
})

export type CreateIngestionJob = z.infer<typeof CreateIngestionJobSchema>

// ============================================================================
// PROCESSING LOGS
// ============================================================================

export const ProcessingLogSchema = z.object({
  id: UUIDSchema,
  job_id: UUIDSchema,
  stage: z.enum(["extracting", "chunking", "embedding", "summarizing"]),
  status: z.enum(["running", "success", "error"]),
  message: z.string().nullable(),
  metadata: z.record(z.any()).nullable(),
  created_at: z.string().datetime(),
  org_id: UUIDSchema,
})

export type ProcessingLog = z.infer<typeof ProcessingLogSchema>

export const CreateProcessingLogSchema = ProcessingLogSchema.pick({
  job_id: true,
  stage: true,
  status: true,
  message: true,
  metadata: true,
  org_id: true,
})

export type CreateProcessingLog = z.infer<typeof CreateProcessingLogSchema>

// ============================================================================
// CONNECTIONS
// ============================================================================

export const ConnectionSchema = z.object({
  id: UUIDSchema,
  org_id: UUIDSchema,
  user_id: UUIDSchema.nullable(),
  provider: z.enum(["google_drive", "notion", "onedrive"]),
  email: z.string().email().nullable(),
  document_limit: z.number().int(),
  container_tags: z.array(z.string()).nullable(),
  access_token: z.string().nullable(),
  refresh_token: z.string().nullable(),
  expires_at: z.string().datetime().nullable(),
  metadata: z.record(z.any()).nullable(),
  created_at: z.string().datetime(),
})

export type Connection = z.infer<typeof ConnectionSchema>

export const CreateConnectionSchema = z.object({
  org_id: UUIDSchema,
  user_id: UUIDSchema.optional(),
  provider: z.enum(["google_drive", "notion", "onedrive"]),
  email: z.string().email().optional(),
  document_limit: z.number().int().default(10000),
  container_tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
})

export type CreateConnection = z.infer<typeof CreateConnectionSchema>

// ============================================================================
// API REQUESTS (AUDIT LOG)
// ============================================================================

export const ApiRequestSchema = z.object({
  id: UUIDSchema,
  org_id: UUIDSchema,
  user_id: UUIDSchema.nullable(),
  key_id: UUIDSchema.nullable(),
  request_type: z.string(),
  status_code: z.number().int(),
  duration_ms: z.number().int().nullable(),
  input: z.record(z.any()).nullable(),
  output: z.record(z.any()).nullable(),
  original_tokens: z.number().int().nullable(),
  final_tokens: z.number().int().nullable(),
  tokens_saved: z.number().int().nullable(),
  cost_saved_usd: z.number().nullable(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  conversation_id: z.string().nullable(),
  context_modified: z.boolean(),
  metadata: z.record(z.any()).nullable(),
  origin: z.enum(["api", "web", "extension"]),
  created_at: z.string().datetime(),
})

export type ApiRequest = z.infer<typeof ApiRequestSchema>

export const CreateApiRequestSchema = z.object({
  org_id: UUIDSchema,
  user_id: UUIDSchema.optional(),
  key_id: UUIDSchema.optional(),
  request_type: z.string(),
  status_code: z.number().int(),
  duration_ms: z.number().int().optional(),
  input: z.record(z.any()).optional(),
  output: z.record(z.any()).optional(),
  original_tokens: z.number().int().optional(),
  final_tokens: z.number().int().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  conversation_id: z.string().optional(),
  context_modified: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
  origin: z.enum(["api", "web", "extension"]).default("api"),
})

export type CreateApiRequest = z.infer<typeof CreateApiRequestSchema>

// ============================================================================
// ORGANIZATION MEMBERS
// ============================================================================

export const OrganizationMemberSchema = z.object({
  id: UUIDSchema,
  organization_id: UUIDSchema,
  user_id: UUIDSchema,
  role: z.enum(["owner", "admin", "member"]),
  is_owner: z.boolean(),
  created_at: z.string().datetime(),
})

export type OrganizationMember = z.infer<typeof OrganizationMemberSchema>

export const CreateOrganizationMemberSchema = z.object({
  organization_id: UUIDSchema,
  user_id: UUIDSchema,
  role: z.enum(["owner", "admin", "member"]).default("member"),
  is_owner: z.boolean().default(false),
})

export type CreateOrganizationMember = z.infer<typeof CreateOrganizationMemberSchema>

// ============================================================================
// COMPOSITE TYPES (for code generation safety)
// ============================================================================

/**
 * Session context extracted from session middleware
 * Every API request must have this
 */
export const SessionContextSchema = z.object({
  organizationId: UUIDSchema,
  userId: UUIDSchema,
})

export type SessionContext = z.infer<typeof SessionContextSchema>

/**
 * Query context for all database operations
 * Must be passed to every query function
 */
export const QueryContextSchema = z.object({
  organizationId: UUIDSchema,
  userId: z.string().optional(),
})

export type QueryContext = z.infer<typeof QueryContextSchema>

// ============================================================================
// BATCH VALIDATION SCHEMAS
// ============================================================================

export const BatchCreateDocumentsSchema = z.object({
  org_id: UUIDSchema,
  user_id: UUIDSchema,
  documents: z.array(CreateDocumentSchema),
})

export type BatchCreateDocuments = z.infer<typeof BatchCreateDocumentsSchema>

export const BatchCreateChunksSchema = z.object({
  org_id: UUIDSchema,
  chunks: z.array(CreateDocumentChunkSchema),
})

export type BatchCreateChunks = z.infer<typeof BatchCreateChunksSchema>

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate and parse any data against a Zod schema
 * Throws descriptive error on validation failure
 */
export function validateData<T>(schema: z.ZodSchema, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const errors = result.error.flatten()
    throw new Error(
      `Validation error: ${JSON.stringify(errors.fieldErrors)}`,
    )
  }
  return result.data as T
}

/**
 * Check if data is valid without throwing
 */
export function isValid<T>(schema: z.ZodSchema, data: unknown): data is T {
  return schema.safeParse(data).success
}

/**
 * Type guard: ensure string is valid DocumentStatus
 */
export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return Object.values(DocumentStatus).includes(value as DocumentStatus)
}

/**
 * Type guard: ensure string is valid DocumentType
 */
export function isDocumentType(value: unknown): value is DocumentType {
  return Object.values(DocumentType).includes(value as DocumentType)
}

/**
 * Type guard: ensure string is valid ConnectionProvider
 */
export function isConnectionProvider(value: unknown): value is ConnectionProvider {
  return Object.values(ConnectionProvider).includes(value as ConnectionProvider)
}

/**
 * Type guard: ensure string is valid OrganizationRole
 */
export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return Object.values(OrganizationRole).includes(value as OrganizationRole)
}
