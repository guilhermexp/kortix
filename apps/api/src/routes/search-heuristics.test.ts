import { describe, expect, it } from "bun:test"
import {
	extractExactTerms,
	includesNormalizedTerm,
	isExploratoryQuery,
} from "./search-heuristics"

describe("search exploratory fallback heuristic", () => {
	it("returns true for broad exploratory queries", () => {
		expect(isExploratoryQuery("o que eu tenho nesse projeto?")).toBe(true)
		expect(isExploratoryQuery("list documents")).toBe(true)
		expect(isExploratoryQuery("show my documents")).toBe(true)
	})

	it("returns false for specific keyword queries", () => {
		expect(isExploratoryQuery("pentagi roadmap 2025")).toBe(false)
		expect(isExploratoryQuery("erro de autenticação oauth"))
			.toBe(false)
		expect(isExploratoryQuery("termo_exato_que_deve_existir"))
			.toBe(false)
	})

	it("extracts exact terms from quotes", () => {
		expect(
			extractExactTerms(
				"procure por \"termo exato\" e também 'outro termo' e `ultimo`",
			),
		).toEqual(["termo exato", "outro termo", "ultimo"])
	})

	it("matches normalized terms with accents/case", () => {
		expect(includesNormalizedTerm("Plataforma de Penetração", "penetracao")).toBe(
			true,
		)
		expect(includesNormalizedTerm("Outro conteúdo", "naoexiste")).toBe(false)
	})
})
