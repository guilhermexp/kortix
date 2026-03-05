import { describe, expect, it } from "bun:test"
import { buildSearchVariants, fuseSearchPasses } from "./search-intelligence"

describe("search-tool intelligent strategy", () => {
	it("builds deterministic variants with exact terms", () => {
		const variants = buildSearchVariants(
			'procure "claude hooks" dashboard de agentes em todos os projetos',
		)
		expect(variants.length).toBeGreaterThan(1)
		expect(variants.some((v) => v.query.includes('"claude hooks"'))).toBe(true)
	})

	it("fuses pass results and promotes docs found in multiple passes", () => {
		const merged = fuseSearchPasses(
			[
				{
					query: "q1",
					weight: 1,
					results: [
						{ documentId: "doc-a", title: "A", score: 0.6 },
						{ documentId: "doc-b", title: "B", score: 0.95 },
					],
				},
				{
					query: "q2",
					weight: 0.9,
					results: [
						{ documentId: "doc-a", title: "A", score: 0.7 },
					],
				},
			],
			5,
		)

		expect(merged[0]?.documentId).toBe("doc-a")
		expect(merged.some((d) => d.documentId === "doc-b")).toBe(true)
	})
})
