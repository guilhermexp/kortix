/**
 * Basic tests for @repo/validation package
 */
import { describe, expect, it } from "bun:test"
import {
	MemoryAddSchema,
	MemoryResponseSchema,
	SearchRequestSchema,
} from "../api"

describe("@repo/validation", () => {
	describe("MemoryAddSchema", () => {
		it("should validate a valid memory add payload", () => {
			const result = MemoryAddSchema.safeParse({
				content: "This is test content",
				containerTags: ["project_123"],
			})
			expect(result.success).toBe(true)
		})

		it("should accept metadata", () => {
			const result = MemoryAddSchema.safeParse({
				content: "Test content",
				metadata: {
					category: "test",
					priority: 1,
				},
			})
			expect(result.success).toBe(true)
		})
	})

	describe("SearchRequestSchema", () => {
		it("should validate a basic search query", () => {
			const result = SearchRequestSchema.safeParse({
				q: "machine learning",
			})
			expect(result.success).toBe(true)
		})

		it("should validate search with filters", () => {
			const result = SearchRequestSchema.safeParse({
				q: "AI concepts",
				limit: 20,
				containerTags: ["project_abc"],
			})
			expect(result.success).toBe(true)
		})
	})

	describe("MemoryResponseSchema", () => {
		it("should validate a memory response", () => {
			const result = MemoryResponseSchema.safeParse({
				id: "abc123",
				status: "done",
			})
			expect(result.success).toBe(true)
		})
	})
})
