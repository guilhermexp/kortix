import type {
	CreateManualConnection,
	DocumentConnection,
	DocumentConnectionWithDetails,
	FindSimilarDocuments,
	SimilarDocument,
} from "@repo/validation/document-connections"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface FindSimilarDocumentsOptions extends FindSimilarDocuments {
	orgId: string
}

export interface CreateManualConnectionOptions extends CreateManualConnection {
	orgId: string
	userId: string
}

export interface DeleteConnectionOptions {
	connectionId: string
	orgId: string
	userId?: string
}

export interface ListConnectionsOptions {
	documentId: string
	orgId: string
	connectionType?: "automatic" | "manual"
	limit?: number
}

/**
 * Find similar documents using vector similarity search
 * Calls the PostgreSQL find_similar_documents function
 */
export async function findSimilarDocuments(
	client: SupabaseClient,
	options: FindSimilarDocumentsOptions,
): Promise<SimilarDocument[]> {
	const { documentId, threshold = 0.7, limit = 10, orgId } = options

	// First verify the document exists and belongs to the organization
	const { data: sourceDoc, error: sourceError } = await client
		.from("documents")
		.select("id, org_id")
		.eq("id", documentId)
		.eq("org_id", orgId)
		.single()

	if (sourceError || !sourceDoc) {
		// Graceful fallback: related docs should not break the page when the source
		// document is missing/inaccessible in this context.
		return []
	}

	// Call the PostgreSQL function to find similar documents
	const { data, error } = await client.rpc("find_similar_documents", {
		p_document_id: documentId,
		p_similarity_threshold: threshold,
		p_limit: limit,
	})

	if (error) {
		console.error(
			"[document-similarity] Error finding similar documents:",
			error,
		)
		throw new Error(`Failed to find similar documents: ${error.message}`)
	}

	// Map database results to SimilarDocument schema
	const results: SimilarDocument[] = (data || []).map((row: any) => ({
		documentId: row.document_id,
		title: row.title,
		summary: row.summary,
		similarityScore: Number.parseFloat(row.similarity_score),
		spaceId: row.space_id,
		createdAt: row.created_at,
	}))

	return results
}

/**
 * Create a manual connection between two documents
 * Validates both documents exist and belong to the same organization
 */
export async function createManualConnection(
	client: SupabaseClient,
	options: CreateManualConnectionOptions,
): Promise<DocumentConnection> {
	const {
		sourceDocumentId,
		targetDocumentId,
		reason,
		metadata,
		orgId,
		userId,
	} = options

	// Validate both documents exist and belong to the organization
	const { data: documents, error: validateError } = await client
		.from("documents")
		.select("id, org_id")
		.in("id", [sourceDocumentId, targetDocumentId])
		.eq("org_id", orgId)

	if (validateError) {
		console.error(
			"[document-similarity] Error validating documents:",
			validateError,
		)
		throw new Error(`Failed to validate documents: ${validateError.message}`)
	}

	if (!documents || documents.length !== 2) {
		throw new Error("One or both documents not found or access denied")
	}

	// Check if connection already exists (in either direction)
	const { data: existingConnection } = await client
		.from("document_connections")
		.select("id")
		.or(
			`and(source_document_id.eq.${sourceDocumentId},target_document_id.eq.${targetDocumentId}),and(source_document_id.eq.${targetDocumentId},target_document_id.eq.${sourceDocumentId})`,
		)
		.single()

	if (existingConnection) {
		throw new Error("A connection between these documents already exists")
	}

	// Create the manual connection
	const { data: connection, error: createError } = await client
		.from("document_connections")
		.insert({
			source_document_id: sourceDocumentId,
			target_document_id: targetDocumentId,
			org_id: orgId,
			user_id: userId,
			connection_type: "manual",
			similarity_score: null,
			reason: reason || null,
			metadata: metadata || {},
		})
		.select()
		.single()

	if (createError || !connection) {
		console.error(
			"[document-similarity] Error creating manual connection:",
			createError,
		)
		throw new Error(
			`Failed to create connection: ${createError?.message || "Unknown error"}`,
		)
	}

	// Map database result to DocumentConnection schema
	return {
		id: connection.id,
		sourceDocumentId: connection.source_document_id,
		targetDocumentId: connection.target_document_id,
		orgId: connection.org_id,
		userId: connection.user_id,
		connectionType: connection.connection_type,
		similarityScore: connection.similarity_score
			? Number.parseFloat(connection.similarity_score)
			: null,
		reason: connection.reason,
		metadata: connection.metadata || {},
		createdAt: connection.created_at,
		updatedAt: connection.updated_at,
	}
}

/**
 * Delete a document connection
 * Only allows deletion of manual connections by their creator or automatic connections
 */
export async function deleteConnection(
	client: SupabaseClient,
	options: DeleteConnectionOptions,
): Promise<void> {
	const { connectionId, orgId, userId } = options

	// Get the connection to verify ownership and type
	const { data: connection, error: fetchError } = await client
		.from("document_connections")
		.select("id, org_id, connection_type, user_id")
		.eq("id", connectionId)
		.eq("org_id", orgId)
		.single()

	if (fetchError || !connection) {
		throw new Error("Connection not found or access denied")
	}

	// For manual connections, verify the user is the creator
	if (connection.connection_type === "manual" && userId) {
		if (connection.user_id !== userId) {
			throw new Error("You can only delete connections you created")
		}
	}

	// Delete the connection
	const { error: deleteError } = await client
		.from("document_connections")
		.delete()
		.eq("id", connectionId)

	if (deleteError) {
		console.error(
			"[document-similarity] Error deleting connection:",
			deleteError,
		)
		throw new Error(`Failed to delete connection: ${deleteError.message}`)
	}
}

