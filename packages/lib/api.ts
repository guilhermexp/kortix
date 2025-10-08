import { createFetch, createSchema } from "@better-fetch/fetch"
import { z } from "zod"
import {
	ConnectionResponseSchema,
	CreateProjectSchema,
    UpdateProjectSchema,
	DeleteProjectResponseSchema,
	DeleteProjectSchema,
	DocumentsWithMemoriesQuerySchema,
	DocumentsWithMemoriesResponseSchema,
	ListMemoriesResponseSchema,
	ListProjectsResponseSchema,
	MemoryAddSchema,
	MemoryResponseSchema,
	MigrateMCPRequestSchema,
	MigrateMCPResponseSchema,
	ProjectSchema,
	SearchRequestSchema,
	SearchResponseSchema,
	type SearchResult,
	SettingsRequestSchema,
} from "../validation/api"
import { BACKEND_URL } from "./env"

// Settings response schema - this is custom to console (not in shared validation)
const SettingsResponseSchema = z.object({
	message: z.string(),
	settings: z.object({
		excludeItems: z.array(z.string().min(1).max(20)).optional(),
		filterPrompt: z.string().min(1).max(750).optional(),
		includeItems: z.array(z.string().min(1).max(20)).optional(),
		shouldLLMFilter: z.boolean().optional(),
	}),
})

// Waitlist response schema
const WaitlistStatusResponseSchema = z.object({
	inWaitlist: z.boolean(),
	accessGranted: z.boolean(),
	createdAt: z.string().datetime(),
})

export const apiSchema = createSchema({
	// Connection operations - Add missing endpoints
	"@post/connections/:provider": {
		input: z.object({
			containerTags: z.array(z.string()).optional(),
			documentLimit: z.number().int().min(1).max(10000).optional(),
			metadata: z
				.record(z.union([z.string(), z.number(), z.boolean()]))
				.optional()
				.nullable(),
			redirectUrl: z.string().optional(),
		}),
		output: z.object({
			authLink: z.string(),
			expiresIn: z.string(),
			id: z.string(),
			redirectsTo: z.string().optional(),
		}),
		params: z.object({
			provider: z.enum(["google-drive", "notion", "onedrive"]),
		}),
	},

	"@post/connections/list": {
		input: z.object({
			containerTags: z.array(z.string()).optional(),
		}),
		output: z.array(ConnectionResponseSchema),
	},

	"@get/connections": {
		output: z.array(ConnectionResponseSchema),
		query: z
			.object({
				endUserId: z.string().optional(),
			})
			.optional(),
	},

	// Connection operations
	"@get/connections/:connectionId": {
		output: ConnectionResponseSchema,
		params: z.object({ connectionId: z.string() }),
	},

	"@delete/connections/:connectionId": {
		output: z.object({
			id: z.string(),
			provider: z.string(),
		}),
		params: z.object({ connectionId: z.string() }),
	},

	// Settings operations
	"@get/settings": {
		output: z.object({ settings: z.object({}).passthrough() }),
	},
	"@patch/settings": {
		input: SettingsRequestSchema,
		output: SettingsResponseSchema,
	},
	// Memory operations
	"@post/documents": {
		input: MemoryAddSchema,
		output: MemoryResponseSchema,
	},
	"@post/documents/list": {
		body: z
			.object({
				limit: z.number().optional(),
				page: z.number().optional(),
				status: z.string().optional(),
				containerTags: z.array(z.string()).optional(),
			})
			.optional(),
		output: ListMemoriesResponseSchema,
	},
	"@post/documents/documents": {
		input: DocumentsWithMemoriesQuerySchema,
		output: DocumentsWithMemoriesResponseSchema,
	},
	"@post/documents/documents/by-ids": {
		input: z.object({
			ids: z.array(z.string()),
			by: z.enum(["id", "customId"]).optional(),
			containerTags: z.array(z.string()).optional(),
		}),
		output: DocumentsWithMemoriesResponseSchema,
	},
	"@post/documents/migrate-mcp": {
		input: MigrateMCPRequestSchema,
		output: MigrateMCPResponseSchema,
	},

	// Delete a memory
	"@delete/documents/:id": {
		output: z.any(), // 204 No-Content
		params: z.object({ id: z.string() }),
	},

	// Search operations
	"@post/search": {
		input: SearchRequestSchema,
		output: SearchResponseSchema,
	},

	// Project operations
	"@get/projects": {
		output: ListProjectsResponseSchema,
	},
	"@post/projects": {
		input: CreateProjectSchema,
		output: ProjectSchema,
	},
	"@patch/projects/:projectId": {
		input: UpdateProjectSchema,
		output: ProjectSchema,
		params: z.object({ projectId: z.string() }),
	},
	"@delete/projects/:projectId": {
		input: DeleteProjectSchema,
		output: DeleteProjectResponseSchema,
		params: z.object({
			projectId: z.string(),
		}),
	},

	// Waitlist operations
	"@get/waitlist/status": {
		output: WaitlistStatusResponseSchema,
	},
})

export const $fetch = createFetch({
	baseURL: `${BACKEND_URL.replace(/\/$/, "")}/v3`,
	credentials: "include",
	retry: {
		attempts: 3,
		delay: 100,
		type: "linear",
	},
	schema: apiSchema,
})

// Re-export types that might be used elsewhere
export type { SearchResult }
