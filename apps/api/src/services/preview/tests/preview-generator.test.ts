import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type {
	PreviewGenerationOptions,
	PreviewMetrics,
	PreviewResult,
	ProcessingError,
} from "../../interfaces"
import {
	createPreviewGeneratorService,
	PreviewGeneratorService,
} from "../preview-generator"

/**
 * Unit tests for PreviewGeneratorService
 *
 * Tests preview generation functionality including:
 * - Preview generation with fallback chains
 * - Image, SVG, and favicon extraction integration
 * - Performance optimization and caching
 * - Error handling and graceful degradation
 * - Multiple preview formats and themes
 */

describe("PreviewGeneratorService", () => {
	let service: PreviewGeneratorService
	let mockOptions: PreviewGenerationOptions

	beforeEach(() => {
		mockOptions = {
			enableImageExtraction: true,
			enableSVGGeneration: true,
			enableFaviconExtraction: true,
			enableCaching: true,
			fallbackChain: ["favicon", "image", "svg"],
			cacheOptions: {
				enabled: true,
				maxSize: 1000,
				ttlSeconds: 3600,
			},
		}

		service = new PreviewGeneratorService(mockOptions)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Service Interface", () => {
		it("should implement PreviewGeneratorService interface", () => {
			expect(service).toHaveProperty("generatePreview")
			expect(service).toHaveProperty("generateImagePreview")
			expect(service).toHaveProperty("generateSVGPreview")
			expect(service).toHaveProperty("extractFavicon")
		})

		it("should have proper service metadata", () => {
			expect(service.getName()).toBe("PreviewGeneratorService")
		})
	})

	describe("Preview Generation", () => {
		it("should generate preview with fallback chain", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Sample Document",
				content: "This is a sample document content",
				metadata: { author: "Test Author" },
			}

			const mockPreview: PreviewResult = {
				previewType: "favicon",
				content: "data:image/x-icon;base64,AAABAAEAEBAAAA...",
				metadata: {
					source: "favicon",
					format: "ico",
					size: 16,
				},
				generatedAt: new Date().toISOString(),
			}

			const faviconSpy = vi.spyOn(service as any, "extractFavicon")
			faviconSpy.mockResolvedValue(mockPreview)

			const result = await service.generatePreview(documentInput)

			expect(result.success).toBe(true)
			expect(result.data?.previewType).toBe("favicon")
			expect(result.data?.content).toBeTruthy()
		})

		it("should fallback when primary method fails", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Sample Document",
				content: "Document content",
			}

			const faviconSpy = vi.spyOn(service as any, "extractFavicon")
			const imageSpy = vi.spyOn(service as any, "generateImagePreview")
			const svgSpy = vi.spyOn(service as any, "generateSVGPreview")

			// Favicon fails, image fails, svg succeeds
			faviconSpy.mockRejectedValue(new Error("No favicon found"))
			imageSpy.mockRejectedValue(new Error("Image extraction failed"))
			svgSpy.mockResolvedValue({
				previewType: "svg",
				content: "<svg>...</svg>",
				metadata: { source: "svg-generated" },
				generatedAt: new Date().toISOString(),
			})

			const result = await service.generatePreview(documentInput)

			expect(result.success).toBe(true)
			expect(result.data?.previewType).toBe("svg")
			expect(faviconSpy).toHaveBeenCalled()
			expect(imageSpy).toHaveBeenCalled()
			expect(svgSpy).toHaveBeenCalled()
		})

		it("should return error when all fallback methods fail", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Sample Document",
				content: "Document content",
			}

			const faviconSpy = vi.spyOn(service as any, "extractFavicon")
			const imageSpy = vi.spyOn(service as any, "generateImagePreview")
			const svgSpy = vi.spyOn(service as any, "generateSVGPreview")

			faviconSpy.mockRejectedValue(new Error("No favicon"))
			imageSpy.mockRejectedValue(new Error("No image"))
			svgSpy.mockRejectedValue(new Error("SVG generation failed"))

			const result = await service.generatePreview(documentInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("ALL_PREVIEW_METHODS_FAILED")
		})
	})

	describe("Image Preview Generation", () => {
		it("should extract images from document", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Document with Images",
				content: "Document with embedded images",
				images: [
					{ url: "https://example.com/image1.jpg", alt: "Image 1" },
					{ url: "https://example.com/image2.png", alt: "Image 2" },
				],
			}

			const mockImagePreview = {
				previewType: "image",
				content: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
				metadata: {
					source: "extracted-image",
					format: "jpeg",
					dimensions: { width: 800, height: 600 },
					size: 123456,
				},
				generatedAt: new Date().toISOString(),
			}

			const imageSpy = vi.spyOn(service as any, "extractImages")
			imageSpy.mockResolvedValue(mockImagePreview)

			const result = await service.generateImagePreview(documentInput)

			expect(result.success).toBe(true)
			expect(result.data?.previewType).toBe("image")
			expect(result.data?.metadata.format).toBe("jpeg")
		})

		it("should handle documents with no images", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Text-only Document",
				content: "Just plain text content",
			}

			const imageSpy = vi.spyOn(service as any, "extractImages")
			imageSpy.mockResolvedValue(null)

			const result = await service.generateImagePreview(documentInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("NO_IMAGES_FOUND")
		})
	})

	describe("SVG Preview Generation", () => {
		it("should generate SVG preview from document content", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Document Title",
				content: "Document content with details",
			}

			const mockSVGPreview = {
				previewType: "svg",
				content:
					'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f0f0f0"/><text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="16">Document Title</text></svg>',
				metadata: {
					source: "svg-generated",
					theme: "default",
					dimensions: { width: 400, height: 300 },
				},
				generatedAt: new Date().toISOString(),
			}

			const svgSpy = vi.spyOn(service as any, "generateSVGFromContent")
			svgSpy.mockResolvedValue(mockSVGPreview)

			const result = await service.generateSVGPreview(documentInput)

			expect(result.success).toBe(true)
			expect(result.data?.previewType).toBe("svg")
			expect(result.data?.content).toContain("<svg")
			expect(result.data?.content).toContain("Document Title")
		})

		it("should support different SVG themes", async () => {
			const themes = ["default", "minimal", "professional", "colorful"]

			for (const theme of themes) {
				const documentInput = {
					id: "doc-1",
					title: `Document for ${theme} theme`,
					content: "Content",
				}

				const svgSpy = vi.spyOn(service as any, "generateSVGFromContent")
				svgSpy.mockResolvedValue({
					previewType: "svg",
					content: `<svg>${theme} themed content</svg>`,
					metadata: { theme },
					generatedAt: new Date().toISOString(),
				})

				const result = await service.generateSVGPreview(documentInput, {
					theme: theme as any,
				})

				expect(result.success).toBe(true)
				expect(result.data?.metadata.theme).toBe(theme)
			}
		})
	})

	describe("Favicon Extraction", () => {
		it("should extract favicon from document URL", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Web Document",
				url: "https://example.com/document",
			}

			const mockFaviconPreview = {
				previewType: "favicon",
				content: "data:image/x-icon;base64,AAABAAEAEBAAAA...",
				metadata: {
					source: "favicon",
					format: "ico",
					url: "https://example.com/favicon.ico",
					size: 32,
				},
				generatedAt: new Date().toISOString(),
			}

			const faviconSpy = vi.spyOn(service as any, "fetchFaviconFromURL")
			faviconSpy.mockResolvedValue(mockFaviconPreview)

			const result = await service.extractFavicon(documentInput)

			expect(result.success).toBe(true)
			expect(result.data?.previewType).toBe("favicon")
			expect(result.data?.metadata.url).toBe("https://example.com/favicon.ico")
		})

		it("should handle documents without URLs", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Local Document",
				content: "Local content",
			}

			const result = await service.extractFavicon(documentInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("NO_URL_AVAILABLE")
		})
	})

	describe("Caching", () => {
		it("should cache preview results", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Cached Document",
				content: "Content for caching",
			}

			const mockPreview = {
				previewType: "svg",
				content: "<svg>Cached preview</svg>",
				metadata: { source: "cached" },
				generatedAt: new Date().toISOString(),
			}

			const svgSpy = vi.spyOn(service as any, "generateSVGFromContent")
			svgSpy.mockResolvedValue(mockPreview)

			// First call
			const result1 = await service.generatePreview(documentInput)
			// Second call (should use cache)
			const result2 = await service.generatePreview(documentInput)

			expect(result1.success).toBe(true)
			expect(result2.success).toBe(true)
			expect(svgSpy).toHaveBeenCalledTimes(1) // Only called once
			expect(result1.data?.content).toBe(result2.data?.content)
		})

		it("should handle cache invalidation", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Document",
				content: "Content",
			}

			const mockPreview = {
				previewType: "svg",
				content: "<svg>Preview</svg>",
				metadata: { source: "generated" },
				generatedAt: new Date().toISOString(),
			}

			const svgSpy = vi.spyOn(service as any, "generateSVGFromContent")
			svgSpy.mockResolvedValue(mockPreview)

			// First call
			await service.generatePreview(documentInput)

			// Invalidate cache
			service.clearCache()

			// Second call (should regenerate)
			await service.generatePreview(documentInput)

			expect(svgSpy).toHaveBeenCalledTimes(2)
		})
	})

	describe("Performance Optimization", () => {
		it("should process multiple documents concurrently", async () => {
			const documents = Array(5)
				.fill(null)
				.map((_, i) => ({
					id: `doc-${i}`,
					title: `Document ${i}`,
					content: `Content ${i}`,
				}))

			const mockPreview = {
				previewType: "svg",
				content: "<svg>Preview</svg>",
				metadata: { source: "generated" },
				generatedAt: new Date().toISOString(),
			}

			const svgSpy = vi.spyOn(service as any, "generateSVGFromContent")
			svgSpy.mockResolvedValue(mockPreview)

			const results = await Promise.all(
				documents.map((doc) => service.generatePreview(doc)),
			)

			expect(results).toHaveLength(5)
			expect(results.every((r) => r.success)).toBe(true)
		})

		it("should implement timeout handling", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Slow Document",
				content: "Content",
			}

			const svgSpy = vi.spyOn(service as any, "generateSVGFromContent")
			svgSpy.mockImplementation(
				() =>
					new Promise((resolve) =>
						setTimeout(
							() =>
								resolve({
									previewType: "svg",
									content: "<svg>Slow preview</svg>",
									metadata: { source: "slow" },
									generatedAt: new Date().toISOString(),
								}),
							5000,
						),
					),
			)

			const result = await service.generatePreview(documentInput, {
				timeoutMs: 1000,
			})

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("PREVIEW_GENERATION_TIMEOUT")
		})
	})

	describe("Error Handling", () => {
		it("should handle network failures gracefully", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Network Document",
				url: "https://unreachable-site.com",
			}

			const faviconSpy = vi.spyOn(service as any, "fetchFaviconFromURL")
			faviconSpy.mockRejectedValue(new Error("Network error"))

			const result = await service.generatePreview(documentInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("PREVIEW_GENERATION_FAILED")
		})

		it("should handle invalid document input", async () => {
			const invalidInput = {
				id: "",
				title: "",
				content: "",
			}

			const result = await service.generatePreview(invalidInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("INVALID_DOCUMENT_INPUT")
		})

		it("should handle corrupted image data", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Document with Bad Image",
				images: [{ url: "https://example.com/corrupted.jpg" }],
			}

			const imageSpy = vi.spyOn(service as any, "extractImages")
			imageSpy.mockRejectedValue(new Error("Corrupted image data"))

			const result = await service.generateImagePreview(documentInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("IMAGE_EXTRACTION_FAILED")
		})
	})

	describe("Configuration Management", () => {
		it("should update preview options dynamically", () => {
			const newOptions: PreviewGenerationOptions = {
				...mockOptions,
				enableImageExtraction: false,
				fallbackChain: ["svg", "favicon"],
			}

			service.updateConfiguration(newOptions)

			// Verify configuration was updated
		})

		it("should handle custom themes", () => {
			const customOptions: PreviewGenerationOptions = {
				...mockOptions,
				customThemes: {
					"custom-theme": {
						primaryColor: "#ff0000",
						fontSize: 14,
					},
				},
			}

			const customService = new PreviewGeneratorService(customOptions)
			expect(customService).toBeDefined()
		})
	})

	describe("Factory Function", () => {
		it("should create service with default options", () => {
			const service = createPreviewGeneratorService()
			expect(service).toBeDefined()
			expect(service.getName()).toBe("PreviewGeneratorService")
		})

		it("should create service with custom options", () => {
			const customOptions: PreviewGenerationOptions = {
				enableImageExtraction: false,
				enableSVGGeneration: true,
				fallbackChain: ["svg"],
			}

			const service = createPreviewGeneratorService(customOptions)
			expect(service).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle very large documents", async () => {
			const largeDocument = {
				id: "doc-1",
				title: "Large Document",
				content: "Content. ".repeat(10000),
			}

			const svgSpy = vi.spyOn(service as any, "generateSVGFromContent")
			svgSpy.mockResolvedValue({
				previewType: "svg",
				content: "<svg>Large document preview</svg>",
				metadata: { source: "svg-generated" },
				generatedAt: new Date().toISOString(),
			})

			const result = await service.generatePreview(largeDocument)

			expect(result.success).toBe(true)
		})

		it("should handle documents with special characters", async () => {
			const specialDocument = {
				id: "doc-1",
				title: "Document with émojis 🎯",
				content: "Content with spëciäl chårs & symbols",
			}

			const svgSpy = vi.spyOn(service as any, "generateSVGFromContent")
			svgSpy.mockResolvedValue({
				previewType: "svg",
				content: "<svg>Special chars preview</svg>",
				metadata: { source: "svg-generated" },
				generatedAt: new Date().toISOString(),
			})

			const result = await service.generatePreview(specialDocument)

			expect(result.success).toBe(true)
		})

		it("should handle empty preview scenarios", async () => {
			const emptyDocument = {
				id: "doc-1",
				title: "",
				content: "",
			}

			const result = await service.generatePreview(emptyDocument)

			// Should still attempt to generate a preview
			expect(result.success).toBe(true)
		})
	})

	describe("Metrics and Statistics", () => {
		it("should track preview generation metrics", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Metrics Document",
				content: "Content for metrics",
			}

			const svgSpy = vi.spyOn(service as any, "generateSVGFromContent")
			svgSpy.mockResolvedValue({
				previewType: "svg",
				content: "<svg>Metrics preview</svg>",
				metadata: { source: "svg-generated" },
				generatedAt: new Date().toISOString(),
			})

			await service.generatePreview(documentInput)

			const metrics = service.getMetrics()
			expect(metrics.totalPreviews).toBeGreaterThan(0)
			expect(metrics.averageGenerationTime).toBeGreaterThan(0)
			expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0)
		})

		it("should report success rates by preview type", async () => {
			const metrics = service.getMetrics()

			expect(metrics.successRates).toBeDefined()
			expect(metrics.successRates.favicon).toBeGreaterThanOrEqual(0)
			expect(metrics.successRates.image).toBeGreaterThanOrEqual(0)
			expect(metrics.successRates.svg).toBeGreaterThanOrEqual(0)
		})
	})
})