/**
 * List all connections for a document
 * Returns connections with target document details
 */
export async function listConnections(
	client: SupabaseClient,
	options: ListConnectionsOptions,
): Promise<DocumentConnectionWithDetails[]> {
	const { documentId, orgId, connectionType, limit = 50 } = options

	// Verify the document exists and belongs to the organization
	const { data: sourceDoc, error: sourceError } = await client
		.from("documents")
		.select("id, org_id")
		.eq("id", documentId)
		.eq("org_id", orgId)
		.single()

	if (sourceError || !sourceDoc) {
		throw new Error("Document not found or access denied")
	}

	// Build query for connections (without relation join to avoid brittle FK-name coupling)
	let query = client
		.from("document_connections")
		.select(
			`
			id,
			source_document_id,
			target_document_id,
			org_id,
			user_id,
			connection_type,
			similarity_score,
			reason,
			metadata,
			created_at,
			updated_at
		`,
		)
		.eq("source_document_id", documentId)
		.eq("org_id", orgId)

	// Filter by connection type if specified
	if (connectionType) {
		query = query.eq("connection_type", connectionType)
	}

	// Order by similarity score (desc) for automatic, created_at (desc) for others
	query = query.order("similarity_score", { ascending: false })
	query = query.order("created_at", { ascending: false })
	query = query.limit(limit)

	const { data: connections, error: listError } = await query

	if (listError) {
		console.error("[document-similarity] Error listing connections:", listError)
		return []
	}

	const targetIds = Array.from(
		new Set(
			(connections || [])
				.map((conn: any) => conn.target_document_id)
				.filter(Boolean),
		),
	)

	let targetById = new Map<string, any>()
	if (targetIds.length > 0) {
		const { data: targetDocs, error: targetError } = await client
			.from("documents")
			.select("id, title, summary, type, url, created_at")
			.in("id", targetIds)
			.eq("org_id", orgId)

		if (targetError) {
			console.error(
				"[document-similarity] Error fetching target documents:",
				targetError,
			)
			// Keep base connection data even if enrichment query fails.
			targetById = new Map()
		}

		if (!targetError) {
			targetById = new Map((targetDocs || []).map((doc: any) => [doc.id, doc]))
		}
	}

	// Map database results to DocumentConnectionWithDetails schema
	const results: DocumentConnectionWithDetails[] = (connections || []).map(
		(conn: any) => {
			const targetDoc = targetById.get(conn.target_document_id)
			return {
				id: conn.id,
				sourceDocumentId: conn.source_document_id,
				targetDocumentId: conn.target_document_id,
				orgId: conn.org_id,
				userId: conn.user_id,
				connectionType: conn.connection_type,
				similarityScore: conn.similarity_score
					? Number.parseFloat(conn.similarity_score)
					: null,
				reason: conn.reason,
				metadata: conn.metadata || {},
				createdAt: conn.created_at,
				updatedAt: conn.updated_at,
				targetDocument: targetDoc
					? {
							id: targetDoc.id,
							title: targetDoc.title,
							summary: targetDoc.summary,
							type: targetDoc.type,
							url: targetDoc.url,
							createdAt: targetDoc.created_at,
						}
					: undefined,
			}
		},
	)

	return results
}

/**
 * Update automatic connections for a document
 * Creates or updates automatic connections based on similarity
 * This is typically called as a background job after document updates
 */
export async function updateAutomaticConnections(
	client: SupabaseClient,
	documentId: string,
	orgId: string,
	options: {
		threshold?: number
		limit?: number
	} = {},
): Promise<void> {
	const { threshold = 0.7, limit = 10 } = options

	// Find similar documents
	const similarDocs = await findSimilarDocuments(client, {
		documentId,
		threshold,
		limit,
		orgId,
	})

	// Delete existing automatic connections for this document
	const { error: deleteError } = await client
		.from("document_connections")
		.delete()
		.eq("source_document_id", documentId)
		.eq("connection_type", "automatic")

	if (deleteError) {
		console.warn(
			"[document-similarity] Error deleting old automatic connections:",
			deleteError,
		)
	}

	// Create new automatic connections
	if (similarDocs.length > 0) {
		const newConnections = similarDocs.map((doc) => ({
			source_document_id: documentId,
			target_document_id: doc.documentId,
			org_id: orgId,
			user_id: null,
			connection_type: "automatic" as const,
			similarity_score: doc.similarityScore,
			reason: `Automatically connected based on content similarity (${(doc.similarityScore * 100).toFixed(0)}% match)`,
			metadata: {
				auto_generated: true,
				similarity_threshold: threshold,
			},
		}))

		const { error: insertError } = await client
			.from("document_connections")
			.insert(newConnections)

		if (insertError) {
			console.error(
				"[document-similarity] Error creating automatic connections:",
				insertError,
			)
			// Don't throw - this is a background operation
		}
	}
}
