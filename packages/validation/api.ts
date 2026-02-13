import { z } from "zod"
import "zod-openapi"
import {
	MetadataSchema as BaseMetadataSchema,
	DocumentSchema,
	MemoryEntrySchema,
	OrganizationSettingsSchema,
} from "./schemas"

export * from "./canvas"

export const ConnectionResponseSchema = z.object({
	id: z.string(),
	provider: z.string(),
	email: z.string().optional(),
	documentLimit: z.number().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	expiresAt: z.string().optional(),
	createdAt: z.string(),
})

export const MetadataSchema = BaseMetadataSchema

export const SettingsRequestSchema = OrganizationSettingsSchema.pick({
	shouldLLMFilter: true,
	filterPrompt: true,
	includeItems: true,
	excludeItems: true,
	googleDriveCustomKeyEnabled: true,
	googleDriveClientId: true,
	googleDriveClientSecret: true,
	notionCustomKeyEnabled: true,
	notionClientId: true,
	notionClientSecret: true,
	onedriveCustomKeyEnabled: true,
	onedriveClientId: true,
	onedriveClientSecret: true,
}).partial()

export const ProjectSchema = z.object({
	id: z.string(),
	name: z.string().nullable().optional(),
	containerTag: z.string().nullable().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	isExperimental: z.boolean().default(false),
	documentCount: z.number().optional(),
})
export const CreateProjectSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	visibility: z.enum(["public", "private", "unlisted"]).optional(),
})
export const UpdateProjectSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
	visibility: z.enum(["public", "private", "unlisted"]).optional(),
	isExperimental: z.boolean().optional(),
})

export const DeleteProjectSchema = z
	.object({
		action: z.enum(["move", "delete"]),
		targetProjectId: z.string().optional(),
	})
	.refine(
		(data) => {
			if (data.action === "move") {
				return !!data.targetProjectId
			}
			return true
		},
		{
			message: "targetProjectId is required when action is 'move'",
		},
	)
export const DeleteProjectResponseSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	documentsAffected: z.number(),
	memoriesAffected: z.number(),
})

export const ListProjectsResponseSchema = z.object({
	projects: z.array(ProjectSchema),
})

export const SearchFiltersSchema = z
	.object({
		AND: z.array(z.unknown()).optional(),
		OR: z.array(z.unknown()).optional(),
	})
	.or(z.record(z.string(), z.unknown()))

const FiltersStringSchema = z
	.string()
	.transform((raw, ctx) => {
		const trimmed = raw.trim()
		if (trimmed.length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Filters string cannot be empty",
			})
			return z.NEVER
		}

		try {
			return JSON.parse(trimmed)
		} catch {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Filters must be valid JSON",
			})
			return z.NEVER
		}
	})
	.pipe(SearchFiltersSchema)

const FiltersParamSchema = z.union([SearchFiltersSchema, FiltersStringSchema])

const exampleMetadata: Record<string, string | number | boolean> = {
	category: "technology",
	isPublic: true,
	readingTime: 5,
	source: "web",
	tag_1: "ai",
	tag_2: "machine-learning",
} as const

const exampleMemory = {
	connectionId: "conn_123",
	containerTags: ["user_123", "project_123"] as const,
	content: "This is a detailed article about machine learning concepts...",
	createdAt: new Date().toISOString(),
	customId: "mem_abc123",
	id: "acxV5LHMEsG2hMSNb4umbn",
	metadata: exampleMetadata,
	ogImage: "https://example.com/image.jpg",
	raw: "This is a detailed article about machine learning concepts...",
	source: "web",
	status: "done",
	summary:
		"A comprehensive guide to understanding the basics of machine learning and its applications.",
	title: "Introduction to Machine Learning",
	tokenCount: 1000,
	type: "text",
	updatedAt: new Date().toISOString(),
	url: "https://example.com/article",
} as const

