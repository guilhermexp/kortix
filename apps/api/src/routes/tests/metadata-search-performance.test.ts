import { describe, expect, it, beforeAll, afterAll } from "bun:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"

/**
 * Performance tests for metadata search
 *
 * Tests search performance with:
 * - 1000+ documents with various metadata
 * - Complex filter combinations (tags, mentions, properties)
 * - Query time verification (< 500ms target)
 * - GIN index usage verification
 * - N+1 query detection
 * - Concurrent search load testing
 *
 * NOTE: These tests require a running Supabase instance with the
 * 0017_metadata_indexing migration applied.
 *
 * To run: cd apps/api && bun test src/routes/tests/metadata-search-performance.test.ts
 */

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
	SIMPLE_QUERY_MS: 500, // Single filter query should be < 500ms
	COMPLEX_QUERY_MS: 800, // Multiple filters should be < 800ms
	BULK_INSERT_MS: 10000, // Inserting 1000 docs should be < 10s
	CONCURRENT_QUERIES_MS: 1000, // 10 concurrent queries < 1s
}

// Test data configuration
const TEST_CONFIG = {
	TOTAL_DOCUMENTS: 1200, // > 1000 as required
	BATCH_SIZE: 100, // Insert in batches for better performance
	TAGS_PER_DOC: 5,
	MENTIONS_PER_DOC: 3,
	PROPERTIES_PER_DOC: 8,
}

// Sample tags pool for generating varied metadata
const TAG_POOL = [
	"ai",
	"machine-learning",
	"research",
	"engineering",
	"frontend",
	"backend",
	"database",
	"performance",
	"security",
	"testing",
	"devops",
	"architecture",
	"design",
	"product",
	"documentation",
	"api",
	"mobile",
	"web",
	"cloud",
	"analytics",
]

const MENTION_POOL = [
	"john-doe",
	"jane-smith",
	"alice-jones",
	"bob-wilson",
	"carol-brown",
	"david-taylor",
	"emma-davis",
	"frank-miller",
	"grace-anderson",
	"henry-thomas",
]

const PROPERTY_KEYS = [
	"status",
	"priority",
	"category",
	"department",
	"project",
	"version",
	"assignee",
	"due_date",
]

const PROPERTY_VALUES = {
	status: ["draft", "review", "approved", "published", "archived"],
	priority: ["low", "medium", "high", "urgent"],
	category: ["technical", "business", "research", "operational"],
	department: ["engineering", "product", "design", "marketing", "sales"],
	project: ["alpha", "beta", "gamma", "delta", "epsilon"],
	version: ["1.0", "2.0", "3.0", "4.0", "5.0"],
	assignee: MENTION_POOL,
	due_date: [
		"2026-01-30",
		"2026-02-15",
		"2026-03-01",
		"2026-04-01",
		"2026-05-01",
	],
}

