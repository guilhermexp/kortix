/**
 * Basic tests for @repo/lib package
 */
import { describe, expect, it } from "bun:test"
import { generateId } from "../generate-id"

describe("@repo/lib", () => {
	describe("generateId", () => {
		it("should generate a 22-character ID", () => {
			const id = generateId()
			expect(id).toHaveLength(22)
		})

		it("should generate unique IDs", () => {
			const ids = new Set<string>()
			for (let i = 0; i < 100; i++) {
				ids.add(generateId())
			}
			expect(ids.size).toBe(100)
		})

		it("should only use alphanumeric characters (no ambiguous chars)", () => {
			const id = generateId()
			// The alphabet excludes 0, O, l, I to avoid confusion
			expect(id).toMatch(
				/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
			)
		})
	})
})
