import type { SupabaseClient } from "@supabase/supabase-js"
import {
	CreateManualConnectionSchema,
	FindSimilarDocumentsSchema,
	ListConnectionsQuerySchema,
} from "@repo/validation/document-connections"
import type {
	CreateManualConnection,
	DocumentConnection,
	DocumentConnectionWithDetails,
	FindSimilarDocuments,
	SimilarDocument,
} from "@repo/validation/document-connections"
import * as documentSimilarityService from "../services/document-similarity"

export type FindSimilarDocumentsInput = FindSimilarDocuments

export async function findSimilarDocuments(
	client: SupabaseClient,
	{
		organizationId,
		payload,
	}: {
		organizationId: string
		payload: FindSimilarDocumentsInput
	},
): Promise<{ documents: SimilarDocument[]; total: number }> {
	const parsed = FindSimilarDocumentsSchema.parse(payload)

	const documents = await documentSimilarityService.findSimilarDocuments(
		client,
		{
			documentId: parsed.documentId,
			threshold: parsed.threshold,
			limit: parsed.limit,
			orgId: organizationId,
		},
	)

	return {
		documents,
		total: documents.length,
	}
}

export async function listConnections(
	client: SupabaseClient,
	{
		organizationId,
		documentId,
		connectionType,
		limit,
	}: {
		organizationId: string
		documentId: string
		connectionType?: "automatic" | "manual"
		limit?: number
	},
): Promise<{ connections: DocumentConnectionWithDetails[]; total: number }> {
	const parsed = ListConnectionsQuerySchema.parse({
		documentId,
		connectionType,
		limit,
	})

	const connections = await documentSimilarityService.listConnections(client, {
		documentId: parsed.documentId,
		orgId: organizationId,
		connectionType: parsed.connectionType,
		limit: parsed.limit,
	})

	return {
		connections,
		total: connections.length,
	}
}

export async function createConnection(
	client: SupabaseClient,
	{
		organizationId,
		userId,
		payload,
	}: {
		organizationId: string
		userId: string
		payload: CreateManualConnection
	},
): Promise<{ connection: DocumentConnection; message: string }> {
	const parsed = CreateManualConnectionSchema.parse(payload)

	const connection = await documentSimilarityService.createManualConnection(
		client,
		{
			sourceDocumentId: parsed.sourceDocumentId,
			targetDocumentId: parsed.targetDocumentId,
			reason: parsed.reason,
			metadata: parsed.metadata,
			orgId: organizationId,
			userId,
		},
	)

	return {
		connection,
		message: "Manual connection created successfully",
	}
}

export async function deleteConnection(
	client: SupabaseClient,
	{
		organizationId,
		userId,
		connectionId,
	}: {
		organizationId: string
		userId: string
		connectionId: string
	},
): Promise<{ success: boolean; message: string }> {
	await documentSimilarityService.deleteConnection(client, {
		connectionId,
		orgId: organizationId,
		userId,
	})

	return {
		success: true,
		message: "Connection deleted successfully",
	}
}