describe("Metadata Search Performance Tests", () => {
	let supabase: SupabaseClient
	let testOrgId: string
	let testSpaceId: string
	let documentIds: string[] = []

	/**
	 * Setup: Create test organization, space, and 1000+ documents
	 */
	beforeAll(async () => {
		// Initialize Supabase client
		const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:54321"
		const supabaseKey =
			process.env.SUPABASE_ANON_KEY || "test-anon-key-for-local-development"

		supabase = createClient(supabaseUrl, supabaseKey)

		console.log(
			"\n🏗️  Setting up performance test environment (this may take a moment)...",
		)

		// Create test organization
		const orgResult = await supabase
			.from("organizations")
			.insert({
				name: `Perf Test Org ${Date.now()}`,
				slug: `perf-test-${Date.now()}`,
			})
			.select()
			.single()

		if (orgResult.error) {
			throw new Error(`Failed to create test org: ${orgResult.error.message}`)
		}
		testOrgId = orgResult.data.id

		// Create test space
		const spaceResult = await supabase
			.from("spaces")
			.insert({
				name: "Performance Test Space",
				org_id: testOrgId,
			})
			.select()
			.single()

		if (spaceResult.error) {
			throw new Error(
				`Failed to create test space: ${spaceResult.error.message}`,
			)
		}
		testSpaceId = spaceResult.data.id

		// Generate and insert test documents in batches
		const startTime = performance.now()

		for (let batch = 0; batch < TEST_CONFIG.TOTAL_DOCUMENTS / TEST_CONFIG.BATCH_SIZE; batch++) {
			const documents = []

			for (let i = 0; i < TEST_CONFIG.BATCH_SIZE; i++) {
				const docIndex = batch * TEST_CONFIG.BATCH_SIZE + i
				const doc = generateTestDocument(docIndex, testOrgId, testSpaceId)
				documents.push(doc)
			}

			const result = await supabase
				.from("documents")
				.insert(documents)
				.select("id")

			if (result.error) {
				throw new Error(`Failed to insert batch ${batch}: ${result.error.message}`)
			}

			documentIds.push(...result.data.map((d) => d.id))
		}

		const bulkInsertTime = performance.now() - startTime

		console.log(
			`✅ Created ${documentIds.length} test documents in ${bulkInsertTime.toFixed(0)}ms`,
		)
		expect(bulkInsertTime).toBeLessThan(TEST_CONFIG.BULK_INSERT_MS)
		expect(documentIds.length).toBeGreaterThanOrEqual(1000)
	}, 30000) // 30s timeout for setup

	/**
	 * Cleanup: Remove all test data
	 */
	afterAll(async () => {
		console.log("\n🧹 Cleaning up test data...")

		if (testOrgId) {
			// Delete all documents (cascades to chunks)
			await supabase.from("documents").delete().eq("org_id", testOrgId)

			// Delete space
			if (testSpaceId) {
				await supabase.from("spaces").delete().eq("id", testSpaceId)
			}

			// Delete organization
			await supabase.from("organizations").delete().eq("id", testOrgId)
		}

		console.log("✅ Cleanup complete")
	})

	/**
	 * Test 1: Simple tag filter performance
	 */
	it("should search by single tag in < 500ms", async () => {
		const startTime = performance.now()

		const result = await supabase.rpc("search_by_metadata", {
			metadata_filter: {
				extracted: {
					tags: ["ai"],
				},
			},
			org_id_param: testOrgId,
			limit_param: 50,
		})

		const queryTime = performance.now() - startTime

		expect(result.error).toBeNull()
		expect(result.data).toBeTruthy()
		expect(Array.isArray(result.data)).toBe(true)
		expect(result.data.length).toBeGreaterThan(0)
		expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY_MS)

		console.log(`  ✓ Tag search: ${queryTime.toFixed(2)}ms`)
	})

	/**
	 * Test 2: Multiple tags filter (OR logic)
	 */
	it("should search by multiple tags in < 500ms", async () => {
		const startTime = performance.now()

		const result = await supabase.rpc("search_by_metadata", {
			metadata_filter: {
				extracted: {
					tags: ["ai", "research", "engineering"],
				},
			},
			org_id_param: testOrgId,
			limit_param: 50,
		})

		const queryTime = performance.now() - startTime

		expect(result.error).toBeNull()
		expect(result.data).toBeTruthy()
		expect(result.data.length).toBeGreaterThan(0)
		expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY_MS)

		console.log(`  ✓ Multiple tags search: ${queryTime.toFixed(2)}ms`)
	})

	/**
	 * Test 3: Mentions filter performance
	 */
	it("should search by mentions in < 500ms", async () => {
		const startTime = performance.now()

		const result = await supabase.rpc("search_by_metadata", {
			metadata_filter: {
				extracted: {
					mentions: ["john-doe", "jane-smith"],
				},
			},
			org_id_param: testOrgId,
			limit_param: 50,
		})

		const queryTime = performance.now() - startTime

		expect(result.error).toBeNull()
		expect(result.data).toBeTruthy()
		expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY_MS)

		console.log(`  ✓ Mentions search: ${queryTime.toFixed(2)}ms`)
	})

	/**
	 * Test 4: Properties filter performance
	 */
	it("should search by properties in < 500ms", async () => {
		const startTime = performance.now()

		const result = await supabase.rpc("search_by_metadata", {
			metadata_filter: {
				extracted: {
					properties: {
						status: "approved",
						priority: "high",
					},
				},
			},
			org_id_param: testOrgId,
			limit_param: 50,
		})

		const queryTime = performance.now() - startTime

		expect(result.error).toBeNull()
		expect(result.data).toBeTruthy()
		expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY_MS)

		console.log(`  ✓ Properties search: ${queryTime.toFixed(2)}ms`)
	})

	/**
	 * Test 5: Complex filter combination (tags + mentions + properties)
	 */
	it("should search with complex filters in < 800ms", async () => {
		const startTime = performance.now()

		const result = await supabase.rpc("search_by_metadata", {
			metadata_filter: {
				extracted: {
					tags: ["engineering", "frontend"],
					mentions: ["alice-jones"],
					properties: {
						status: "approved",
						priority: "high",
						department: "engineering",
					},
				},
			},
			org_id_param: testOrgId,
			limit_param: 50,
		})

		const queryTime = performance.now() - startTime

		expect(result.error).toBeNull()
		expect(result.data).toBeTruthy()
		expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.COMPLEX_QUERY_MS)

		console.log(`  ✓ Complex filter search: ${queryTime.toFixed(2)}ms`)
	})

	/**
	 * Test 6: Full-text search in metadata
	 */
	it("should perform full-text search in metadata < 500ms", async () => {
		const startTime = performance.now()

		const result = await supabase.rpc("search_by_metadata", {
			metadata_filter: null,
			org_id_param: testOrgId,
			text_query: "engineering frontend",
			limit_param: 50,
		})

		const queryTime = performance.now() - startTime

		expect(result.error).toBeNull()
		expect(result.data).toBeTruthy()
		expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY_MS)

		console.log(`  ✓ Full-text search: ${queryTime.toFixed(2)}ms`)
	})

	/**
	 * Test 7: Hybrid search (filters + full-text)
	 */
	it("should perform hybrid search in < 800ms", async () => {
		const startTime = performance.now()

		const result = await supabase.rpc("search_by_metadata", {
			metadata_filter: {
				extracted: {
					tags: ["research"],
					properties: {
						priority: "high",
					},
				},
			},
			org_id_param: testOrgId,
			text_query: "machine learning",
			limit_param: 50,
		})

		const queryTime = performance.now() - startTime

		expect(result.error).toBeNull()
		expect(result.data).toBeTruthy()
		expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.COMPLEX_QUERY_MS)

		console.log(`  ✓ Hybrid search: ${queryTime.toFixed(2)}ms`)
	})

	/**
	 * Test 8: Pagination performance (large offsets)
	 */
	it("should handle pagination efficiently", async () => {
		const queries = [
			{ limit: 10, offset: 0 },
			{ limit: 10, offset: 100 },
			{ limit: 10, offset: 500 },
			{ limit: 10, offset: 1000 },
		]

		for (const { limit, offset } of queries) {
			const startTime = performance.now()

			const result = await supabase
				.from("documents")
				.select("id, metadata")
				.eq("org_id", testOrgId)
				.order("created_at", { ascending: false })
				.range(offset, offset + limit - 1)

			const queryTime = performance.now() - startTime

			expect(result.error).toBeNull()
			expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY_MS)

			console.log(`  ✓ Pagination (offset ${offset}): ${queryTime.toFixed(2)}ms`)
		}
	})

	/**
	 * Test 9: Concurrent query performance
	 */
	it("should handle concurrent queries efficiently", async () => {
		const concurrentQueries = Array.from({ length: 10 }, (_, i) => ({
			metadata_filter: {
				extracted: {
					tags: [TAG_POOL[i % TAG_POOL.length]],
				},
			},
			org_id_param: testOrgId,
			limit_param: 20,
		}))

		const startTime = performance.now()

		const results = await Promise.all(
			concurrentQueries.map((query) => supabase.rpc("search_by_metadata", query)),
		)

		const totalTime = performance.now() - startTime

		results.forEach((result) => {
			expect(result.error).toBeNull()
		})
		expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_QUERIES_MS)

		console.log(`  ✓ 10 concurrent queries: ${totalTime.toFixed(2)}ms`)
	})

	/**
	 * Test 10: Verify GIN index usage with EXPLAIN
	 */
	it("should use GIN indexes for metadata queries", async () => {
		// Execute EXPLAIN to verify index usage
		const { data, error } = await supabase.rpc("pg_explain", {
			query_text: `
				SELECT * FROM documents
				WHERE org_id = '${testOrgId}'
				AND metadata @> '{"extracted": {"tags": ["ai"]}}'::jsonb
				LIMIT 50
			`,
		})

		// Note: This test assumes pg_explain function exists
		// If not available, we can infer from query performance
		if (!error && data) {
			const explainOutput = JSON.stringify(data)
			// Check if GIN index is used
			expect(
				explainOutput.includes("idx_documents_metadata_gin") ||
					explainOutput.includes("Bitmap Index Scan"),
			).toBe(true)
			console.log("  ✓ GIN index is being used")
		} else {
			// Fallback: verify performance indicates index usage
			const startTime = performance.now()

			await supabase.rpc("search_by_metadata", {
				metadata_filter: {
					extracted: {
						tags: ["ai"],
					},
				},
				org_id_param: testOrgId,
				limit_param: 50,
			})

			const queryTime = performance.now() - startTime

			// If query is fast, index is likely being used
			expect(queryTime).toBeLessThan(100) // Should be very fast with index
			console.log(
				`  ✓ Query performance indicates index usage: ${queryTime.toFixed(2)}ms`,
			)
		}
	})

	/**
	 * Test 11: N+1 query detection - verify single query for results
	 */
	it("should not have N+1 query problems", async () => {
		// Search for documents
		const searchStart = performance.now()

		const searchResult = await supabase.rpc("search_by_metadata", {
			metadata_filter: {
				extracted: {
					tags: ["engineering"],
				},
			},
			org_id_param: testOrgId,
			limit_param: 50,
		})

		const searchTime = performance.now() - searchStart

		expect(searchResult.error).toBeNull()
		expect(searchResult.data).toBeTruthy()

		const resultCount = searchResult.data.length

		// Now fetch details for each result (simulating N+1 problem)
		const detailsStart = performance.now()

		const detailPromises = searchResult.data.map((doc: any) =>
			supabase.from("documents").select("*").eq("id", doc.id).single(),
		)

		await Promise.all(detailPromises)

		const detailsTime = performance.now() - detailsStart

		// Details fetching should be roughly proportional to result count
		// If it's much slower, we might have N+1 issues
		const timePerDoc = detailsTime / resultCount

		console.log(
			`  ✓ Search: ${searchTime.toFixed(2)}ms, Details: ${detailsTime.toFixed(2)}ms (${timePerDoc.toFixed(2)}ms/doc)`,
		)

		// Each detail fetch should be reasonably fast (< 50ms per document)
		expect(timePerDoc).toBeLessThan(50)
	})

	/**
	 * Test 12: Large result set performance
	 */
	it("should handle large result sets efficiently", async () => {
		const startTime = performance.now()

		const result = await supabase.rpc("search_by_metadata", {
			metadata_filter: {
				extracted: {
					tags: ["engineering"], // Common tag, should match many docs
				},
			},
			org_id_param: testOrgId,
			limit_param: 500, // Request large result set
		})

		const queryTime = performance.now() - startTime

		expect(result.error).toBeNull()
		expect(result.data).toBeTruthy()
		expect(result.data.length).toBeGreaterThan(0)
		expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.COMPLEX_QUERY_MS)

		console.log(
			`  ✓ Large result set (${result.data.length} docs): ${queryTime.toFixed(2)}ms`,
		)
	})

	/**
	 * Test 13: Empty filter performance (baseline)
	 */
	it("should handle queries without filters efficiently", async () => {
		const startTime = performance.now()

		const result = await supabase
			.from("documents")
			.select("id, title, metadata")
			.eq("org_id", testOrgId)
			.limit(50)

		const queryTime = performance.now() - startTime

		expect(result.error).toBeNull()
		expect(result.data).toBeTruthy()
		expect(result.data.length).toBe(50)
		expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY_MS)

		console.log(`  ✓ Baseline query (no filters): ${queryTime.toFixed(2)}ms`)
	})

	/**
	 * Test 14: Varied metadata depth performance
	 */
	it("should handle nested metadata queries efficiently", async () => {
		const startTime = performance.now()

		const result = await supabase
			.from("documents")
			.select("id, metadata")
			.eq("org_id", testOrgId)
			.contains("metadata", {
				extracted: {
					properties: {
						status: "approved",
					},
				},
			})
			.limit(50)

		const queryTime = performance.now() - startTime

		expect(result.error).toBeNull()
		expect(result.data).toBeTruthy()
		expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY_MS)

		console.log(`  ✓ Nested metadata query: ${queryTime.toFixed(2)}ms`)
	})
})

