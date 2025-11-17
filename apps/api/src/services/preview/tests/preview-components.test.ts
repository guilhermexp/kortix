import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type {
	FaviconExtractionOptions,
	ImageExtractionOptions,
	ProcessingError,
	SVGGenerationOptions,
} from "../../interfaces"
import { createFaviconExtractor, FaviconExtractor } from "../favicon-extractor"
import { createImageExtractor, ImageExtractor } from "../image-extractor"
import { createSVGGenerator, SVGGenerator } from "../svg-generator"

describe("Preview Service Components", () => {
	afterEach(() => vi.clearAllMocks())

	describe("ImageExtractor", () => {
		let extractor: ImageExtractor
		let mockOptions: ImageExtractionOptions

		beforeEach(() => {
			mockOptions = {
				includeMetadata: true,
				enableOptimization: true,
				maxImageSize: 1920,
				supportedFormats: ["jpg", "jpeg", "png", "gif", "webp"],
			}
			extractor = new ImageExtractor(mockOptions)
		})

		it("should extract images from document", async () => {
			const documentInput = {
				id: "doc-1",
				content: "Document with images",
				images: [
					{ url: "https://example.com/image1.jpg", alt: "Image 1" },
					{ url: "https://example.com/image2.png", alt: "Image 2" },
				],
			}

			const mockExtractionResult = {
				images: [
					{
						id: "img-1",
						url: "https://example.com/image1.jpg",
						data: "data:image/jpeg;base64,/9j/4AAQ...",
						metadata: { width: 800, height: 600, format: "jpeg" },
					},
				],
				extractionTime: 1000,
			}

			const extractSpy = vi.spyOn(extractor as any, "extractImagesFromDocument")
			extractSpy.mockResolvedValue(mockExtractionResult)

			const result = await extractor.extractImages(documentInput)

			expect(result.success).toBe(true)
			expect(result.data?.images).toHaveLength(1)
			expect(result.data?.images![0].metadata.format).toBe("jpeg")
		})

		it("should handle documents with no images", async () => {
			const documentInput = {
				id: "doc-1",
				content: "Text only document",
			}

			const result = await extractor.extractImages(documentInput)

			expect(result.success).toBe(true)
			expect(result.data?.images).toEqual([])
		})

		it("should optimize images when enabled", async () => {
			const documentInput = {
				id: "doc-1",
				content: "Document for optimization",
				images: [{ url: "https://example.com/large.jpg" }],
			}

			const extractSpy = vi.spyOn(extractor as any, "extractImagesFromDocument")
			extractSpy.mockResolvedValue({
				images: [
					{
						id: "img-1",
						url: "https://example.com/large.jpg",
						data: "optimized-data",
						metadata: { optimized: true },
					},
				],
				extractionTime: 1500,
			})

			const result = await extractor.extractImages(documentInput)

			expect(result.success).toBe(true)
			expect(result.data?.images![0].metadata.optimized).toBe(true)
		})
	})

	describe("SVGGenerator", () => {
		let generator: SVGGenerator
		let mockOptions: SVGGenerationOptions

		beforeEach(() => {
			mockOptions = {
				theme: "default",
				width: 400,
				height: 300,
				includeMetadata: true,
				enableAnimations: false,
			}
			generator = new SVGGenerator(mockOptions)
		})

		it("should generate SVG preview from document", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Test Document",
				content: "Document content for SVG generation",
			}

			const mockSVG =
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f0f0f0"/><text x="200" y="150" text-anchor="middle">Test Document</text></svg>'

			const generateSpy = vi.spyOn(generator as any, "generateSVGFromContent")
			generateSpy.mockResolvedValue({
				svg: mockSVG,
				metadata: { theme: "default", size: "400x300" },
			})

			const result = await generator.generatePreview(documentInput)

			expect(result.success).toBe(true)
			expect(result.data?.svg).toContain("<svg")
			expect(result.data?.svg).toContain("Test Document")
			expect(result.data?.metadata.theme).toBe("default")
		})

		it("should support different themes", async () => {
			const themes = ["default", "minimal", "professional", "colorful"]

			for (const theme of themes) {
				const documentInput = {
					id: "doc-1",
					title: `Theme Test ${theme}`,
					content: "Content",
				}

				const generateSpy = vi.spyOn(generator as any, "generateSVGFromContent")
				generateSpy.mockResolvedValue({
					svg: `<svg>${theme} theme</svg>`,
					metadata: { theme },
				})

				const result = await generator.generatePreview(documentInput, {
					theme: theme as any,
				})

				expect(result.success).toBe(true)
				expect(result.data?.metadata.theme).toBe(theme)
			}
		})

		it("should handle custom dimensions", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Custom Size",
				content: "Content",
			}

			const customOptions = { width: 800, height: 600 }

			const generateSpy = vi.spyOn(generator as any, "generateSVGFromContent")
			generateSpy.mockResolvedValue({
				svg: '<svg viewBox="0 0 800 600">Custom size</svg>',
				metadata: { dimensions: "800x600" },
			})

			const result = await generator.generatePreview(
				documentInput,
				customOptions,
			)

			expect(result.success).toBe(true)
			expect(result.data?.svg).toContain('viewBox="0 0 800 600"')
		})
	})

	describe("FaviconExtractor", () => {
		let extractor: FaviconExtractor
		let mockOptions: FaviconExtractionOptions

		beforeEach(() => {
			mockOptions = {
				includeMultipleSizes: true,
				preferredFormats: ["ico", "png", "svg"],
				enableCaching: true,
			}
			extractor = new FaviconExtractor(mockOptions)
		})

		it("should extract favicon from URL", async () => {
			const url = "https://example.com"
			const mockFavicon = {
				favicons: [
					{
						url: "https://example.com/favicon.ico",
						format: "ico",
						size: 32,
						data: "data:image/x-icon;base64,AAABAAEA...",
					},
				],
				extractionTime: 500,
			}

			const extractSpy = vi.spyOn(extractor as any, "fetchFaviconFromURL")
			extractSpy.mockResolvedValue(mockFavicon)

			const result = await extractor.extractFavicon(url)

			expect(result.success).toBe(true)
			expect(result.data?.favicons).toHaveLength(1)
			expect(result.data?.favicons![0].url).toBe(
				"https://example.com/favicon.ico",
			)
			expect(result.data?.favicons![0].format).toBe("ico")
		})

		it("should handle multiple favicon sizes", async () => {
			const url = "https://example.com"
			const mockFavicons = {
				favicons: [
					{
						url: "https://example.com/favicon-16x16.png",
						format: "png",
						size: 16,
					},
					{
						url: "https://example.com/favicon-32x32.png",
						format: "png",
						size: 32,
					},
					{ url: "https://example.com/favicon.ico", format: "ico", size: 32 },
				],
				extractionTime: 800,
			}

			const extractSpy = vi.spyOn(extractor as any, "fetchFaviconFromURL")
			extractSpy.mockResolvedValue(mockFavicons)

			const result = await extractor.extractFavicon(url)

			expect(result.success).toBe(true)
			expect(result.data?.favicons).toHaveLength(3)
		})

		it("should fallback when no favicon found", async () => {
			const url = "https://no-favicon.com"

			const extractSpy = vi.spyOn(extractor as any, "fetchFaviconFromURL")
			extractSpy.mockResolvedValue({ favicons: [], extractionTime: 300 })

			const result = await extractor.extractFavicon(url)

			expect(result.success).toBe(true)
			expect(result.data?.favicons).toEqual([])
		})

		it("should generate default favicon when none found", async () => {
			const url = "https://no-favicon.com"

			const extractSpy = vi.spyOn(extractor as any, "fetchFaviconFromURL")
			const defaultSpy = vi.spyOn(extractor as any, "generateDefaultFavicon")

			extractSpy.mockResolvedValue({ favicons: [], extractionTime: 300 })
			defaultSpy.mockResolvedValue({
				favicons: [
					{
						url: "data:image/svg+xml;base64,PHN2Zz4=",
						format: "svg",
						size: 32,
					},
				],
			})

			const result = await extractor.extractFavicon(url, {
				generateDefault: true,
			})

			expect(result.success).toBe(true)
			expect(defaultSpy).toHaveBeenCalled()
		})
	})

	describe("Integration Scenarios", () => {
		it("should work together as fallback chain", async () => {
			const documentInput = {
				id: "doc-1",
				title: "Integration Test",
				content: "Document content",
				url: "https://example.com/doc",
			}

			// Mock ImageExtractor
			const imageExtractor = new ImageExtractor({ includeMetadata: true })
			const imageSpy = vi.spyOn(
				imageExtractor as any,
				"extractImagesFromDocument",
			)
			imageSpy.mockResolvedValue({ images: [], extractionTime: 200 })

			// Mock SVGGenerator
			const svgGenerator = new SVGGenerator({ theme: "default" })
			const svgSpy = vi.spyOn(svgGenerator as any, "generateSVGFromContent")
			svgSpy.mockResolvedValue({
				svg: "<svg>Generated preview</svg>",
				metadata: { theme: "default" },
			})

			// Mock FaviconExtractor
			const faviconExtractor = new FaviconExtractor({
				includeMultipleSizes: false,
			})
			const faviconSpy = vi.spyOn(
				faviconExtractor as any,
				"fetchFaviconFromURL",
			)
			faviconSpy.mockRejectedValue(new Error("No favicon"))

			// Test fallback sequence
			const imageResult = await imageExtractor.extractImages(documentInput)
			const svgResult = await svgGenerator.generatePreview(documentInput)
			const faviconResult = await faviconExtractor.extractFavicon(
				documentInput.url!,
			)

			expect(imageResult.success).toBe(true)
			expect(svgResult.success).toBe(true)
			expect(faviconResult.success).toBe(true) // Empty result is still success
		})
	})

	describe("Error Handling", () => {
		it("should handle network timeouts", async () => {
			const extractor = new FaviconExtractor({})

			const extractSpy = vi.spyOn(extractor as any, "fetchFaviconFromURL")
			extractSpy.mockImplementation(
				() =>
					new Promise((_, reject) =>
						setTimeout(() => reject(new Error("Timeout")), 100),
					),
			)

			const result = await extractor.extractFavicon("https://slow-site.com")

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("EXTRACTION_FAILED")
		})

		it("should handle invalid image URLs", async () => {
			const extractor = new ImageExtractor({})

			const documentInput = {
				id: "doc-1",
				content: "Document",
				images: [{ url: "invalid-url", alt: "Invalid" }],
			}

			const extractSpy = vi.spyOn(extractor as any, "extractImagesFromDocument")
			extractSpy.mockRejectedValue(new Error("Invalid URL"))

			const result = await extractor.extractImages(documentInput)

			expect(result.success).toBe(false)
		})

		it("should handle corrupted SVG generation", async () => {
			const generator = new SVGGenerator({})

			const documentInput = {
				id: "doc-1",
				title: "Test",
				content: "Content",
			}

			const generateSpy = vi.spyOn(generator as any, "generateSVGFromContent")
			generateSpy.mockRejectedValue(new Error("SVG generation failed"))

			const result = await generator.generatePreview(documentInput)

			expect(result.success).toBe(false)
		})
	})
})
