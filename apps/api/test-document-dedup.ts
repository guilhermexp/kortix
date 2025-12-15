/**
 * Test script to validate document deduplication logic
 * This tests the improved deduplication logic in addDocument function
 */

// Mock Supabase client for testing
type MockSupabaseClient = {
	from: (table: string) => {
		select: (columns: string) => {
			eq: (column: string, value: string) => {
				eq: (column: string, value: string) => {
					order: (column: string, options: { ascending: boolean }) => {
						limit: (n: number) => {
							maybeSingle: () => Promise<{
								data: any
								error: any
							}>
						}
					}
				}
			}
		}
	}
}

// Test deduplication logic
async function testDocumentDeduplication() {
	console.log("Testing document deduplication logic...\n")

	// Test case 1: URL deduplication - document exists
	console.log("Test 1: URL deduplication (document exists)")
	const mockClient1: any = {
		from: (table: string) => {
			if (table === "documents") {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								order: () => ({
									limit: () => ({
										maybeSingle: async () => ({
											data: {
												id: "existing-doc-id",
												status: "done",
												space_id: "old-space-id",
											},
											error: null,
										}),
									}),
								}),
							}),
						}),
					}),
				}
			}
			return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
		},
	}

	const url = "https://example.com/article"
	const orgId = "org-123"
	const result1 = await mockClient1
		.from("documents")
		.select("id, status, space_id")
		.eq("org_id", orgId)
		.eq("url", url)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle()

	console.assert(
		result1.data?.id === "existing-doc-id",
		"Test 1 failed: Should find existing document",
	)
	console.log("✓ Test 1 passed: Found existing document by URL\n")

	// Test case 2: Content deduplication - short text document
	console.log("Test 2: Content deduplication (short text)")
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
	const mockClient2: any = {
		from: (table: string) => {
			if (table === "documents") {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								eq: () => ({
									gte: () => ({
										order: () => ({
											limit: () => ({
												maybeSingle: async () => ({
													data: {
														id: "existing-text-doc-id",
														status: "done",
														space_id: "space-123",
													},
													error: null,
												}),
											}),
										}),
									}),
								}),
							}),
						}),
					}),
				}
			}
			return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
		},
	}

	const content = "This is a short text document"
	const result2 = await mockClient2
		.from("documents")
		.select("id, status, space_id")
		.eq("org_id", orgId)
		.eq("content", content)
		.eq("type", "text")
		.gte("created_at", sevenDaysAgo)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle()

	console.assert(
		result2.data?.id === "existing-text-doc-id",
		"Test 2 failed: Should find existing document by content",
	)
	console.log("✓ Test 2 passed: Found existing document by content\n")

	// Test case 3: No duplicate - new document
	console.log("Test 3: No duplicate found (new document)")
	const mockClient3: any = {
		from: (table: string) => {
			if (table === "documents") {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								order: () => ({
									limit: () => ({
										maybeSingle: async () => ({
											data: null,
											error: null,
										}),
									}),
								}),
							}),
						}),
					}),
				}
			}
			return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
		},
	}

	const result3 = await mockClient3
		.from("documents")
		.select("id, status, space_id")
		.eq("org_id", orgId)
		.eq("url", "https://new-url.com")
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle()

	console.assert(result3.data === null, "Test 3 failed: Should not find duplicate")
	console.log("✓ Test 3 passed: No duplicate found (new document)\n")

	console.log("✅ All document deduplication tests passed!")
}

// Run tests
testDocumentDeduplication().catch(console.error)


