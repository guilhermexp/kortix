import { z } from "zod"
import "zod-openapi"

// Connection type enum matching database constraint
export const ConnectionTypeEnum = z.enum(["automatic", "manual"])
export type ConnectionType = z.infer<typeof ConnectionTypeEnum>

// Base document connection schema matching database table structure
export const DocumentConnectionSchema = z
	.object({
		id: z.string().uuid().meta({
			description: "Unique identifier of the connection",
			example: "550e8400-e29b-41d4-a716-446655440000",
		}),
		sourceDocumentId: z.string().uuid().meta({
			description: "The document from which the connection originates",
			example: "acxV5LHMEsG2hMSNb4umbn",
		}),
		targetDocumentId: z.string().uuid().meta({
			description: "The document to which the connection points",
			example: "bxcV5LHMEsG2hMSNb4umbn",
		}),
		orgId: z.string().uuid().meta({
			description: "Organization ID that owns this connection",
			example: "org_abc123",
		}),
		userId: z.string().uuid().nullable().optional().meta({
			description:
				"User who created the manual connection, NULL for automatic connections",
			example: "user_abc123",
		}),
		connectionType: ConnectionTypeEnum.meta({
			description:
				"Type of connection: automatic (AI-detected similarity) or manual (user-created)",
			example: "automatic",
		}),
		similarityScore: z
			.number()
			.min(0)
			.max(1)
			.nullable()
			.optional()
			.meta({
				description:
					"Cosine similarity score (0-1) for automatic connections, NULL for manual",
				example: 0.87,
				minimum: 0,
				maximum: 1,
			}),
		reason: z.string().nullable().optional().meta({
			description:
				"Explanation of why documents are connected (AI-generated for automatic, user-provided for manual)",
			example:
				"Both documents discuss machine learning concepts and neural networks",
		}),
		metadata: z.record(z.string(), z.unknown()).nullable().optional().meta({
			description:
				"Additional connection metadata (topics, keywords, etc)",
			example: { topics: ["ai", "machine-learning"], confidence: 0.9 },
		}),
		createdAt: z.string().datetime().meta({
			description: "Creation timestamp",
			example: new Date().toISOString(),
			format: "date-time",
		}),
		updatedAt: z.string().datetime().meta({
			description: "Last update timestamp",
			example: new Date().toISOString(),
			format: "date-time",
		}),
	})
	.meta({
		description:
			"Document connection object representing a relationship between two documents",
		example: {
			id: "550e8400-e29b-41d4-a716-446655440000",
			sourceDocumentId: "acxV5LHMEsG2hMSNb4umbn",
			targetDocumentId: "bxcV5LHMEsG2hMSNb4umbn",
			orgId: "org_abc123",
			userId: null,
			connectionType: "automatic",
			similarityScore: 0.87,
			reason:
				"Both documents discuss machine learning concepts and neural networks",
			metadata: { topics: ["ai", "machine-learning"] },
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	})

export type DocumentConnection = z.infer<typeof DocumentConnectionSchema>

// Find similar documents input schema
export const FindSimilarDocumentsSchema = z
	.object({
		documentId: z.string().uuid().meta({
			description: "The document ID to find similar documents for",
			example: "acxV5LHMEsG2hMSNb4umbn",
		}),
		threshold: z
			.number()
			.min(0)
			.max(1)
			.optional()
			.default(0.7)
			.meta({
				description:
					"Minimum similarity score threshold (0-1). Higher values return fewer, more similar documents",
				example: 0.7,
				minimum: 0,
				maximum: 1,
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
				description: "Maximum number of similar documents to return",
				example: 10,
				maximum: 100,
				minimum: 1,
			}),
	})
	.meta({
		description: "Parameters for finding similar documents",
		example: {
			documentId: "acxV5LHMEsG2hMSNb4umbn",
			threshold: 0.7,
			limit: 10,
		},
	})

export type FindSimilarDocuments = z.infer<typeof FindSimilarDocumentsSchema>

// Similar document result (from PostgreSQL function)
export const SimilarDocumentSchema = z
	.object({
		documentId: z.string().uuid().meta({
			description: "ID of the similar document",
			example: "bxcV5LHMEsG2hMSNb4umbn",
		}),
		title: z.string().nullable().optional().meta({
			description: "Document title",
			example: "Introduction to Neural Networks",
		}),
		summary: z.string().nullable().optional().meta({
			description: "Document summary",
			example:
				"A comprehensive guide to understanding neural networks and deep learning",
		}),
		similarityScore: z.number().min(0).max(1).meta({
			description: "Cosine similarity score (0-1)",
			example: 0.87,
			minimum: 0,
			maximum: 1,
		}),
		spaceId: z.string().uuid().nullable().optional().meta({
			description: "Space/project ID the document belongs to",
			example: "space_abc123",
		}),
		createdAt: z.string().datetime().meta({
			description: "Document creation timestamp",
			example: new Date().toISOString(),
			format: "date-time",
		}),
	})
	.meta({
		description: "Similar document with similarity score",
		example: {
			documentId: "bxcV5LHMEsG2hMSNb4umbn",
			title: "Introduction to Neural Networks",
			summary:
				"A comprehensive guide to understanding neural networks and deep learning",
			similarityScore: 0.87,
			spaceId: "space_abc123",
			createdAt: new Date().toISOString(),
		},
	})

export type SimilarDocument = z.infer<typeof SimilarDocumentSchema>

// Find similar documents response
export const FindSimilarDocumentsResponseSchema = z
	.object({
		documents: z.array(SimilarDocumentSchema).meta({
			description: "Array of similar documents with similarity scores",
		}),
		total: z.number().meta({
			description: "Total number of similar documents found",
			example: 5,
		}),
	})
	.meta({
		description: "Response containing similar documents",
		example: {
			documents: [
				{
					documentId: "bxcV5LHMEsG2hMSNb4umbn",
					title: "Introduction to Neural Networks",
					summary:
						"A comprehensive guide to understanding neural networks and deep learning",
					similarityScore: 0.87,
					spaceId: "space_abc123",
					createdAt: new Date().toISOString(),
				},
			],
			total: 5,
		},
	})

export type FindSimilarDocumentsResponse = z.infer<
	typeof FindSimilarDocumentsResponseSchema
>

// Create manual connection input schema
export const CreateManualConnectionSchema = z
	.object({
		sourceDocumentId: z.string().uuid().meta({
			description: "The document from which the connection originates",
			example: "acxV5LHMEsG2hMSNb4umbn",
		}),
		targetDocumentId: z.string().uuid().meta({
			description: "The document to which the connection points",
			example: "bxcV5LHMEsG2hMSNb4umbn",
		}),
		reason: z.string().min(1).max(500).optional().meta({
			description:
				"User-provided explanation of why these documents are connected",
			example:
				"These documents are related to the same research project",
			minLength: 1,
			maxLength: 500,
		}),
		metadata: z.record(z.string(), z.unknown()).optional().meta({
			description: "Optional additional metadata for the connection",
			example: { project: "research_2024", category: "references" },
		}),
	})
	.refine(
		(data) => data.sourceDocumentId !== data.targetDocumentId,
		{
			message: "Source and target documents must be different",
			path: ["targetDocumentId"],
		},
	)
	.meta({
		description:
			"Parameters for creating a manual connection between documents",
		example: {
			sourceDocumentId: "acxV5LHMEsG2hMSNb4umbn",
			targetDocumentId: "bxcV5LHMEsG2hMSNb4umbn",
			reason: "These documents are related to the same research project",
			metadata: { project: "research_2024" },
		},
	})

export type CreateManualConnection = z.infer<
	typeof CreateManualConnectionSchema
>

// List document connections query parameters
export const ListConnectionsQuerySchema = z
	.object({
		documentId: z.string().uuid().meta({
			description: "The document ID to list connections for",
			example: "acxV5LHMEsG2hMSNb4umbn",
		}),
		connectionType: ConnectionTypeEnum.optional().meta({
			description:
				"Optional filter by connection type (automatic or manual)",
			example: "automatic",
		}),
		limit: z
			.number()
			.int()
			.positive()
			.optional()
			.default(50)
			.refine((v) => v === undefined || (v > 0 && v <= 100), {
				message: "limit must be between 1 and 100",
				params: {
					max: 100,
					min: 1,
				},
			})
			.meta({
				description: "Maximum number of connections to return",
				example: 50,
				maximum: 100,
				minimum: 1,
			}),
	})
	.meta({
		description: "Query parameters for listing document connections",
		example: {
			documentId: "acxV5LHMEsG2hMSNb4umbn",
			connectionType: "automatic",
			limit: 50,
		},
	})

export type ListConnectionsQuery = z.infer<typeof ListConnectionsQuerySchema>

// Document connection with target document details
export const DocumentConnectionWithDetailsSchema = DocumentConnectionSchema.extend(
	{
		targetDocument: z
			.object({
				id: z.string().uuid(),
				title: z.string().nullable().optional(),
				summary: z.string().nullable().optional(),
				type: z.string().nullable().optional(),
				url: z.string().nullable().optional(),
				createdAt: z.string().datetime(),
			})
			.optional()
			.meta({
				description: "Target document details",
			}),
	},
).meta({
	description: "Document connection with detailed target document information",
})

export type DocumentConnectionWithDetails = z.infer<
	typeof DocumentConnectionWithDetailsSchema
>

// List connections response
export const ListConnectionsResponseSchema = z
	.object({
		connections: z.array(DocumentConnectionWithDetailsSchema).meta({
			description: "Array of document connections",
		}),
		total: z.number().meta({
			description: "Total number of connections",
			example: 10,
		}),
	})
	.meta({
		description: "Response containing list of document connections",
		example: {
			connections: [
				{
					id: "550e8400-e29b-41d4-a716-446655440000",
					sourceDocumentId: "acxV5LHMEsG2hMSNb4umbn",
					targetDocumentId: "bxcV5LHMEsG2hMSNb4umbn",
					orgId: "org_abc123",
					userId: null,
					connectionType: "automatic",
					similarityScore: 0.87,
					reason:
						"Both documents discuss machine learning concepts",
					metadata: { topics: ["ai", "machine-learning"] },
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					targetDocument: {
						id: "bxcV5LHMEsG2hMSNb4umbn",
						title: "Introduction to Neural Networks",
						summary: "A guide to neural networks",
						type: "text",
						url: null,
						createdAt: new Date().toISOString(),
					},
				},
			],
			total: 10,
		},
	})

export type ListConnectionsResponse = z.infer<
	typeof ListConnectionsResponseSchema
>

// Delete connection response
export const DeleteConnectionResponseSchema = z
	.object({
		success: z.boolean().meta({
			description: "Whether the deletion was successful",
			example: true,
		}),
		message: z.string().meta({
			description: "Status message",
			example: "Connection deleted successfully",
		}),
	})
	.meta({
		description: "Response for connection deletion",
		example: {
			success: true,
			message: "Connection deleted successfully",
		},
	})

export type DeleteConnectionResponse = z.infer<
	typeof DeleteConnectionResponseSchema
>

// Create connection response
export const CreateConnectionResponseSchema = z
	.object({
		connection: DocumentConnectionSchema.meta({
			description: "The newly created connection",
		}),
		message: z.string().meta({
			description: "Status message",
			example: "Manual connection created successfully",
		}),
	})
	.meta({
		description: "Response for connection creation",
		example: {
			connection: {
				id: "550e8400-e29b-41d4-a716-446655440000",
				sourceDocumentId: "acxV5LHMEsG2hMSNb4umbn",
				targetDocumentId: "bxcV5LHMEsG2hMSNb4umbn",
				orgId: "org_abc123",
				userId: "user_abc123",
				connectionType: "manual",
				similarityScore: null,
				reason: "These documents are related to the same research project",
				metadata: { project: "research_2024" },
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			message: "Manual connection created successfully",
		},
	})

export type CreateConnectionResponse = z.infer<
	typeof CreateConnectionResponseSchema
>