export const MemorySchema = z
	.object({
		id: z.string().meta({
			description: "Unique identifier of the memory.",
			example: "acxV5LHMEsG2hMSNb4umbn",
		}),
		customId: z.string().nullable().optional().meta({
			description:
				"Optional custom ID of the memory. This could be an ID from your database that will uniquely identify this memory.",
			example: "mem_abc123",
		}),
		connectionId: z.string().nullable().optional().meta({
			description:
				"Optional ID of connection the memory was created from. This is useful for identifying the source of the memory.",
			example: "conn_123",
		}),
		content: z
			.string()
			.nullable()
			.optional()
			.meta({
				description:
					"The content to extract and process into a memory. This can be a URL to a website, a PDF, an image, or a video. \n\nPlaintext: Any plaintext format\n\nURL: A URL to a website, PDF, image, or video\n\nWe automatically detect the content type from the url's response format.",
				examples: [
					"This is a detailed article about machine learning concepts...",
					"https://example.com/article",
					"https://youtube.com/watch?v=abc123",
					"https://example.com/audio.mp3",
					"https://aws-s3.com/bucket/file.pdf",
					"https://example.com/image.jpg",
				],
			}),
		metadata: MetadataSchema.nullable().optional().meta({
			description:
				"Optional metadata for the memory. This is used to store additional information about the memory. You can use this to store any additional information you need about the memory. Metadata can be filtered through. Keys must be strings and are case sensitive. Values can be strings, numbers, or booleans. You cannot nest objects.",
			example: exampleMetadata,
		}),
		source: z.string().nullable().optional().meta({
			description: "Source of the memory",
			example: "web",
		}),
		status: DocumentSchema.shape.status.meta({
			description: "Status of the memory",
			example: "done",
		}),
		summary: z.string().nullable().optional().meta({
			description: "Summary of the memory content",
			example:
				"A comprehensive guide to understanding the basics of machine learning and its applications.",
		}),
		title: z.string().nullable().optional().meta({
			description: "Title of the memory",
			example: "Introduction to Machine Learning",
		}),
		type: DocumentSchema.shape.type.meta({
			description: "Type of the memory",
			example: "text",
		}),
		url: z.string().nullable().optional().meta({
			description: "URL of the memory",
			example: "https://example.com/article",
		}),
		createdAt: z.string().meta({
			description: "Creation timestamp",
			example: new Date().toISOString(),
			format: "date-time",
		}),
		updatedAt: z.string().meta({
			description: "Last update timestamp",
			example: new Date().toISOString(),
			format: "date-time",
		}),
		containerTags: z
			.array(z.string())
			.optional()
			.readonly()
			.meta({
				description:
					"Optional tags this memory should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to group memories.",
				example: ["user_123", "project_123"] as const,
			}),
		chunkCount: z.number().default(0).meta({
			description: "Number of chunks in the memory",
			example: 10,
		}),
	})
	.meta({
		description: "Memory object",
		example: exampleMemory,
	})

export const MemoryUpdateSchema = z.object({
	containerTags: z
		.array(z.string())
		.optional()
		.meta({
			description:
				"Optional tags this memory should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to group memories.",
			example: ["user_123", "project_123"],
		}),
	content: z.string().optional().meta({
		description:
			"The content to extract and process into a memory. This can be a URL to a website, a PDF, an image, or a video. \n\nPlaintext: Any plaintext format\n\nURL: A URL to a website, PDF, image, or video\n\nWe automatically detect the content type from the url's response format.",
		example: "This is a detailed article about machine learning concepts...",
	}),
	customId: z.string().optional().meta({
		description:
			"Optional custom ID of the memory. This could be an ID from your database that will uniquely identify this memory.",
		example: "mem_abc123",
	}),
	metadata: MetadataSchema.optional().meta({
		description:
			"Optional metadata for the memory. This is used to store additional information about the memory. You can use this to store any additional information you need about the memory. Metadata can be filtered through. Keys must be strings and are case sensitive. Values can be strings, numbers, or booleans. You cannot nest objects.",
		example: exampleMetadata,
	}),
})

export const MemoryAddSchema = MemoryUpdateSchema

export const PaginationSchema = z
	.object({
		currentPage: z.number(),
		limit: z.number().max(1100).default(10),
		totalItems: z.number(),
		totalPages: z.number(),
	})
	.meta({
		description: "Pagination metadata",
		example: {
			currentPage: 1,
			limit: 10,
			totalItems: 100,
			totalPages: 10,
		},
	})

export const GetMemoryResponseSchema = MemorySchema

