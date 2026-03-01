import { describe, expect, it } from "bun:test"
import {
	matchesNormalizedSearch,
	normalizeSearchText,
} from "./documents-search-utils"

describe("documents-search-utils", () => {
	describe("normalizeSearchText", () => {
		it("normalizes case, trims and removes diacritics", () => {
			expect(normalizeSearchText("  PeNeTrAÇãO  ")).toBe("penetracao")
		})
	})

	describe("matchesNormalizedSearch", () => {
		it("matches query against title", () => {
			const query = normalizeSearchText("penetracao")
			const matches = matchesNormalizedSearch(
				{ title: "Guia de Penetração", summary: null, content: null },
				query,
			)
			expect(matches).toBe(true)
		})

		it("matches query against summary", () => {
			const query = normalizeSearchText("pentagi")
			const matches = matchesNormalizedSearch(
				{
					title: "Resumo semanal",
					summary: "PentAGI é uma plataforma para testes de penetração.",
					content: null,
				},
				query,
			)
			expect(matches).toBe(true)
		})

		it("matches query against content", () => {
			const query = normalizeSearchText("penetracao")
			const matches = matchesNormalizedSearch(
				{
					title: "Ferramenta de segurança",
					summary: null,
					content: "Automatiza fluxos de penetração com agentes autônomos.",
				},
				query,
			)
			expect(matches).toBe(true)
		})

		it("returns false when query is absent in all searchable fields", () => {
			const query = normalizeSearchText("kubernetes")
			const matches = matchesNormalizedSearch(
				{
					title: "Ferramenta de pentest",
					summary: "Focada em segurança ofensiva",
					content: "Executa validações de rede.",
				},
				query,
			)
			expect(matches).toBe(false)
		})
	})
})