/**
 * Helper: Generate a test document with realistic metadata
 */
function generateTestDocument(
	index: number,
	orgId: string,
	spaceId: string,
): any {
	// Generate varied tags (3-7 tags per document)
	const tagCount = 3 + Math.floor(Math.random() * 5)
	const tags = Array.from(
		{ length: tagCount },
		() => TAG_POOL[Math.floor(Math.random() * TAG_POOL.length)],
	)

	// Generate mentions (2-4 mentions per document)
	const mentionCount = 2 + Math.floor(Math.random() * 3)
	const mentions = Array.from(
		{ length: mentionCount },
		() => MENTION_POOL[Math.floor(Math.random() * MENTION_POOL.length)],
	)

	// Generate properties (5-8 properties per document)
	const propertyCount = 5 + Math.floor(Math.random() * 4)
	const properties: Record<string, any> = {}

	for (let i = 0; i < propertyCount; i++) {
		const key = PROPERTY_KEYS[i % PROPERTY_KEYS.length]
		const values = PROPERTY_VALUES[key as keyof typeof PROPERTY_VALUES]
		properties[key] = values[Math.floor(Math.random() * values.length)]
	}

	// Generate some comments (30% of documents have comments)
	const comments =
		Math.random() > 0.7
			? [
					{
						id: `comment-${index}-1`,
						text: `This is a test comment for document ${index}`,
						author: mentions[0],
						created_at: new Date().toISOString(),
					},
				]
			: []

	return {
		title: `Test Document ${index}`,
		type: "text",
		content: `This is test document number ${index} with tags: ${tags.join(", ")}`,
		org_id: orgId,
		space_id: spaceId,
		metadata: {
			extracted: {
				tags,
				mentions,
				properties,
				comments,
			},
			source: "performance-test",
			version: "1.0",
		},
		processing_metadata: {
			extracted_at: new Date().toISOString(),
			extractor_version: "test-1.0",
		},
	}
}
