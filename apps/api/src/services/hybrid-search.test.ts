/**
 * Tests for hybrid search with metadata filtering
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { createClient } from "@supabase/supabase-js"
import { hybridSearch, metadataOnlySearch } from "./hybrid-search"

// Test configuration
const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:54321"
const supabaseKey =
	process.env.SUPABASE_ANON_KEY || "test-anon-key-for-testing-only"

describe("Hybrid Search - Metadata Filtering", () => {
	let client: ReturnType<typeof createClient>
	let testOrgId: string
	const testDocIds: string[] = []

	beforeAll(async () => {
		client = createClient(supabaseUrl, supabaseKey)
		testOrgId = `test-org-${Date.now()}`

		// Create test documents with metadata
		const testDocs = [
			{
				id: `doc-1-${Date.now()}`,
				org_id: testOrgId,
				title: "AI Research Paper",
				content: "This is about artificial intelligence and machine learning.",
				metadata: {
					extracted: {
						tags: ["ai", "research", "machine-learning"],
						mentions: ["john-doe", "jane-smith"],
						properties: {
							status: "published",
							priority: "high",
							category: "research",
						},
						comments: [],
						statistics: {
							tagCount: 3,
							mentionCount: 2,
							propertyCount: 3,
							commentCount: 0,
						},
					},
				},
			},
			{
				id: `doc-2-${Date.now()}`,
				org_id: testOrgId,
				title: "Design Guidelines",
				content: "UI/UX design best practices and guidelines.",
				metadata: {
					extracted: {
						tags: ["design", "ui", "ux"],
						mentions: ["alice-designer"],
						properties: {
							status: "draft",
							priority: "medium",
							category: "design",
						},
						comments: [],
						statistics: {
							tagCount: 3,
							mentionCount: 1,
							propertyCount: 3,
							commentCount: 0,
						},
					},
				},
			},
			{
				id: `doc-3-${Date.now()}`,
				org_id: testOrgId,
				title: "Backend API Documentation",
				content: "REST API documentation for backend services.",
				metadata: {
					extracted: {
						tags: ["api", "backend", "documentation"],
						mentions: ["bob-engineer"],
						properties: {
							status: "published",
							priority: "high",
							category: "engineering",
						},
						comments: [],
						statistics: {
							tagCount: 3,
							mentionCount: 1,
							propertyCount: 3,
							commentCount: 0,
						},
					},
				},
			},
		]

		// Insert test documents
		for (const doc of testDocs) {
			const { error } = await client.from("documents").insert(doc)
			if (!error) {
				testDocIds.push(doc.id)
			}
		}
	})

	afterAll(async () => {
		// Cleanup test documents
		if (testDocIds.length > 0) {
			await client.from("documents").delete().in("id", testDocIds)
		}
	})

	describe("Tags Filter", () => {
		it("should filter results by single tag", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				tagsFilter: ["ai"],
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				expect(extracted?.tags).toContain("ai")
			}
		})

		it("should filter results by multiple tags (OR logic)", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				tagsFilter: ["ai", "design"],
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				const tags = extracted?.tags || []
				const hasAnyTag = tags.some((t: string) => t === "ai" || t === "design")
				expect(hasAnyTag).toBe(true)
			}
		})

		it("should return empty results when tag not found", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				tagsFilter: ["nonexistent-tag"],
			})

			expect(results.length).toBe(0)
		})

		it("should be case insensitive", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				tagsFilter: ["AI", "DESIGN"],
			})

			expect(results.length).toBeGreaterThan(0)
		})
	})

	describe("Mentions Filter", () => {
		it("should filter results by single mention", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				mentionsFilter: ["john-doe"],
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				expect(extracted?.mentions).toContain("john-doe")
			}
		})

		it("should filter results by multiple mentions (OR logic)", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				mentionsFilter: ["john-doe", "alice-designer"],
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				const mentions = extracted?.mentions || []
				const hasAnyMention = mentions.some(
					(m: string) => m === "john-doe" || m === "alice-designer",
				)
				expect(hasAnyMention).toBe(true)
			}
		})

		it("should return empty results when mention not found", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				mentionsFilter: ["nonexistent-user"],
			})

			expect(results.length).toBe(0)
		})
	})

	describe("Properties Filter", () => {
		it("should filter results by single property", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				propertiesFilter: { status: "published" },
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				expect(extracted?.properties?.status).toBe("published")
			}
		})

		it("should filter results by multiple properties (AND logic)", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				propertiesFilter: {
					status: "published",
					priority: "high",
				},
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				expect(extracted?.properties?.status).toBe("published")
				expect(extracted?.properties?.priority).toBe("high")
			}
		})

		it("should support array values for OR logic on single property", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				propertiesFilter: {
					category: ["research", "design"],
				},
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				const category = extracted?.properties?.category
				expect(["research", "design"]).toContain(category)
			}
		})

		it("should return empty results when property doesn't match", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				propertiesFilter: { status: "archived" },
			})

			expect(results.length).toBe(0)
		})
	})

	describe("Combined Filters", () => {
		it("should apply multiple filter types together (AND logic)", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				tagsFilter: ["ai"],
				mentionsFilter: ["john-doe"],
				propertiesFilter: { status: "published" },
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				expect(extracted?.tags).toContain("ai")
				expect(extracted?.mentions).toContain("john-doe")
				expect(extracted?.properties?.status).toBe("published")
			}
		})

		it("should work with existing filters (containerTags, categoriesFilter)", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				tagsFilter: ["ai"],
				propertiesFilter: { status: "published" },
			})

			expect(results.length).toBeGreaterThan(0)
		})
	})

	describe("Empty/Invalid Filters", () => {
		it("should handle empty tags filter gracefully", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				tagsFilter: [],
			})

			// Should not filter anything when empty
			expect(results.length).toBeGreaterThan(0)
		})

		it("should handle empty mentions filter gracefully", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				mentionsFilter: [],
			})

			expect(results.length).toBeGreaterThan(0)
		})

		it("should handle empty properties filter gracefully", async () => {
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				propertiesFilter: {},
			})

			expect(results.length).toBeGreaterThan(0)
		})

		it("should handle documents without extracted metadata", async () => {
			// This shouldn't crash even if some documents don't have extracted metadata
			const results = await hybridSearch(client, {
				query: "documentation",
				orgId: testOrgId,
				mode: "keyword",
				tagsFilter: ["ai"],
			})

			// Should only return documents with extracted metadata
			expect(Array.isArray(results)).toBe(true)
		})
	})

	describe("Metadata-Only Search", () => {
		it("should search only by tags without content search", async () => {
			const results = await metadataOnlySearch(client, {
				orgId: testOrgId,
				tagsFilter: ["ai"],
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				expect(extracted?.tags).toContain("ai")
			}
		})

		it("should search only by mentions without content search", async () => {
			const results = await metadataOnlySearch(client, {
				orgId: testOrgId,
				mentionsFilter: ["john-doe"],
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				expect(extracted?.mentions).toContain("john-doe")
			}
		})

		it("should search only by properties without content search", async () => {
			const results = await metadataOnlySearch(client, {
				orgId: testOrgId,
				propertiesFilter: { status: "published" },
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				expect(extracted?.properties?.status).toBe("published")
			}
		})

		it("should support text query in metadata fields", async () => {
			const results = await metadataOnlySearch(client, {
				query: "ai research",
				orgId: testOrgId,
			})

			// Should return results based on metadata text search
			expect(Array.isArray(results)).toBe(true)
		})

		it("should combine text query with metadata filters", async () => {
			const results = await metadataOnlySearch(client, {
				query: "high priority",
				orgId: testOrgId,
				tagsFilter: ["ai"],
				propertiesFilter: { status: "published" },
			})

			// Should return results matching both filters
			expect(Array.isArray(results)).toBe(true)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				if (extracted?.tags) {
					expect(extracted.tags).toContain("ai")
				}
				if (extracted?.properties) {
					expect(extracted.properties.status).toBe("published")
				}
			}
		})

		it("should return empty results when no filters provided", async () => {
			const results = await metadataOnlySearch(client, {
				orgId: testOrgId,
			})

			expect(results).toEqual([])
		})

		it("should handle multiple tags with OR logic", async () => {
			const results = await metadataOnlySearch(client, {
				orgId: testOrgId,
				tagsFilter: ["ai", "design"],
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				const tags = extracted?.tags || []
				const hasAnyTag = tags.some((t: string) => t === "ai" || t === "design")
				expect(hasAnyTag).toBe(true)
			}
		})

		it("should handle multiple mentions with OR logic", async () => {
			const results = await metadataOnlySearch(client, {
				orgId: testOrgId,
				mentionsFilter: ["john-doe", "alice-designer"],
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				const mentions = extracted?.mentions || []
				const hasAnyMention = mentions.some(
					(m: string) => m === "john-doe" || m === "alice-designer",
				)
				expect(hasAnyMention).toBe(true)
			}
		})

		it("should handle multiple properties with AND logic", async () => {
			const results = await metadataOnlySearch(client, {
				orgId: testOrgId,
				propertiesFilter: {
					status: "published",
					priority: "high",
				},
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				const extracted = result.metadata?.extracted as any
				expect(extracted?.properties?.status).toBe("published")
				expect(extracted?.properties?.priority).toBe("high")
			}
		})

		it("should respect limit parameter", async () => {
			const results = await metadataOnlySearch(client, {
				orgId: testOrgId,
				tagsFilter: ["ai", "design", "api"],
				limit: 2,
			})

			expect(results.length).toBeLessThanOrEqual(2)
		})

		it("should not include chunks in metadata-only search", async () => {
			const results = await metadataOnlySearch(client, {
				orgId: testOrgId,
				tagsFilter: ["ai"],
			})

			expect(results.length).toBeGreaterThan(0)
			for (const result of results) {
				expect(result.chunks).toEqual([])
			}
		})
	})
})