export const ListMemoriesResponseSchema = z
	.object({
		memories: z.array(
			MemorySchema.pick({
				connectionId: true,
				containerTags: true,
				createdAt: true,
				customId: true,
				id: true,
				metadata: true,
				status: true,
				summary: true,
				title: true,
				type: true,
				updatedAt: true,
			}),
		),
		pagination: PaginationSchema,
	})
	.meta({
		description: "List of memories",
		example: {
			memories: [
				{
					connectionId: exampleMemory.connectionId,
					containerTags: exampleMemory.containerTags,
					createdAt: exampleMemory.createdAt,
					customId: exampleMemory.customId,
					id: exampleMemory.id,
					metadata: exampleMemory.metadata,
					status: exampleMemory.status,
					summary: exampleMemory.summary,
					title: exampleMemory.title,
					type: exampleMemory.type,
					updatedAt: exampleMemory.updatedAt,
				},
			],
			pagination: {
				currentPage: 1,
				limit: 10,
				totalItems: 100,
				totalPages: 10,
			},
		},
	})

export const DocumentsWithMemoriesQuerySchema = z.object({
	page: z.number().optional().default(1),
	limit: z.number().optional().default(10),
	sort: z.enum(["createdAt", "updatedAt"]).optional().default("createdAt"),
	order: z.enum(["asc", "desc"]).optional().default("desc"),
	containerTags: z.array(z.string()).optional(),
	search: z.string().optional(),
	tagsFilter: z.array(z.string()).optional(),
	mentionsFilter: z.array(z.string()).optional(),
	propertiesFilter: z.record(z.string(), z.unknown()).optional(),
})

export const DocumentsWithMemoriesResponseSchema = z.object({
	documents: z.array(
		MemorySchema.extend({
			memoryEntries: z.array(
				z.object({
					id: z.string(),
					memory: z.string(),
					metadata: z.record(z.string(), z.unknown()).nullable().optional(),
					createdAt: z.string(),
					updatedAt: z.string(),
				}),
			),
		}),
	),
	pagination: PaginationSchema,
})

export const ListMemoriesQuerySchema = z
	.object({
		containerTags: z
			.array(z.string())
			.optional()
			.meta({
				description:
					"Optional tags this memory should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to group memories.",
				example: ["user_123", "project_123"],
			}),
		filters: FiltersParamSchema.optional().meta({
			description:
				"Optional filters to apply to the search. Accepts either a JSON object or a JSON string that conforms to the filters schema.",
			example: {
				AND: [
					{
						key: "group",
						negate: false,
						value: "jira_users",
					},
					{
						filterType: "numeric",
						key: "timestamp",
						negate: false,
						numericOperator: ">",
						value: "1742745777",
					},
				],
			},
		}),
		limit: z
			.string()
			.regex(/^\d+$/)
			.or(z.number())
			.default("10")
			.transform(Number)
			.refine((value) => value <= 1100, {
				message: "Limit cannot be greater than 1100",
			})
			.meta({
				description: "Number of items per page",
				example: "10",
			}),
		order: z
			.enum(["asc", "desc"])
			.default("desc")
			.meta({ description: "Sort order", example: "desc" }),
		page: z
			.string()
			.regex(/^\d+$/)
			.or(z.number())
			.default("1")
			.transform(Number)
			.meta({ description: "Page number to fetch", example: "1" }),
		sort: z
			.enum(["createdAt", "updatedAt"])
			.default("createdAt")
			.meta({ description: "Field to sort by", example: "createdAt" }),
	})
	.meta({
		description: "Query parameters for listing memories",
		example: {
			filters: {
				AND: [
					{
						key: "group",
						negate: false,
						value: "jira_users",
					},
					{
						filterType: "numeric",
						key: "timestamp",
						negate: false,
						numericOperator: ">",
						value: "1742745777",
					},
				],
			},
			limit: 10,
			order: "desc",
			page: 1,
			sort: "createdAt",
		},
	})

export const MemoryResponseSchema = z.object({
	id: z.string(),
	status: z.string(),
})

