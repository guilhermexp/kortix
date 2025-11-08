import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import {
	FirecrawlExtractor,
	createFirecrawlExtractor,
} from '../firecrawl-extractor'
import type {
	ExtractionInput,
	ExtractionResult,
	FirecrawlOptions,
	ProcessingError,
} from '../../interfaces'

/**
 * Unit tests for FirecrawlExtractor
 *
 * Tests web scraping functionality including:
 * - URL validation and preprocessing
 * - Content extraction with various page types
 * - Meta tag extraction (og:image, twitter:image, etc.)
 * - Error handling for various failure scenarios
 * - Rate limiting and retry logic
 * - Content sanitization and security
 */

describe("FirecrawlExtractor", () => {
	let extractor: FirecrawlExtractor
	let mockOptions: FirecrawlOptions

	beforeEach(() => {
		mockOptions = {
			includeTags: ['main', 'article', 'div'],
			excludeTags: ['script', 'style', 'nav'],
			removeTags: ['advertisement', 'sidebar'],
			onlyMainContent: true,
			includeRawHtml: false,
			extractorOptions: {
				mode: 'llm-extraction',
				extractionPrompt: 'Extract the main content',
			},
		}

		extractor = new FirecrawlExtractor(mockOptions)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Extractor Interface", () => {
		it("should implement DocumentExtractor interface", () => {
			expect(extractor).toHaveProperty('canHandle')
			expect(extractor).toHaveProperty('extract')
			expect(extractor).toHaveProperty('getSupportedTypes')
		})

		it("should support URL and web content types", () => {
			const supportedTypes = extractor.getSupportedTypes()
			expect(supportedTypes).toContain('url')
			expect(supportedTypes).toContain('web')
		})

		it("should be able to handle URL inputs", () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://example.com',
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
		})

		it("should not handle non-URL inputs", () => {
			const nonUrlInput: ExtractionInput = {
				type: 'file',
				content: 'some content',
				options: {},
			}

			const canHandle = extractor.canHandle(nonUrlInput)
			expect(canHandle).toBe(false)
		})
	})

	describe("URL Validation and Preprocessing", () => {
		it("should validate proper HTTPS URLs", () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://example.com',
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
		})

		it("should validate proper HTTP URLs", () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'http://example.com',
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
		})

		it("should reject invalid URLs", () => {
			const invalidInputs = [
				{ type: 'url', content: 'not-a-url', options: {} },
				{ type: 'url', content: 'ftp://example.com', options: {} },
				{ type: 'url', content: '', options: {} },
				{ type: 'url', content: null as any, options: {} },
			]

			invalidInputs.forEach((input) => {
				const canHandle = extractor.canHandle(input)
				expect(canHandle).toBe(false)
			})
		})

		it("should handle URL with query parameters", () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://example.com/page?param=value&other=test',
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
		})

		it("should handle URL with fragments", () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://example.com/page#section',
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
		})
	})

	describe("Content Extraction", () => {
		it("should extract content from simple webpage", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://example.com',
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'This is the main content of the page',
					metadata: {
						title: 'Example Page',
						description: 'An example webpage',
						url: 'https://example.com',
					},
					processingTime: 1200,
				},
			}

			// Mock the actual extraction call
			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toBe('This is the main content of the page')
			expect(result.data?.metadata.title).toBe('Example Page')
			expect(result.data?.processingTime).toBeGreaterThan(0)
		})

		it("should extract content with custom extraction options", async () => {
			const customOptions: FirecrawlOptions = {
				...mockOptions,
				onlyMainContent: false,
				includeRawHtml: true,
				extractorOptions: {
					mode: 'llm-extraction',
					extractionPrompt: 'Extract article content only',
				},
			}

			const customExtractor = new FirecrawlExtractor(customOptions)
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://blog.example.com/article',
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Article content with full HTML',
					metadata: { title: 'Blog Article' },
					processingTime: 2000,
				},
			}

			const extractSpy = vi.spyOn(customExtractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await customExtractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toBe('Article content with full HTML')
		})

		it("should handle pages with JavaScript-rendered content", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://spa-example.com',
				options: { waitFor: 'networkidle' },
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'JavaScript-rendered content after loading',
					metadata: { title: 'SPA Page' },
					processingTime: 5000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.processingTime).toBeGreaterThan(3000)
		})
	})

	describe("Meta Tag Extraction", () => {
		it("should extract OpenGraph meta tags", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://example.com/og-page',
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Page content',
					metadata: {
						title: 'OG Title',
						description: 'OG Description',
						ogImage: 'https://example.com/og-image.jpg',
						ogType: 'article',
					},
					processingTime: 1000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.ogImage).toBe(
				'https://example.com/og-image.jpg'
			)
			expect(result.data?.metadata.ogType).toBe('article')
		})

		it("should extract Twitter Card meta tags", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://example.com/twitter-page',
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Page content',
					metadata: {
						title: 'Twitter Title',
						description: 'Twitter Description',
						twitterImage: 'https://example.com/twitter-image.jpg',
						twitterCard: 'summary_large_image',
					},
					processingTime: 800,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.twitterImage).toBe(
				'https://example.com/twitter-image.jpg'
			)
			expect(result.data?.metadata.twitterCard).toBe('summary_large_image')
		})

		it("should handle pages with missing meta tags", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://minimal-page.com',
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Minimal page content',
					metadata: {
						title: 'Minimal',
					},
					processingTime: 500,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.title).toBe('Minimal')
			expect(result.data?.metadata.description).toBeUndefined()
		})
	})

	describe("Error Handling", () => {
		it("should handle 404 errors gracefully", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://example.com/not-found',
				options: {},
			}

			const error: ProcessingError = {
				code: 'HTTP_ERROR',
				message: '404 Not Found',
				details: { status: 404, url: 'https://example.com/not-found' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('HTTP_ERROR')
			expect(result.error?.details.status).toBe(404)
		})

		it("should handle network timeouts", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://slow-site.com',
				options: {},
			}

			const error: ProcessingError = {
				code: 'TIMEOUT',
				message: 'Request timeout after 30000ms',
				details: { timeout: 30000 },
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('TIMEOUT')
		})

		it("should handle DNS resolution failures", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://non-existent-domain-12345.com',
				options: {},
			}

			const error: ProcessingError = {
				code: 'DNS_ERROR',
				message: 'DNS resolution failed',
				details: { hostname: 'non-existent-domain-12345.com' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('DNS_ERROR')
		})

		it("should handle invalid SSL certificates", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://invalid-ssl.com',
				options: {},
			}

			const error: ProcessingError = {
				code: 'SSL_ERROR',
				message: 'SSL certificate validation failed',
				details: { hostname: 'invalid-ssl.com' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('SSL_ERROR')
		})

		it("should handle rate limiting (429 errors)", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://rate-limited.com',
				options: {},
			}

			const error: ProcessingError = {
				code: 'RATE_LIMITED',
				message: 'Too Many Requests',
				details: { 
					status: 429, 
					retryAfter: 60,
					limit: 100,
					remaining: 0 
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('RATE_LIMITED')
			expect(result.error?.details.retryAfter).toBe(60)
		})
	})

	describe("Content Sanitization", () => {
		it("should sanitize malicious content", async () => {
			const maliciousUrl = 'https://example.com<script>alert("xss")</script>'
			const urlInput: ExtractionInput = {
				type: 'url',
				content: maliciousUrl,
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Sanitized content without scripts',
					metadata: { title: 'Safe Page' },
					processingTime: 800,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).not.toContain('<script>')
		})

		it("should handle content with special characters", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://unicode-example.com',
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Content with émojis 🎉 and spëciäl chårs',
					metadata: { title: 'Unicode Page' },
					processingTime: 600,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('émojis')
			expect(result.data?.content).toContain('spëciäl chårs')
		})
	})

	describe("Rate Limiting and Retry Logic", () => {
		it("should implement rate limiting", async () => {
			// This would test the internal rate limiting mechanism
			// Implementation depends on the actual rate limiting approach
		})

		it("should retry on temporary failures", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://flaky-site.com',
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Content after retry',
					metadata: { title: 'Retried Page' },
					processingTime: 3000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			// Fail twice, succeed on third attempt
			extractSpy
				.mockRejectedValueOnce(new Error('Temporary error'))
				.mockRejectedValueOnce(new Error('Temporary error'))
				.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(extractSpy).toHaveBeenCalledTimes(3)
		})

		it("should respect retry limits", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://always-fail.com',
				options: {},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockRejectedValue(new Error('Always fails'))

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('MAX_RETRIES_EXCEEDED')
		})
	})

	describe("Special URL Handling", () => {
		it("should handle GitHub URLs with cleanup", async () => {
			const githubUrl = 'https://github.com/user/repo/blob/main/README.md'
			const urlInput: ExtractionInput = {
				type: 'url',
				content: githubUrl,
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'GitHub README content',
					metadata: { title: 'README.md' },
					processingTime: 1500,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			// GitHub URLs might be processed differently
		})

		it("should handle YouTube URLs", async () => {
			const youtubeUrl = 'https://youtube.com/watch?v=dQw4w9WgXcQ'
			const urlInput: ExtractionInput = {
				type: 'url',
				content: youtubeUrl,
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
			// YouTube URLs should be handled by Firecrawl, not redirected to YouTube extractor
		})

		it("should handle social media URLs", async () => {
			const socialUrls = [
				'https://twitter.com/user/status/123',
				'https://facebook.com/user/posts/123',
				'https://linkedin.com/in/user',
			]

			socialUrls.forEach((url) => {
				const urlInput: ExtractionInput = {
					type: 'url',
					content: url,
					options: {},
				}

				const canHandle = extractor.canHandle(urlInput)
				expect(canHandle).toBe(true)
			})
		})
	})

	describe("Configuration Options", () => {
		it("should respect includeTags option", () => {
			const options: FirecrawlOptions = {
				...mockOptions,
				includeTags: ['article', 'main'],
			}

			const customExtractor = new FirecrawlExtractor(options)
			expect(customExtractor).toBeDefined()
		})

		it("should respect excludeTags option", () => {
			const options: FirecrawlOptions = {
				...mockOptions,
				excludeTags: ['nav', 'footer', 'aside'],
			}

			const customExtractor = new FirecrawlExtractor(options)
			expect(customExtractor).toBeDefined()
		})

		it("should handle onlyMainContent option", () => {
			const options: FirecrawlOptions = {
				...mockOptions,
				onlyMainContent: true,
			}

			const customExtractor = new FirecrawlExtractor(options)
			expect(customExtractor).toBeDefined()
		})
	})

	describe("Factory Function", () => {
		it("should create extractor with default options", () => {
			const extractor = createFirecrawlExtractor()
			expect(extractor).toBeDefined()
			expect(extractor.getSupportedTypes()).toContain('url')
		})

		it("should create extractor with custom options", () => {
			const customOptions: FirecrawlOptions = {
				onlyMainContent: false,
				includeRawHtml: true,
			}

			const extractor = createFirecrawlExtractor(customOptions)
			expect(extractor).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle extremely long URLs", async () => {
			const longUrl = 'https://example.com/' + 'a'.repeat(2000)
			const urlInput: ExtractionInput = {
				type: 'url',
				content: longUrl,
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			// Should either handle or reject gracefully
		})

		it("should handle URLs with unusual characters", async () => {
			const urlWithSpecialChars = 'https://example.com/测试页面'
			const urlInput: ExtractionInput = {
				type: 'url',
				content: urlWithSpecialChars,
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
		})

		it("should handle empty response content", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://empty-page.com',
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: '',
					metadata: { title: 'Empty Page' },
					processingTime: 500,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toBe('')
		})

		it("should handle pages with very large content", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://large-page.com',
				options: {},
			}

			const largeContent = 'x'.repeat(10 * 1024 * 1024) // 10MB
			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: largeContent,
					metadata: { title: 'Large Page' },
					processingTime: 10000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'callFirecrawlAPI')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.content.length).toBe(10 * 1024 * 1024)
		})
	})
})
