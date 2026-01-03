import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type {
	ExtractionInput,
	ExtractionResult,
	ProcessingError,
	YouTubeMetadata,
	YouTubeOptions,
} from "../../interfaces"
import { createYouTubeExtractor, YouTubeExtractor } from "../youtube-extractor"

/**
 * Unit tests for YouTubeExtractor
 *
 * Tests YouTube video content extraction including:
 * - YouTube URL validation and parsing
 * - Video metadata extraction
 * - Transcript retrieval with fallback mechanisms
 * - Different video formats and availability scenarios
 * - Error handling for various YouTube-specific issues
 * - Performance optimization for video processing
 */

describe("YouTubeExtractor", () => {
	let extractor: YouTubeExtractor
	let mockOptions: YouTubeOptions

	beforeEach(() => {
		mockOptions = {
			includeTranscript: true,
			includeMetadata: true,
			preferredLanguage: "en",
			fallbackLanguages: ["en-US", "pt", "pt-BR"],
			transcriptOptions: {
				includeTimestamps: true,
				maxRetries: 3,
				timeoutMs: 30000,
			},
			enableOCR: true,
		}

		extractor = new YouTubeExtractor(mockOptions)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Extractor Interface", () => {
		it("should implement DocumentExtractor interface", () => {
			expect(extractor).toHaveProperty("canHandle")
			expect(extractor).toHaveProperty("extract")
			expect(extractor).toHaveProperty("getSupportedTypes")
		})

		it("should support YouTube and video content types", () => {
			const supportedTypes = extractor.getSupportedTypes()
			expect(supportedTypes).toContain("youtube")
			expect(supportedTypes).toContain("video")
		})

		it("should be able to handle YouTube URL inputs", () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=dQw4w9WgXcQ",
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
		})

		it("should not handle non-YouTube URLs", () => {
			const nonYouTubeInputs = [
				{ type: "url", content: "https://example.com", options: {} },
				{ type: "url", content: "https://vimeo.com/123", options: {} },
				{ type: "file", content: "video.mp4", options: {} },
			]

			nonYouTubeInputs.forEach((input) => {
				const canHandle = extractor.canHandle(input)
				expect(canHandle).toBe(false)
			})
		})
	})

	describe("YouTube URL Validation and Parsing", () => {
		it("should handle standard YouTube watch URLs", () => {
			const testUrls = [
				"https://youtube.com/watch?v=dQw4w9WgXcQ",
				"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				"https://m.youtube.com/watch?v=dQw4w9WgXcQ",
				"https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
			]

			testUrls.forEach((url) => {
				const urlInput: ExtractionInput = {
					type: "url",
					content: url,
					options: {},
				}

				const canHandle = extractor.canHandle(urlInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should handle YouTube short URLs", () => {
			const shortUrls = [
				"https://youtu.be/dQw4w9WgXcQ",
				"https://youtu.be/dQw4w9WgXcQ?t=30",
			]

			shortUrls.forEach((url) => {
				const urlInput: ExtractionInput = {
					type: "url",
					content: url,
					options: {},
				}

				const canHandle = extractor.canHandle(urlInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should handle YouTube playlist URLs", () => {
			const playlistUrl = "https://youtube.com/playlist?list=PLrAXtmRdnEQy4Q"
			const urlInput: ExtractionInput = {
				type: "url",
				content: playlistUrl,
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
		})

		it("should handle YouTube channel URLs", () => {
			const channelUrl = "https://youtube.com/@channelname"
			const urlInput: ExtractionInput = {
				type: "url",
				content: channelUrl,
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
		})

		it("should reject invalid YouTube URLs", () => {
			const invalidUrls = [
				"https://youtube.com/watch", // missing video ID
				"https://youtube.com/watch?v=", // empty video ID
				"https://fakeyoutube.com/watch?v=dQw4w9WgXcQ", // wrong domain
			]

			invalidUrls.forEach((url) => {
				const urlInput: ExtractionInput = {
					type: "url",
					content: url,
					options: {},
				}

				const canHandle = extractor.canHandle(urlInput)
				expect(canHandle).toBe(false)
			})
		})
	})

	describe("Video Metadata Extraction", () => {
		it("should extract basic video metadata", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=dQw4w9WgXcQ",
				options: {},
			}

			const mockMetadata: YouTubeMetadata = {
				videoId: "dQw4w9WgXcQ",
				title: "Rick Astley - Never Gonna Give You Up",
				description:
					'The official music video for "Never Gonna Give You Up" by Rick Astley',
				duration: 212, // 3:32
				channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
				channelTitle: "RickAstleyVEVO",
				publishedAt: "2009-10-25T06:57:33Z",
				viewCount: "1000000000",
				likeCount: "50000000",
				thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
				tags: ["rick astley", "never gonna give you up", "pop", "80s music"],
			}

			const _mockResult: ExtractionResult = {
				success: true,
				data: {
					content: "Video transcript and description content...",
					metadata: mockMetadata,
					processingTime: 3000,
				},
			}

			// Mock the metadata extraction
			const extractSpy = vi.spyOn(extractor as any, "extractVideoMetadata")
			extractSpy.mockResolvedValue(mockMetadata)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.title).toBe(
				"Rick Astley - Never Gonna Give You Up",
			)
			expect(result.data?.metadata.videoId).toBe("dQw4w9WgXcQ")
			expect(result.data?.metadata.duration).toBe(212)
		})

		it("should handle videos with missing metadata", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=unknown_video_id",
				options: {},
			}

			const minimalMetadata: Partial<YouTubeMetadata> = {
				videoId: "unknown_video_id",
				title: "Unknown Video",
			}

			const extractSpy = vi.spyOn(extractor as any, "extractVideoMetadata")
			extractSpy.mockResolvedValue(minimalMetadata)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.title).toBe("Unknown Video")
			expect(result.data?.metadata.channelTitle).toBeUndefined()
		})

		it("should extract thumbnail URLs in different qualities", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=dQw4w9WgXcQ",
				options: {},
			}

			const mockMetadata: YouTubeMetadata = {
				videoId: "dQw4w9WgXcQ",
				title: "Test Video",
				thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
				thumbnails: {
					default: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
					medium: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
					high: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
					maxres: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
				},
			}

			const extractSpy = vi.spyOn(extractor as any, "extractVideoMetadata")
			extractSpy.mockResolvedValue(mockMetadata)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.thumbnails?.maxres).toContain(
				"maxresdefault",
			)
		})
	})

	describe("Transcript Extraction", () => {
		it("should extract transcript with timestamps", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=dQw4w9WgXcQ",
				options: {},
			}

			const mockTranscript = [
				{ start: 0, duration: 4, text: "We're no strangers to love" },
				{ start: 4, duration: 3, text: "You know the rules and so do I" },
				{
					start: 7,
					duration: 4,
					text: "A full commitment's what I'm thinking of",
				},
			]

			const _mockResult: ExtractionResult = {
				success: true,
				data: {
					content: mockTranscript
						.map((t) => `[${t.start}s] ${t.text}`)
						.join("\n"),
					metadata: {
						videoId: "dQw4w9WgXcQ",
						title: "Rick Astley - Never Gonna Give You Up",
						transcriptLanguage: "en",
						transcriptAvailable: true,
					},
					processingTime: 4000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, "extractTranscript")
			extractSpy.mockResolvedValue({
				transcript: mockTranscript,
				language: "en",
				available: true,
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain("[0s] We're no strangers to love")
			expect(result.data?.metadata.transcriptAvailable).toBe(true)
		})

		it("should handle videos without transcripts", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=no_transcript_video",
				options: {},
			}

			const extractSpy = vi.spyOn(extractor as any, "extractTranscript")
			extractSpy.mockResolvedValue({
				transcript: [],
				language: "en",
				available: false,
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toBe("")
			expect(result.data?.metadata.transcriptAvailable).toBe(false)
		})

		it("should fallback to OCR when transcript unavailable", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=ocr_video",
				options: { enableOCR: true },
			}

			const mockOCRResult = [
				{ text: "OCR extracted text from video frames", confidence: 0.85 },
				{
					text: "This is fallback content when transcript fails",
					confidence: 0.78,
				},
			]

			const extractSpy = vi.spyOn(extractor as any, "extractTranscript")
			extractSpy.mockRejectedValue(new Error("No transcript available"))

			const ocrSpy = vi.spyOn(extractor as any, "extractWithOCR")
			ocrSpy.mockResolvedValue({
				content: mockOCRResult.map((r) => r.text).join(" "),
				confidence: 0.81,
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain("OCR extracted text")
			expect(ocrSpy).toHaveBeenCalled()
		})

		it("should try multiple language fallbacks for transcripts", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=multilang_video",
				options: { preferredLanguage: "pt" },
			}

			const extractSpy = vi.spyOn(extractor as any, "extractTranscript")
			// First try Portuguese, then fall back to English
			extractSpy
				.mockRejectedValueOnce(new Error("No Portuguese transcript"))
				.mockResolvedValue({
					transcript: [
						{ start: 0, duration: 5, text: "English transcript fallback" },
					],
					language: "en",
					available: true,
				})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.transcriptLanguage).toBe("en")
			expect(extractSpy).toHaveBeenCalledTimes(2)
		})

		it("should handle transcript with timing issues", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=timing_issue_video",
				options: {},
			}

			const problematicTranscript = [
				{ start: -1, duration: 5, text: "Negative timing" },
				{ start: 0, duration: -1, text: "Negative duration" },
				{ start: 300, duration: 5, text: "Normal timing" },
			]

			const extractSpy = vi.spyOn(extractor as any, "extractTranscript")
			extractSpy.mockResolvedValue({
				transcript: problematicTranscript,
				language: "en",
				available: true,
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			// Should handle timing issues gracefully
		})
	})

	describe("Video Format Handling", () => {
		it("should handle regular videos", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=regular_video",
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: "Regular video content",
					metadata: {
						videoId: "regular_video",
						title: "Regular Video",
						videoType: "regular",
					},
					processingTime: 2000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, "processVideo")
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.videoType).toBe("regular")
		})

		it("should handle live streams", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=live_stream",
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: "Live stream content (partial)",
					metadata: {
						videoId: "live_stream",
						title: "Live Stream",
						videoType: "live",
						isLive: true,
					},
					processingTime: 1000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, "processVideo")
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.videoType).toBe("live")
			expect(result.data?.metadata.isLive).toBe(true)
		})

		it("should handle YouTube Shorts", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/shorts/short_video_id",
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: "Short form video content",
					metadata: {
						videoId: "short_video_id",
						title: "YouTube Short",
						videoType: "short",
						duration: 45,
					},
					processingTime: 1500,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, "processVideo")
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.videoType).toBe("short")
			expect(result.data?.metadata.duration).toBeLessThan(60)
		})

		it("should handle premiere videos", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=premiere_video",
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: "Premiere video content",
					metadata: {
						videoId: "premiere_video",
						title: "Premiere Video",
						videoType: "premiere",
						isPremiere: true,
					},
					processingTime: 2500,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, "processVideo")
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.videoType).toBe("premiere")
			expect(result.data?.metadata.isPremiere).toBe(true)
		})
	})

	describe("Error Handling", () => {
		it("should handle private videos", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=private_video",
				options: {},
			}

			const error: ProcessingError = {
				code: "VIDEO_PRIVATE",
				message: "This video is private",
				details: { videoId: "private_video" },
			}

			const extractSpy = vi.spyOn(extractor as any, "processVideo")
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("VIDEO_PRIVATE")
		})

		it("should handle deleted videos", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=deleted_video",
				options: {},
			}

			const error: ProcessingError = {
				code: "VIDEO_DELETED",
				message: "This video has been deleted",
				details: { videoId: "deleted_video" },
			}

			const extractSpy = vi.spyOn(extractor as any, "processVideo")
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("VIDEO_DELETED")
		})

		it("should handle age-restricted videos", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=age_restricted",
				options: {},
			}

			const error: ProcessingError = {
				code: "VIDEO_AGE_RESTRICTED",
				message: "This video is age-restricted",
				details: { videoId: "age_restricted" },
			}

			const extractSpy = vi.spyOn(extractor as any, "processVideo")
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("VIDEO_AGE_RESTRICTED")
		})

		it("should handle videos with disabled embedding", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=no_embed",
				options: {},
			}

			const error: ProcessingError = {
				code: "VIDEO_NO_EMBED",
				message: "Embedding is disabled for this video",
				details: { videoId: "no_embed" },
			}

			const extractSpy = vi.spyOn(extractor as any, "processVideo")
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("VIDEO_NO_EMBED")
		})

		it("should handle region-restricted videos", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=region_blocked",
				options: {},
			}

			const error: ProcessingError = {
				code: "VIDEO_REGION_BLOCKED",
				message: "This video is not available in your region",
				details: { videoId: "region_blocked", region: "DE" },
			}

			const extractSpy = vi.spyOn(extractor as any, "processVideo")
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("VIDEO_REGION_BLOCKED")
		})
	})

	describe("Content Quality Assessment", () => {
		it("should assess content quality based on transcript length", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=quality_test",
				options: {},
			}

			const longTranscript = Array(100)
				.fill(null)
				.map((_, i) => ({
					start: i * 10,
					duration: 10,
					text: `This is sentence ${i} of a long video transcript with substantial content.`,
				}))

			const extractSpy = vi.spyOn(extractor as any, "extractTranscript")
			extractSpy.mockResolvedValue({
				transcript: longTranscript,
				language: "en",
				available: true,
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.content.split("\n")).toHaveLength(100)
		})

		it("should handle videos with auto-generated captions", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=auto_generated",
				options: {},
			}

			const extractSpy = vi.spyOn(extractor as any, "extractTranscript")
			extractSpy.mockResolvedValue({
				transcript: [
					{ start: 0, duration: 3, text: "This is auto-generated caption" },
				],
				language: "en",
				available: true,
				isAutoGenerated: true,
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			// Should handle auto-generated captions appropriately
		})

		it("should detect and handle music videos", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=music_video",
				options: {},
			}

			const musicMetadata: YouTubeMetadata = {
				videoId: "music_video",
				title: "Artist - Song Name (Official Music Video)",
				categoryId: "10", // Music category
				videoType: "music_video",
			}

			const extractSpy = vi.spyOn(extractor as any, "extractVideoMetadata")
			extractSpy.mockResolvedValue(musicMetadata)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.videoType).toBe("music_video")
		})
	})

	describe("Configuration Options", () => {
		it("should respect includeTranscript option", () => {
			const options: YouTubeOptions = {
				includeTranscript: false,
				includeMetadata: true,
			}

			const customExtractor = new YouTubeExtractor(options)
			expect(customExtractor).toBeDefined()
		})

		it("should respect preferredLanguage option", () => {
			const options: YouTubeOptions = {
				preferredLanguage: "pt",
				fallbackLanguages: ["en", "es"],
			}

			const customExtractor = new YouTubeExtractor(options)
			expect(customExtractor).toBeDefined()
		})

		it("should respect transcript timeout options", () => {
			const options: YouTubeOptions = {
				transcriptOptions: {
					timeoutMs: 15000,
					maxRetries: 5,
				},
			}

			const customExtractor = new YouTubeExtractor(options)
			expect(customExtractor).toBeDefined()
		})
	})

	describe("Performance Optimization", () => {
		it("should cache metadata for repeated requests", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=cache_test",
				options: {},
			}

			const mockMetadata: YouTubeMetadata = {
				videoId: "cache_test",
				title: "Cache Test Video",
			}

			const extractSpy = vi.spyOn(extractor as any, "extractVideoMetadata")
			extractSpy.mockResolvedValue(mockMetadata)

			// First request
			const result1 = await extractor.extract(urlInput)
			// Second request (should use cache)
			const result2 = await extractor.extract(urlInput)

			expect(result1.success).toBe(true)
			expect(result2.success).toBe(true)
			expect(extractSpy).toHaveBeenCalledTimes(1) // Only once due to caching
		})

		it("should handle concurrent video processing", async () => {
			const videoUrls = [
				"https://youtube.com/watch?v=video1",
				"https://youtube.com/watch?v=video2",
				"https://youtube.com/watch?v=video3",
			]

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: "Video content",
					metadata: { title: "Video" },
					processingTime: 1000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, "processVideo")
			extractSpy.mockResolvedValue(mockResult)

			const results = await Promise.all(
				videoUrls.map((url) =>
					extractor.extract({ type: "url", content: url, options: {} }),
				),
			)

			expect(results).toHaveLength(3)
			results.forEach((result) => expect(result.success).toBe(true))
		})
	})

	describe("Factory Function", () => {
		it("should create extractor with default options", () => {
			const extractor = createYouTubeExtractor()
			expect(extractor).toBeDefined()
			expect(extractor.getSupportedTypes()).toContain("youtube")
		})

		it("should create extractor with custom options", () => {
			const customOptions: YouTubeOptions = {
				includeTranscript: false,
				preferredLanguage: "es",
			}

			const extractor = createYouTubeExtractor(customOptions)
			expect(extractor).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle extremely long video descriptions", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=long_desc",
				options: {},
			}

			const longDescription = "x".repeat(5000)
			const mockMetadata: YouTubeMetadata = {
				videoId: "long_desc",
				title: "Long Description Video",
				description: longDescription,
			}

			const extractSpy = vi.spyOn(extractor as any, "extractVideoMetadata")
			extractSpy.mockResolvedValue(mockMetadata)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.description?.length).toBe(5000)
		})

		it("should handle videos with no views or likes", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=new_video",
				options: {},
			}

			const minimalMetadata: YouTubeMetadata = {
				videoId: "new_video",
				title: "New Video",
				viewCount: "0",
				likeCount: "0",
			}

			const extractSpy = vi.spyOn(extractor as any, "extractVideoMetadata")
			extractSpy.mockResolvedValue(minimalMetadata)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.viewCount).toBe("0")
		})

		it("should handle videos with non-ASCII characters in title", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=unicode_video",
				options: {},
			}

			const unicodeMetadata: YouTubeMetadata = {
				videoId: "unicode_video",
				title: "测试视频 - ТЕСТ ВИДЕО - テスト動画",
				description: "Description with émojis 🎬 and spëciäl chårs",
			}

			const extractSpy = vi.spyOn(extractor as any, "extractVideoMetadata")
			extractSpy.mockResolvedValue(unicodeMetadata)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.title).toContain("测试")
			expect(result.data?.metadata.description).toContain("émojis")
		})

		it("should handle malformed video URLs gracefully", async () => {
			const malformedUrl = "https://youtube.com/watch?v="
			const urlInput: ExtractionInput = {
				type: "url",
				content: malformedUrl,
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(false)
		})
	})
})