export const SearchRequestSchema = z.object({
	categoriesFilter: z
		.array(z.string())
		.optional()
		.meta({
			description: "Optional category filters",
			example: ["technology", "science"],
			items: {
				enum: ["technology", "science", "business", "health"],
			},
			deprecated: true,
		}),
	chunkThreshold: z
		.number()
		.optional()
		.default(0)
		.refine((v) => v === undefined || (v >= 0 && v <= 1), {
			message: "chunkThreshold must be between 0 and 1",
			params: {
				max: 1,
				min: 0,
			},
		})
		.transform(Number)
		.meta({
			description:
				"Threshold / sensitivity for chunk selection. 0 is least sensitive (returns most chunks, more results), 1 is most sensitive (returns lesser chunks, accurate results)",
			example: 0.5,
			maximum: 1,
			minimum: 0,
		}),
	containerTags: z
		.array(z.string())
		.optional()
		.meta({
			description:
				"Optional tags this search should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to filter memories.",
			example: ["user_123", "project_123"],
		}),
	scopedDocumentIds: z
		.array(z.string())
		.optional()
		.meta({
			description:
				"Optional array of document IDs to restrict search to specific documents. Useful for canvas-based chat where only selected documents should be searched.",
			example: ["doc_abc123", "doc_xyz789"],
		}),
	docId: z.string().max(255).optional().meta({
		description:
			"Optional document ID to search within. You can use this to find chunks in a very large document.",
		example: "doc_xyz789",
	}),
	documentThreshold: z
		.number()
		.optional()
		.default(0)
		.refine((v) => v === undefined || (v >= 0 && v <= 1), {
			message: "documentThreshold must be between 0 and 1",
			params: {
				max: 1,
				min: 0,
			},
		})
		.transform(Number)
		.meta({
			description:
				"Threshold / sensitivity for document selection. 0 is least sensitive (returns most documents, more results), 1 is most sensitive (returns lesser documents, accurate results)",
			example: 0.5,
			maximum: 1,
			minimum: 0,
		}),
	filters: FiltersParamSchema.optional().meta({
		description: "Optional filters to apply to the search",
		example: {
			AND: [
				{
					key: "group",
					negate: false,
					value: "jira_users",
				},
				{
					filterType: "numeric",
					key: "timestamp",
					negate: false,
					numericOperator: ">",
					value: "1742745777",
				},
			],
		},
	}),
	tagsFilter: z
		.array(z.string())
		.optional()
		.meta({
			description:
				"Optional filter by extracted tags (OR logic - matches if any tag is present). These are tags extracted from document metadata and content during processing.",
			example: ["ai", "research", "machine-learning"],
		}),
	mentionsFilter: z
		.array(z.string())
		.optional()
		.meta({
			description:
				"Optional filter by extracted @mentions (OR logic - matches if any mention is present). These are @mentions extracted from document content during processing.",
			example: ["@john", "@alice", "@project-alpha"],
		}),
	propertiesFilter: z
		.record(z.string(), z.unknown())
		.optional()
		.meta({
			description:
				"Optional filter by extracted properties (AND logic - all properties must match). Properties are key-value pairs extracted from document metadata during processing. Supports array values for OR logic on a single property.",
			example: {
				status: "active",
				priority: "high",
				category: ["tech", "science"],
			},
		}),
	includeFullDocs: z.boolean().optional().default(false).meta({
		description:
			"If true, include full document in the response. This is helpful if you want a chatbot to know the full context of the document. ",
		example: false,
	}),
	includeSummary: z.boolean().optional().default(false).meta({
		description:
			"If true, include document summary in the response. This is helpful if you want a chatbot to know the full context of the document. ",
		example: false,
	}),
	limit: z
		.number()
		.int()
		.positive()
		.optional()
		.default(10)
		.refine((v) => v === undefined || (v > 0 && v <= 100), {
			message: "limit must be between 1 and 100",
			params: {
				max: 100,
				min: 1,
			},
		})
		.meta({
			description: "Maximum number of results to return",
			example: 10,
			maximum: 100,
			minimum: 1,
		}),
	onlyMatchingChunks: z.boolean().optional().default(true).meta({
		description:
			"If true, only return matching chunks without context. Normally, we send the previous and next chunk to provide more context for LLMs. If you only want the matching chunk, set this to true.",
		example: false,
	}),
	q: z.string().min(1).meta({
		description: "Search query string",
		example: "machine learning concepts",
		minLength: 1,
	}),
	rerank: z.boolean().optional().default(false).meta({
		description:
			"If true, rerank the results based on the query. This is helpful if you want to ensure the most relevant results are returned.",
		example: false,
	}),
	rewriteQuery: z.boolean().optional().default(false).meta({
		description:
			"If true, rewrites the query to make it easier to find documents. This increases the latency by about 400ms",
		example: false,
	}),
})

