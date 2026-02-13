import { describe, expect, it, vi } from "bun:test"
import type { Database } from "@repo/database"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
	createManualConnection,
	deleteConnection,
	findSimilarDocuments,
	listConnections,
} from "../../services/document-similarity"

describe("Document Connections Integration Tests", () => {
	const mockOrgId = "org-test-123"
	const mockUserId = "user-test-456"

	it("finds similar documents and maps RPC payload", async () => {
		const sourceDocumentId = "doc-123"
		const mockSupabase = {
			from: vi.fn().mockImplementation((table: string) => {
				if (table !== "documents") throw new Error("Unexpected table")
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								single: async () => ({
									data: { id: sourceDocumentId, org_id: mockOrgId },
									error: null,
								}),
							}),
						}),
					}),
				}
			}),
			rpc: vi.fn().mockResolvedValue({
				data: [
					{
						document_id: "doc-456",
						title: "Related Document 1",
						summary: "A related document",
						similarity_score: "0.85",
						space_id: "space-1",
						created_at: "2026-01-01T00:00:00.000Z",
					},
				],
				error: null,
			}),
		} as unknown as SupabaseClient<Database>

		const result = await findSimilarDocuments(mockSupabase, {
			documentId: sourceDocumentId,
			orgId: mockOrgId,
			threshold: 0.7,
			limit: 10,
		})

		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({
			documentId: "doc-456",
			title: "Related Document 1",
			summary: "A related document",
			similarityScore: 0.85,
			spaceId: "space-1",
			createdAt: "2026-01-01T00:00:00.000Z",
		})
		expect((mockSupabase.rpc as any)).toHaveBeenCalledWith(
			"find_similar_documents",
			{
				p_document_id: sourceDocumentId,
				p_similarity_threshold: 0.7,
				p_limit: 10,
			},
		)
	})

	it("returns empty list when source document is inaccessible", async () => {
		const mockSupabase = {
			from: vi.fn().mockImplementation(() => ({
				select: () => ({
					eq: () => ({
						eq: () => ({
							single: async () => ({
								data: null,
								error: { message: "not found" },
							}),
						}),
					}),
				}),
			})),
			rpc: vi.fn(),
		} as unknown as SupabaseClient<Database>

		const result = await findSimilarDocuments(mockSupabase, {
			documentId: "doc-missing",
			orgId: mockOrgId,
		})

		expect(result).toEqual([])
		expect((mockSupabase.rpc as any)).not.toHaveBeenCalled()
	})

	it("creates manual connection with valid documents", async () => {
		let connectionTableCalls = 0
		const mockSupabase = {
			from: vi.fn().mockImplementation((table: string) => {
				if (table === "documents") {
					return {
						select: () => ({
							in: () => ({
								eq: async () => ({
									data: [
										{ id: "doc-source", org_id: mockOrgId },
										{ id: "doc-target", org_id: mockOrgId },
									],
									error: null,
								}),
							}),
						}),
					}
				}

				if (table === "document_connections") {
					connectionTableCalls += 1
					if (connectionTableCalls === 1) {
						return {
							select: () => ({
								or: () => ({
									single: async () => ({
										data: null,
										error: { message: "no rows" },
									}),
								}),
							}),
						}
					}

					return {
						insert: () => ({
							select: () => ({
								single: async () => ({
									data: {
										id: "conn-123",
										source_document_id: "doc-source",
										target_document_id: "doc-target",
										org_id: mockOrgId,
										user_id: mockUserId,
										connection_type: "manual",
										similarity_score: null,
										reason: "User linked",
										metadata: {},
										created_at: "2026-01-01T00:00:00.000Z",
										updated_at: "2026-01-01T00:00:00.000Z",
									},
									error: null,
								}),
							}),
						}),
					}
				}

				throw new Error(`Unexpected table: ${table}`)
			}),
		} as unknown as SupabaseClient<Database>

		const result = await createManualConnection(mockSupabase, {
			sourceDocumentId: "doc-source",
			targetDocumentId: "doc-target",
			orgId: mockOrgId,
			userId: mockUserId,
			reason: "User linked",
		})

		expect(result.connectionType).toBe("manual")
		expect(result.sourceDocumentId).toBe("doc-source")
		expect(result.targetDocumentId).toBe("doc-target")
		expect(result.reason).toBe("User linked")
	})

	it("prevents duplicate manual connections", async () => {
		let connectionTableCalls = 0
		const mockSupabase = {
			from: vi.fn().mockImplementation((table: string) => {
				if (table === "documents") {
					return {
						select: () => ({
							in: () => ({
								eq: async () => ({
									data: [
										{ id: "doc-source", org_id: mockOrgId },
										{ id: "doc-target", org_id: mockOrgId },
									],
									error: null,
								}),
							}),
						}),
					}
				}

				if (table === "document_connections") {
					connectionTableCalls += 1
					if (connectionTableCalls === 1) {
						return {
							select: () => ({
								or: () => ({
									single: async () => ({
										data: { id: "conn-existing" },
										error: null,
									}),
								}),
							}),
						}
					}
					return {}
				}

				throw new Error(`Unexpected table: ${table}`)
			}),
		} as unknown as SupabaseClient<Database>

		await expect(
			createManualConnection(mockSupabase, {
				sourceDocumentId: "doc-source",
				targetDocumentId: "doc-target",
				orgId: mockOrgId,
				userId: mockUserId,
			}),
		).rejects.toThrow("already exists")
	})

	it("deletes manual connection owned by user", async () => {
		let connectionTableCalls = 0
		const eqDelete = vi.fn().mockResolvedValue({ error: null })
		const mockSupabase = {
			from: vi.fn().mockImplementation((table: string) => {
				if (table !== "document_connections") {
					throw new Error(`Unexpected table: ${table}`)
				}

				connectionTableCalls += 1
				if (connectionTableCalls === 1) {
					return {
						select: () => ({
							eq: () => ({
								eq: () => ({
									single: async () => ({
										data: {
											id: "conn-123",
											org_id: mockOrgId,
											connection_type: "manual",
											user_id: mockUserId,
										},
										error: null,
									}),
								}),
							}),
						}),
					}
				}

				return {
					delete: () => ({
						eq: eqDelete,
					}),
				}
			}),
		} as unknown as SupabaseClient<Database>

		await deleteConnection(mockSupabase, {
			connectionId: "conn-123",
			orgId: mockOrgId,
			userId: mockUserId,
		})

		expect(eqDelete).toHaveBeenCalledWith("id", "conn-123")
	})

	it("lists and enriches connections for a document", async () => {
		let documentsCalls = 0
		const mockSupabase = {
			from: vi.fn().mockImplementation((table: string) => {
				if (table === "documents") {
					documentsCalls += 1
					if (documentsCalls === 1) {
						return {
							select: () => ({
								eq: () => ({
									eq: () => ({
										single: async () => ({
											data: { id: "doc-123", org_id: mockOrgId },
											error: null,
										}),
									}),
								}),
							}),
						}
					}

					return {
						select: () => ({
							in: () => ({
								eq: async () => ({
									data: [
										{
											id: "doc-456",
											title: "Target 1",
											summary: "Summary 1",
											type: "text",
											url: null,
											created_at: "2026-01-01T00:00:00.000Z",
										},
									],
									error: null,
								}),
							}),
						}),
					}
				}

				if (table === "document_connections") {
					const query: any = {
						select: () => query,
						eq: () => query,
						order: () => query,
						limit: async () => ({
							data: [
								{
									id: "conn-1",
									source_document_id: "doc-123",
									target_document_id: "doc-456",
									org_id: mockOrgId,
									user_id: null,
									connection_type: "automatic",
									similarity_score: "0.83",
									reason: "Auto",
									metadata: {},
									created_at: "2026-01-01T00:00:00.000Z",
									updated_at: "2026-01-01T00:00:00.000Z",
								},
							],
							error: null,
						}),
					}
					return query
				}

				throw new Error(`Unexpected table: ${table}`)
			}),
		} as unknown as SupabaseClient<Database>

		const result = await listConnections(mockSupabase, {
			documentId: "doc-123",
			orgId: mockOrgId,
		})

		expect(result).toHaveLength(1)
		expect(result[0].connectionType).toBe("automatic")
		expect(result[0].similarityScore).toBe(0.83)
		expect(result[0].targetDocument?.id).toBe("doc-456")
		expect(result[0].targetDocument?.title).toBe("Target 1")
	})
})
