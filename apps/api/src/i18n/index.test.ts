import { describe, expect, it } from "bun:test"
import {
	t,
	getTranslations,
	isLocaleSupported,
	buildSummaryPrompt,
	buildUrlAnalysisPrompt,
	buildTextAnalysisPrompt,
	buildYoutubePrompt,
	buildFilePrompt,
	getFallbackMessage,
	getSectionHeader,
} from "./index"

/**
 * Unit tests for i18n Translation System
 *
 * Tests type-safe translation functions, template variable replacement,
 * locale support, and prompt builder helpers.
 */

describe("i18n Translation System", () => {
	describe("t() - Basic Translation", () => {
		it("should translate simple paths in pt-BR (default)", () => {
			const result = t("prompts.summary.system")
			expect(result).toContain("Supermemory")
			expect(result).toContain("português do Brasil")
		})

		it("should translate simple paths in en-US", () => {
			const result = t("prompts.summary.system", undefined, "en-US")
			expect(result).toContain("Supermemory")
			expect(result).toContain("English")
		})

		it("should translate nested paths", () => {
			const result = t("prompts.summary.sections.executive")
			expect(result).toContain("Resumo Executivo")
		})

		it("should return path for missing translations", () => {
			const result = t("nonexistent.key.path")
			expect(result).toBe("nonexistent.key.path")
		})

		it("should return path for non-string values", () => {
			const result = t("prompts.summary.sections") // This is an object, not a string
			expect(result).toBe("prompts.summary.sections")
		})
	})

	describe("t() - Template Variable Replacement", () => {
		it("should replace single variable in pt-BR", () => {
			const result = t("prompts.summary.context.detected_title", {
				title: "Meu Título",
			})
			expect(result).toBe("Título detectado: Meu Título")
		})

		it("should replace single variable in en-US", () => {
			const result = t(
				"prompts.summary.context.detected_title",
				{ title: "My Title" },
				"en-US",
			)
			expect(result).toBe("Detected title: My Title")
		})

		it("should replace multiple variables", () => {
			const result = t(
				"prompts.deepAnalysis.text_based.context.title",
				{ title: "Test Title" },
			)
			expect(result).toContain("Test Title")
		})

		it("should handle null variables", () => {
			const result = t("prompts.summary.context.detected_title", {
				title: null,
			})
			// Should keep the {{title}} placeholder
			expect(result).toContain("{{title}}")
		})

		it("should handle undefined variables", () => {
			const result = t("prompts.summary.context.detected_title", {
				title: undefined,
			})
			// Should keep the {{title}} placeholder
			expect(result).toContain("{{title}}")
		})

		it("should handle numeric variables", () => {
			// Note: Our translations don't have numeric variables yet,
			// but the system should support them
			const testValue = t("prompts.summary.context.source", { url: 123 })
			expect(testValue).toContain("123")
		})

		it("should handle missing variable object", () => {
			const result = t("prompts.summary.context.detected_title")
			// Without variables, template stays unchanged
			expect(result).toContain("{{title}}")
		})
	})

	describe("Locale Support", () => {
		it("should support pt-BR locale", () => {
			expect(isLocaleSupported("pt-BR")).toBe(true)
		})

		it("should support en-US locale", () => {
			expect(isLocaleSupported("en-US")).toBe(true)
		})

		it("should reject unsupported locales", () => {
			expect(isLocaleSupported("fr-FR")).toBe(false)
			expect(isLocaleSupported("es-ES")).toBe(false)
			expect(isLocaleSupported("invalid")).toBe(false)
		})

		it("should return full translations object", () => {
			const ptBR = getTranslations("pt-BR")
			expect(ptBR).toHaveProperty("prompts")
			expect(ptBR).toHaveProperty("fallbackMessages")
			expect(ptBR).toHaveProperty("sectionHeaders")

			const enUS = getTranslations("en-US")
			expect(enUS).toHaveProperty("prompts")
			expect(enUS).toHaveProperty("fallbackMessages")
			expect(enUS).toHaveProperty("sectionHeaders")
		})
	})

	describe("buildSummaryPrompt()", () => {
		it("should build basic summary prompt", () => {
			const prompt = buildSummaryPrompt("Test content here")
			expect(prompt).toContain("Supermemory")
			expect(prompt).toContain("Resumo Executivo")
			expect(prompt).toContain("Pontos-Chave")
			expect(prompt).toContain("Casos de Uso")
			expect(prompt).toContain("Test content here")
		})

		it("should include title when provided", () => {
			const prompt = buildSummaryPrompt("Content", {
				title: "My Document",
			})
			expect(prompt).toContain("Título detectado: My Document")
		})

		it("should include URL when provided", () => {
			const prompt = buildSummaryPrompt("Content", {
				url: "https://example.com",
			})
			expect(prompt).toContain("Fonte: https://example.com")
		})

		it("should include both title and URL", () => {
			const prompt = buildSummaryPrompt("Content", {
				title: "Test",
				url: "https://example.com",
			})
			expect(prompt).toContain("Título detectado: Test")
			expect(prompt).toContain("Fonte: https://example.com")
		})

		it("should build English prompt when locale specified", () => {
			const prompt = buildSummaryPrompt("Test content", undefined, "en-US")
			expect(prompt).toContain("Executive Summary")
			expect(prompt).toContain("Key Points")
			expect(prompt).toContain("Use Cases")
		})
	})

	describe("buildUrlAnalysisPrompt()", () => {
		it("should build basic URL analysis prompt", () => {
			const prompt = buildUrlAnalysisPrompt("https://example.com")
			expect(prompt).toContain("https://example.com")
			expect(prompt).toContain("Resumo Executivo")
			expect(prompt).toContain("Pontos-Chave")
			expect(prompt).toContain("Casos de Uso")
		})

		it("should include GitHub-specific sections for GitHub URLs", () => {
			const prompt = buildUrlAnalysisPrompt("https://github.com/user/repo", {
				isGitHub: true,
			})
			expect(prompt).toContain("Tecnologias e Ferramentas")
		})

		it("should not include GitHub sections for non-GitHub URLs", () => {
			const prompt = buildUrlAnalysisPrompt("https://example.com", {
				isGitHub: false,
			})
			expect(prompt).not.toContain("Tecnologias e Ferramentas")
		})

		it("should include title when provided", () => {
			const prompt = buildUrlAnalysisPrompt("https://example.com", {
				title: "Page Title",
			})
			expect(prompt).toContain("**Título:** Page Title")
		})

		it("should build English prompt when locale specified", () => {
			const prompt = buildUrlAnalysisPrompt(
				"https://example.com",
				undefined,
				"en-US",
			)
			expect(prompt).toContain("Executive Summary")
		})
	})

	describe("buildTextAnalysisPrompt()", () => {
		it("should build basic text analysis prompt", () => {
			const prompt = buildTextAnalysisPrompt("Sample content")
			expect(prompt).toContain("Sample content")
			expect(prompt).toContain("Resumo Executivo")
			expect(prompt).toContain("Pontos-Chave")
		})

		it("should include GitHub sections when isGitHub is true", () => {
			const prompt = buildTextAnalysisPrompt("Content", { isGitHub: true })
			expect(prompt).toContain("Tecnologias e Ferramentas")
		})

		it("should include additional context for PDF content", () => {
			const prompt = buildTextAnalysisPrompt("Content", { isPDF: true })
			expect(prompt).toContain("Contexto Adicional")
		})

		it("should include additional context for web pages", () => {
			const prompt = buildTextAnalysisPrompt("Content", { isWebPage: true })
			expect(prompt).toContain("Contexto Adicional")
		})

		it("should include title and URL when provided", () => {
			const prompt = buildTextAnalysisPrompt("Content", {
				title: "Document Title",
				url: "https://example.com",
			})
			expect(prompt).toContain("**Título:** Document Title")
			expect(prompt).toContain("**Fonte:** https://example.com")
		})

		it("should build English prompt when locale specified", () => {
			const prompt = buildTextAnalysisPrompt("Content", undefined, "en-US")
			expect(prompt).toContain("Executive Summary")
		})
	})

	describe("buildYoutubePrompt()", () => {
		it("should build YouTube analysis prompt in pt-BR", () => {
			const prompt = buildYoutubePrompt()
			expect(prompt).toContain("YouTube")
			expect(prompt).toContain("Resumo Executivo")
			expect(prompt).toContain("Pontos Principais")
			expect(prompt).toContain("Casos de Uso")
			expect(prompt).toContain("Contexto Visual")
		})

		it("should build YouTube prompt in en-US", () => {
			const prompt = buildYoutubePrompt("en-US")
			expect(prompt).toContain("YouTube")
			expect(prompt).toContain("Executive Summary")
			expect(prompt).toContain("Main Points")
			expect(prompt).toContain("Use Cases")
			expect(prompt).toContain("Visual Context")
		})
	})

	describe("buildFilePrompt()", () => {
		it("should build image processing prompt", () => {
			const prompt = buildFilePrompt("image/png", "test.png")
			expect(prompt).toContain("imagens")
			expect(prompt).toContain("Supermemory")
			expect(prompt).toContain("test.png")
		})

		it("should build audio processing prompt", () => {
			const prompt = buildFilePrompt("audio/mp3", "recording.mp3")
			expect(prompt).toContain("áudio")
			expect(prompt).toContain("recording.mp3")
		})

		it("should build video processing prompt", () => {
			const prompt = buildFilePrompt("video/mp4", "video.mp4")
			expect(prompt).toContain("vídeos")
			expect(prompt).toContain("video.mp4")
		})

		it("should build document processing prompt", () => {
			const prompt = buildFilePrompt("application/pdf", "document.pdf")
			expect(prompt).toContain("documentos")
			expect(prompt).toContain("document.pdf")
		})

		it("should default to document prompt for unknown MIME types", () => {
			const prompt = buildFilePrompt("application/unknown")
			expect(prompt).toContain("documentos")
		})

		it("should handle MIME type case-insensitively", () => {
			const prompt1 = buildFilePrompt("IMAGE/PNG")
			const prompt2 = buildFilePrompt("image/png")
			expect(prompt1).toContain("imagens")
			expect(prompt2).toContain("imagens")
		})

		it("should work without filename", () => {
			const prompt = buildFilePrompt("image/jpeg")
			expect(prompt).toContain("imagens")
			expect(prompt).not.toContain("Nome do arquivo")
		})

		it("should build English prompt when locale specified", () => {
			const prompt = buildFilePrompt("image/png", "test.png", "en-US")
			expect(prompt).toContain("images")
			expect(prompt).toContain("test.png")
		})
	})

	describe("getFallbackMessage()", () => {
		it("should get fallback messages in pt-BR", () => {
			const noUseCases = getFallbackMessage("noUseCases")
			expect(noUseCases).toContain("sem casos de uso")

			const limitedInfo = getFallbackMessage("limitedInfo")
			expect(limitedInfo).toContain("informações limitadas")
		})

		it("should get fallback messages in en-US", () => {
			const noUseCases = getFallbackMessage("noUseCases", "en-US")
			expect(noUseCases).toContain("no use cases")

			const limitedInfo = getFallbackMessage("limitedInfo", "en-US")
			expect(limitedInfo).toContain("limited information")
		})
	})

	describe("getSectionHeader()", () => {
		it("should get section headers in pt-BR", () => {
			const executive = getSectionHeader("executive")
			expect(executive).toBe("## Resumo Executivo")

			const keyPoints = getSectionHeader("keyPoints")
			expect(keyPoints).toBe("## Pontos-Chave")

			const useCases = getSectionHeader("useCases")
			expect(useCases).toBe("## Casos de Uso")
		})

		it("should get section headers in en-US", () => {
			const executive = getSectionHeader("executive", "en-US")
			expect(executive).toBe("## Executive Summary")

			const keyPoints = getSectionHeader("keyPoints", "en-US")
			expect(keyPoints).toBe("## Key Points")

			const useCases = getSectionHeader("useCases", "en-US")
			expect(useCases).toBe("## Use Cases")
		})

		it("should get all section headers", () => {
			expect(getSectionHeader("source")).toContain("Fonte")
			expect(getSectionHeader("technologies")).toContain("Tecnologias")
			expect(getSectionHeader("additionalContext")).toContain("Contexto")
			expect(getSectionHeader("visualContext")).toContain("Visual")
			expect(getSectionHeader("mainPoints")).toContain("Principais")
		})
	})

	describe("Translation Consistency", () => {
		it("should have matching structures in pt-BR and en-US", () => {
			const ptBR = getTranslations("pt-BR")
			const enUS = getTranslations("en-US")

			// Check top-level keys match
			expect(Object.keys(ptBR).sort()).toEqual(Object.keys(enUS).sort())

			// Check prompts structure
			expect(Object.keys(ptBR.prompts).sort()).toEqual(
				Object.keys(enUS.prompts).sort(),
			)

			// Check fallbackMessages structure
			expect(Object.keys(ptBR.fallbackMessages).sort()).toEqual(
				Object.keys(enUS.fallbackMessages).sort(),
			)

			// Check sectionHeaders structure
			expect(Object.keys(ptBR.sectionHeaders).sort()).toEqual(
				Object.keys(enUS.sectionHeaders).sort(),
			)
		})

		it("should have non-empty translations for all keys", () => {
			const ptBR = getTranslations("pt-BR")
			const enUS = getTranslations("en-US")

			// Check a few critical paths are non-empty
			expect(ptBR.prompts.summary.system.length).toBeGreaterThan(0)
			expect(enUS.prompts.summary.system.length).toBeGreaterThan(0)

			expect(ptBR.fallbackMessages.noUseCases.length).toBeGreaterThan(0)
			expect(enUS.fallbackMessages.noUseCases.length).toBeGreaterThan(0)
		})
	})

	describe("Edge Cases", () => {
		it("should handle empty content in prompts", () => {
			const prompt = buildSummaryPrompt("")
			expect(prompt).toContain("Resumo Executivo")
		})

		it("should handle very long content in prompts", () => {
			const longContent = "a".repeat(100000)
			const prompt = buildSummaryPrompt(longContent)
			expect(prompt).toContain(longContent)
		})

		it("should handle special characters in variables", () => {
			const result = t("prompts.summary.context.detected_title", {
				title: "Title with <html> & special chars",
			})
			expect(result).toContain("Title with <html> & special chars")
		})

		it("should handle null context objects gracefully", () => {
			const prompt = buildSummaryPrompt("Content", null as any)
			expect(prompt).toContain("Content")
		})
	})
})
