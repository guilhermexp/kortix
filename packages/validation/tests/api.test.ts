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

		it("should validate search with tagsFilter", () => {
			const result = SearchRequestSchema.safeParse({
				q: "machine learning",
				tagsFilter: ["ai", "research"],
			})
			expect(result.success).toBe(true)
		})

		it("should validate search with mentionsFilter", () => {
			const result = SearchRequestSchema.safeParse({
				q: "project update",
				mentionsFilter: ["@john", "@alice"],
			})
			expect(result.success).toBe(true)
		})

		it("should validate search with propertiesFilter", () => {
			const result = SearchRequestSchema.safeParse({
				q: "documentation",
				propertiesFilter: {
					status: "active",
					priority: "high",
				},
			})
			expect(result.success).toBe(true)
		})

		it("should validate search with all metadata filters", () => {
			const result = SearchRequestSchema.safeParse({
				q: "team project",
				tagsFilter: ["ai", "research"],
				mentionsFilter: ["@john", "@alice"],
				propertiesFilter: {
					status: "active",
					priority: "high",
					category: ["tech", "science"],
				},
			})
			expect(result.success).toBe(true)
		})

		it("should validate search with combined filters", () => {
			const result = SearchRequestSchema.safeParse({
				q: "AI concepts",
				limit: 20,
				containerTags: ["project_abc"],
				tagsFilter: ["machine-learning"],
				mentionsFilter: ["@researcher"],
				propertiesFilter: {
					status: "completed",
				},
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