export const Searchv4RequestSchema = z.object({
	containerTag: z.string().optional().meta({
		description:
			"Optional tag this search should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to filter memories.",
		example: "user_123",
	}),
	threshold: z
		.number()
		.optional()
		.default(0.6)
		.refine((v) => v === undefined || (v >= 0 && v <= 1), {
			message: "documentThreshold must be between 0 and 1",
			params: {
				max: 1,
				min: 0,
			},
		})
		.transform(Number)
		.meta({
			description:
				"Threshold / sensitivity for memories selection. 0 is least sensitive (returns most memories, more results), 1 is most sensitive (returns lesser memories, accurate results)",
			example: 0.5,
			maximum: 1,
			minimum: 0,
		}),
	filters: FiltersParamSchema.optional().meta({
		description: "Optional filters to apply to the search",
		example: {
			AND: [
				{
					key: "group",
					negate: false,
					value: "jira_users",
				},
				{
					filterType: "numeric",
					key: "timestamp",
					negate: false,
					numericOperator: ">",
					value: "1742745777",
				},
			],
		},
	}),
	include: z
		.object({
			documents: z.boolean().default(false),
			summaries: z.boolean().default(false),
			relatedMemories: z.boolean().default(false),
		})
		.optional()
		.default({
			documents: false,
			summaries: false,
			relatedMemories: false,
		}),
	limit: z
		.number()
		.int()
		.positive()
		.optional()
		.default(10)
		.refine((v) => v === undefined || (v > 0 && v <= 100), {
			message: "limit must be between 1 and 100",
			params: {
				max: 100,
				min: 1,
			},
		})
		.meta({
			description: "Maximum number of results to return",
			example: 10,
			maximum: 100,
			minimum: 1,
		}),
	q: z.string().min(1).meta({
		description: "Search query string",
		example: "machine learning concepts",
		minLength: 1,
	}),
	rerank: z.boolean().optional().default(false).meta({
		description:
			"If true, rerank the results based on the query. This is helpful if you want to ensure the most relevant results are returned.",
		example: false,
	}),
	rewriteQuery: z.boolean().optional().default(false).meta({
		description:
			"If true, rewrites the query to make it easier to find documents. This increases the latency by about 400ms",
		example: false,
	}),
})

export const SearchResultSchema = z.object({
	chunks: z
		.array(
			z
				.object({
					content: z.string().meta({
						description: "Content of the matching chunk",
						example:
							"Machine learning is a subset of artificial intelligence...",
					}),
					isRelevant: z.boolean().meta({
						description: "Whether this chunk is relevant to the query",
						example: true,
					}),
					score: z.number().meta({
						description: "Similarity score for this chunk",
						example: 0.85,
						maximum: 1,
						minimum: 0,
					}),
				})
				.meta({
					description: "Matching content chunk",
					example: {
						content:
							"Machine learning is a subset of artificial intelligence...",
						isRelevant: true,
						score: 0.85,
					},
				}),
		)
		.meta({
			description: "Matching content chunks from the document",
			example: [
				{
					content: "Machine learning is a subset of artificial intelligence...",
					isRelevant: true,
					score: 0.85,
				},
			],
		}),
	createdAt: z.coerce.date().meta({
		description: "Document creation date",
		example: new Date().toISOString(),
		format: "date-time",
	}),
	documentId: z.string().meta({
		description: "ID of the matching document",
		example: "doc_xyz789",
	}),
	metadata: z.record(z.string(), z.unknown()).nullable().meta({
		description: "Document metadata",
		example: exampleMetadata,
	}),
	score: z.number().meta({
		description: "Relevance score of the match",
		example: 0.95,
		maximum: 1,
		minimum: 0,
	}),
	summary: z.string().nullable().optional().meta({
		description: "Document summary",
		example:
			"A comprehensive guide to understanding the basics of machine learning and its applications.",
	}),
	content: z.string().nullable().optional().meta({
		description:
			"Full document content (only included when includeFullDocs=true)",
		example:
			"This is the complete content of the document about machine learning concepts...",
	}),
	title: z.string().nullable().meta({
		description: "Document title",
		example: "Introduction to Machine Learning",
	}),
	updatedAt: z.coerce.date().meta({
		description: "Document last update date",
		example: new Date().toISOString(),
		format: "date-time",
	}),
	type: z.string().nullable().meta({
		description: "Document type",
		example: "web",
	}),
})

export type SearchResult = z.infer<typeof SearchResultSchema>

export const SearchResponseSchema = z.object({
	results: z.array(SearchResultSchema),
	timing: z.number(),
	total: z.number(),
})

// V4 Memory Search Schemas
export const MemorySearchDocumentSchema = z.object({
	id: z.string().meta({
		description: "Document ID",
		example: "doc_xyz789",
	}),
	title: z.string().meta({
		description: "Document title",
		example: "Introduction to Machine Learning",
	}),
	type: z.string().meta({
		description: "Document type",
		example: "web",
	}),
	metadata: z.record(z.string(), z.unknown()).nullable().meta({
		description: "Document metadata",
		example: exampleMetadata,
	}),
	createdAt: z.coerce.date().meta({
		description: "Document creation date",
		format: "date-time",
	}),
	updatedAt: z.coerce.date().meta({
		description: "Document last update date",
		format: "date-time",
	}),
})

export const MemorySearchResult = z.object({
	id: z.string().meta({
		description: "Memory entry ID",
		example: "mem_abc123",
	}),
	memory: z.string().meta({
		description: "The memory content",
		example: "John prefers machine learning over traditional programming",
	}),
	metadata: z
		.record(z.string(), z.unknown())
		.nullable()
		.meta({
			description: "Memory metadata",
			example: { source: "conversation", confidence: 0.9 },
		}),
	updatedAt: z.coerce.date().meta({
		description: "Memory last update date",
		format: "date-time",
	}),
	similarity: z.number().meta({
		description: "Similarity score between the query and memory entry",
		example: 0.89,
		maximum: 1,
		minimum: 0,
	}),
	version: z.number().nullable().optional().meta({
		description: "Version number of this memory entry",
		example: 3,
	}),
	context: z
		.object({
			parents: z
				.array(
					z.object({
						relation: z.enum(["updates", "extends", "derives"]).meta({
							description:
								"Relation type between this memory and its parent/child",
							example: "updates",
						}),
						version: z.number().nullable().optional().meta({
							description:
								"Relative version distance from the primary memory (-1 for direct parent, -2 for grand-parent, etc.)",
							example: -1,
						}),
						memory: z.string().meta({
							description: "The contextual memory content",
							example:
								"Earlier version: Dhravya is working on a patent at Cloudflare.",
						}),
						metadata: z
							.record(z.string(), z.unknown())
							.nullable()
							.optional()
							.meta({
								description: "Contextual memory metadata",
							}),
						updatedAt: z.coerce.date().meta({
							description: "Contextual memory last update date",
							format: "date-time",
						}),
					}),
				)
				.optional(),
			children: z
				.array(
					z.object({
						relation: z.enum(["updates", "extends", "derives"]).meta({
							description:
								"Relation type between this memory and its parent/child",
							example: "updates",
						}),
						version: z.number().nullable().optional().meta({
							description:
								"Relative version distance from the primary memory (+1 for direct child, +2 for grand-child, etc.)",
							example: 1,
						}),
						memory: z.string().meta({
							description: "The contextual memory content",
							example:
								"Later version: Dhravya patent at Cloudflare was approved.",
						}),
						metadata: z
							.record(z.string(), z.unknown())
							.nullable()
							.optional()
							.meta({
								description: "Contextual memory metadata",
							}),
						updatedAt: z.coerce.date().meta({
							description: "Contextual memory last update date",
							format: "date-time",
						}),
					}),
				)
				.optional(),
		})
		.nullable()
		.optional(),
	sourceDocument: MemorySearchDocumentSchema.nullable().optional().meta({
		description: "The document that this memory was derived from",
	}),
})

export const MemorySearchResponseSchema = z.object({
	results: z.array(MemorySearchResult).meta({
		description: "List of matching memory entries",
	}),
	count: z.number().meta({
		description: "Total number of matching memory entries",
		example: 42,
	}),
})

// MCP Migration Schemas
export const MigrateMCPRequestSchema = z.object({
	targetUrl: z.string().url().meta({
		description: "The URL of the MCP server to migrate to",
		example: "https://mcp.example.com",
	}),
})

export const MigrateMCPResponseSchema = z.object({
	success: z.boolean().meta({
		description: "Whether the migration was initiated successfully",
		example: true,
	}),
	jobId: z.string().optional().meta({
		description: "ID of the background job handling the migration",
		example: "job_123",
	}),
})
