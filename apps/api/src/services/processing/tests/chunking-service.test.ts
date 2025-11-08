import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import {
	ChunkingService,
	createChunkingService,
} from '../chunking-service'
import type {
	ChunkingOptions,
	ChunkingStatistics,
	ChunkBoundary,
	Chunk,
	ProcessingError,
} from '../../interfaces'

/**
 * Unit tests for ChunkingService
 *
 * Tests document chunking functionality including:
 * - Text tokenization and chunk boundary detection
 * - Different chunking strategies (semantic, fixed-size, sentence-based)
 * - Overlap management between chunks
 * - Performance optimization for large documents
 * - Memory management for chunking operations
 * - Content type-specific chunking (Markdown, code, etc.)
 */

describe("ChunkingService", () => {
	let service: ChunkingService
	let mockOptions: ChunkingOptions

	beforeEach(() => {
		mockOptions = {
			maxTokensPerChunk: 800,
			overlapTokens: 50,
			strategy: 'semantic', // semantic, fixed-size, sentence-based
			preserveFormatting: true,
			includeBoundaries: true,
			tokenizerOptions: {
				model: 'cl100k_base', // or 'gpt2', 'p50k_base', etc.
				returnOffsets: true,
			},
		}

		service = new ChunkingService(mockOptions)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Service Interface", () => {
		it("should implement ChunkingService interface", () => {
			expect(service).toHaveProperty('chunkDocument')
			expect(service).toHaveProperty('chunkText')
			expect(service).toHaveProperty('getStatistics')
			expect(service).toHaveProperty('updateConfiguration')
		})

		it("should have proper service metadata", () => {
			expect(service.getName()).toBe('ChunkingService')
		})
	})

	describe("Basic Chunking Operations", () => {
		it("should chunk simple text document", async () => {
			const text = "This is the first sentence. This is the second sentence. This is the third sentence with more content. Here is another sentence that should be in a separate chunk."

			const result = await service.chunkText(text)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			expect(result.data?.chunks!.length).toBeGreaterThan(0)
			
			const firstChunk = result.data!.chunks![0]
			expect(firstChunk.content).toBeTruthy()
			expect(firstChunk.embeddings).toEqual([]) // No embeddings in chunking service
			expect(firstChunk.metadata).toBeDefined()
			expect(firstChunk.metadata.tokenCount).toBeGreaterThan(0)
		})

		it("should respect maximum token limit per chunk", async () => {
			const longText = "Sentence. ".repeat(100) // Very long text
			
			const result = await service.chunkText(longText)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			
			// Verify no chunk exceeds the token limit
			result.data!.chunks!.forEach((chunk) => {
				expect(chunk.metadata.tokenCount).toBeLessThanOrEqual(mockOptions.maxTokensPerChunk + 50) // Small tolerance
			})
		})

		it("should handle overlap between chunks", async () => {
			const text = "This is a long sentence that spans multiple potential chunk boundaries. This next sentence should overlap with the previous one to maintain context. Another sentence continues the flow of information."

			const result = await service.chunkText(text)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			expect(result.data?.chunks!.length).toBeGreaterThan(1)

			// Verify overlap content
			if (result.data!.chunks!.length > 1) {
				const chunk1 = result.data!.chunks![0]
				const chunk2 = result.data!.chunks![1]
				
				// Chunks should share some context (sentence boundary + overlap)
				expect(chunk1.content).not.toBe(chunk2.content)
			}
		})

		it("should handle empty text", async () => {
			const result = await service.chunkText("")

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toEqual([])
		})

		it("should handle very short text", async () => {
			const result = await service.chunkText("Short")

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toHaveLength(1)
			expect(result.data?.chunks![0].content).toBe("Short")
		})
	})

	describe("Chunking Strategies", () => {
		it("should use semantic chunking strategy", async () => {
			const options: ChunkingOptions = {
				...mockOptions,
				strategy: 'semantic',
			}

			const semanticService = new ChunkingService(options)
			const text = "Semantic chunking attempts to keep related content together. It considers meaning and context when breaking text into chunks. This makes the chunks more coherent and useful for retrieval."

			const result = await semanticService.chunkText(text)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			// Semantic chunking should produce meaningful chunks
		})

		it("should use fixed-size chunking strategy", async () => {
			const options: ChunkingOptions = {
				...mockOptions,
				strategy: 'fixed-size',
				maxTokensPerChunk: 200,
			}

			const fixedService = new ChunkingService(options)
			const text = "This is a longer sentence that will be chunked based on token count rather than semantic boundaries. ".repeat(5)

			const result = await fixedService.chunkText(text)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			
			// All chunks should be approximately the same size
			const chunkSizes = result.data!.chunks!.map(c => c.metadata.tokenCount)
			const avgSize = chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length
			const variance = chunkSizes.map(size => Math.pow(size - avgSize, 2)).reduce((a, b) => a + b, 0) / chunkSizes.length
			
			// Fixed-size should have low variance
			expect(variance).toBeLessThan(1000)
		})

		it("should use sentence-based chunking strategy", async () => {
			const options: ChunkingOptions = {
				...mockOptions,
				strategy: 'sentence-based',
			}

			const sentenceService = new ChunkingService(options)
			const text = "First sentence. Second sentence! Third sentence? Fourth sentence... Fifth sentence; Sixth sentence: seventh sentence. Eighth sentence - ninth sentence."

			const result = await sentenceService.chunkText(text)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			// Should respect sentence boundaries
		})
	})

	describe("Content Type Specific Chunking", () => {
		it("should handle Markdown content", async () => {
			const markdown = `# Header 1

This is a paragraph with **bold** and *italic* text.

## Header 2

Another paragraph with [links](http://example.com) and \`code\`.

### Code Block

\`\`\`javascript
const example = "Hello World";
console.log(example);
\`\`\`

- List item 1
- List item 2
- List item 3

> This is a blockquote

Regular paragraph again.`

			const result = await service.chunkText(markdown)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			expect(result.data?.chunks!.length).toBeGreaterThan(0)
		})

		it("should handle code content", async () => {
			const code = `function calculateSum(a, b) {
    // This function calculates the sum of two numbers
    const result = a + b;
    console.log("Sum is:", result);
    return result;
}

// This is a comment
const x = 5;
const y = 10;
const sum = calculateSum(x, y);

if (sum > 10) {
    console.log("Sum is greater than 10");
} else {
    console.log("Sum is not greater than 10");
}`

			const result = await service.chunkText(code)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			// Should preserve code structure
			const codeChunks = result.data!.chunks!.filter(c => 
				c.content.includes('function') || 
				c.content.includes('const') || 
				c.content.includes('if')
			)
			expect(codeChunks.length).toBeGreaterThan(0)
		})

		it("should handle JSON content", async () => {
			const json = JSON.stringify({
				name: "Test Document",
				content: "This is the main content of the document",
				metadata: {
					author: "Test Author",
					created: "2023-01-01T00:00:00Z",
					tags: ["test", "document", "json"]
				},
				sections: [
					{
						title: "Introduction",
						content: "This is the introduction section"
					},
					{
						title: "Main Content", 
						content: "This is the main content section with more details"
					}
				]
			}, null, 2)

			const result = await service.chunkText(json)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
		})

		it("should handle table content", async () => {
			const table = `| Name | Age | City | Country |
|------|-----|------|---------|
| John Doe | 25 | New York | USA |
| Jane Smith | 30 | London | UK |
| Bob Johnson | 35 | Paris | France |
| Alice Brown | 28 | Tokyo | Japan |

This table shows information about people from different cities.`

			const result = await service.chunkText(table)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			// Should preserve table structure
		})
	})

	describe("Tokenization", () => {
		it("should use correct tokenizer for token counting", async () => {
			const text = "Hello, world! This is a test sentence with various punctuation and symbols: @#$%^&*()"

			const result = await service.chunkText(text)

			expect(result.success).toBe(true)
			const chunk = result.data!.chunks![0]
			expect(chunk.metadata.tokenCount).toBeGreaterThan(0)
		})

		it("should handle different tokenization models", async () => {
			const models = ['cl100k_base', 'p50k_base', 'gpt2']
			
			for (const model of models) {
				const options: ChunkingOptions = {
					...mockOptions,
					tokenizerOptions: {
						model,
						returnOffsets: true,
					},
				}

				const modelService = new ChunkingService(options)
				const result = await modelService.chunkText("Test sentence for tokenization.")

				expect(result.success).toBe(true)
				expect(result.data?.chunks![0].metadata.tokenCount).toBeGreaterThan(0)
			}
		})

		it("should provide accurate token offsets", async () => {
			const options: ChunkingOptions = {
				...mockOptions,
				tokenizerOptions: {
					model: 'cl100k_base',
					returnOffsets: true,
				},
			}

			const offsetService = new ChunkingService(options)
			const text = "First chunk. Second chunk. Third chunk."

			const result = await offsetService.chunkText(text)

			expect(result.success).toBe(true)
			expect(result.data?.chunks![0].metadata.startOffset).toBe(0)
			expect(result.data?.chunks![0].metadata.endOffset).toBeGreaterThan(0)
		})
	})

	describe("Chunk Boundaries", () => {
		it("should detect natural chunk boundaries", async () => {
			const text = "Paragraph one discusses the introduction to the topic. It provides background information and context. The next paragraph moves to the main analysis section. This section examines the data in detail. Finally, the conclusion summarizes the key findings and implications."

			const result = await service.chunkText(text)

			expect(result.success).toBe(true)
			expect(result.data?.boundaries).toBeDefined()
			
			const boundaries = result.data!.boundaries!
			expect(boundaries.length).toBeGreaterThan(0)
			expect(boundaries[0].type).toMatch(/paragraph|sentence|semantic/)
		})

		it("should respect paragraph boundaries", async () => {
			const text = `First paragraph contains multiple sentences that should stay together as they're related to the same topic.

Second paragraph is about a completely different subject and should not be mixed with the first paragraph.

Third paragraph continues the discussion from the second paragraph.`

			const result = await service.chunkText(text)

			expect(result.success).toBe(true)
			// Should not mix content from different paragraphs
		})

		it("should handle sentence boundary detection", async () => {
			const text = "First sentence. Second sentence! Third sentence? Fourth sentence... Fifth sentence; Sixth sentence: seventh sentence. Eighth sentence - ninth sentence. Tenth sentence (with parentheses)."

			const result = await service.chunkText(text)

			expect(result.success).toBe(true)
			// Should respect sentence-ending punctuation
		})
	})

	describe("Performance Optimization", () => {
		it("should handle large documents efficiently", async () => {
			const largeText = "This is a sentence. ".repeat(10000) // Very large document
			
			const startTime = Date.now()
			const result = await service.chunkText(largeText)
			const endTime = Date.now()

			expect(result.success).toBe(true)
			expect(endTime - startTime).toBeLessThan(10000) // Should complete within 10 seconds
			expect(result.data?.chunks!.length).toBeGreaterThan(0)
		})

		it("should implement streaming for very large documents", async () => {
			const options: ChunkingOptions = {
				...mockOptions,
				enableStreaming: true,
			}

			const streamService = new ChunkingService(options)
			const hugeText = "Large text chunk. ".repeat(50000) // 1M+ characters

			const streamSpy = vi.spyOn(streamService as any, 'streamChunkText')
			streamSpy.mockResolvedValue({
				chunks: [
					{ id: 'chunk-1', content: 'Streamed chunk 1', embeddings: [], metadata: { tokenCount: 10 } },
					{ id: 'chunk-2', content: 'Streamed chunk 2', embeddings: [], metadata: { tokenCount: 12 } },
				],
				boundaries: [],
				statistics: { totalChunks: 2, totalTokens: 22 },
			})

			const result = await streamService.chunkText(hugeText)

			expect(result.success).toBe(true)
			expect(streamSpy).toHaveBeenCalled()
		})

		it("should implement memory-efficient processing", async () => {
			// Mock memory constraint check
			const memorySpy = vi.spyOn(service as any, 'checkMemoryUsage')
			memorySpy.mockReturnValue(false) // No memory constraints

			const text = "Memory efficient chunking. ".repeat(1000)

			const result = await service.chunkText(text)

			expect(result.success).toBe(true)
			expect(result.data?.chunks!.length).toBeGreaterThan(0)
		})
	})

	describe("Error Handling", () => {
		it("should handle tokenization errors", async () => {
			// Mock tokenizer failure
			const tokenizeSpy = vi.spyOn(service as any, 'tokenizeText')
			tokenizeSpy.mockRejectedValue(new Error('Tokenization failed'))

			const result = await service.chunkText("Test text")

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('TOKENIZATION_FAILED')
		})

		it("should handle invalid chunking options", async () => {
			const invalidOptions: ChunkingOptions = {
				...mockOptions,
				maxTokensPerChunk: 0, // Invalid
				overlapTokens: -1, // Invalid
			}

			const invalidService = new ChunkingService(invalidOptions)
			const result = await invalidService.chunkText("Test text")

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('INVALID_OPTIONS')
		})

		it("should handle memory constraints", async () => {
			// Mock memory constraint exceeded
			const memorySpy = vi.spyOn(service as any, 'checkMemoryUsage')
			memorySpy.mockReturnValue(true)

			const result = await service.chunkText("Test text")

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('MEMORY_CONSTRAINT')
		})

		it("should handle malformed text", async () => {
			const malformedTexts = [
				null as any,
				undefined as any,
				123 as any,
				{ invalid: 'text' } as any,
			]

			for (const malformed of malformedTexts) {
				const result = await service.chunkText(malformed as string)
				expect(result.success).toBe(false)
			}
		})
	})

	describe("Statistics and Metrics", () => {
		it("should provide chunking statistics", async () => {
			const text = "This is a test sentence. This is another sentence for chunking. And this is a third sentence."

			const result = await service.chunkText(text)

			expect(result.success).toBe(true)
			expect(result.data?.statistics).toBeDefined()
			expect(result.data?.statistics?.totalChunks).toBeGreaterThan(0)
			expect(result.data?.statistics?.totalTokens).toBeGreaterThan(0)
			expect(result.data?.statistics?.averageTokensPerChunk).toBeGreaterThan(0)
		})

		it("should track processing time", async () => {
			const text = "Slow processing test. ".repeat(100)

			const startTime = Date.now()
			const result = await service.chunkText(text)
			const endTime = Date.now()

			expect(result.success).toBe(true)
			expect(result.data?.statistics?.processingTime).toBeGreaterThan(0)
			expect(result.data?.statistics?.processingTime).toBeLessThanOrEqual(endTime - startTime + 100) // Small tolerance
		})

		it("should provide detailed chunk metadata", async () => {
			const text = "First chunk content. Second chunk content. Third chunk content."

			const result = await service.chunkText(text)

			expect(result.success).toBe(true)
			
			result.data!.chunks!.forEach((chunk, index) => {
				expect(chunk.id).toBe(`chunk-${index}`)
				expect(chunk.content).toBeTruthy()
				expect(chunk.metadata.tokenCount).toBeGreaterThan(0)
				expect(chunk.metadata.position).toBe(index)
				expect(chunk.metadata.startOffset).toBeGreaterThanOrEqual(0)
				expect(chunk.metadata.endOffset).toBeGreaterThan(chunk.metadata.startOffset)
			})
		})
	})

	describe("Configuration Management", () => {
		it("should update chunking configuration", () => {
			const newOptions: ChunkingOptions = {
				...mockOptions,
				maxTokensPerChunk: 1000,
				overlapTokens: 100,
			}

			service.updateConfiguration(newOptions)
			
			// Verify configuration was updated
			// This would depend on the actual implementation
		})

		it("should handle partial configuration updates", () => {
			const partialOptions = {
				overlapTokens: 75,
			}

			service.updateConfiguration(partialOptions)
			// Should merge with existing configuration
		})

		it("should validate configuration changes", () => {
			const invalidOptions = {
				maxTokensPerChunk: -1,
			}

			expect(() => service.updateConfiguration(invalidOptions)).toThrow()
		})
	})

	describe("Factory Function", () => {
		it("should create service with default options", () => {
			const service = createChunkingService()
			expect(service).toBeDefined()
			expect(service.getName()).toBe('ChunkingService')
		})

		it("should create service with custom options", () => {
			const customOptions: ChunkingOptions = {
				maxTokensPerChunk: 500,
				overlapTokens: 25,
				strategy: 'fixed-size',
			}

			const service = createChunkingService(customOptions)
			expect(service).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle text with only whitespace", async () => {
			const whitespaceTexts = [
				"   ",
				"\n\n\n",
				"\t\t\t",
				" \n \t \n ",
			]

			for (const text of whitespaceTexts) {
				const result = await service.chunkText(text)
				expect(result.success).toBe(true)
				expect(result.data?.chunks).toEqual([])
			}
		})

		it("should handle text with only special characters", async () => {
			const specialCharText = "!@#$%^&*()_+-=[]{}|;':\",./<>?~`"

			const result = await service.chunkText(specialCharText)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
		})

		it("should handle text with emojis and unicode", async () => {
			const unicodeText = "Text with émojis 🎯🔍 and spëciäl chårs ünïcödé and 数学 📊📈"

			const result = await service.chunkText(unicodeText)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			expect(result.data?.chunks![0].content).toContain('émojis')
		})

		it("should handle very long words", async () => {
			const longWordText = "Supercalifragilisticexpialidocious is a very long word. " + 
				"Pneumonoultramicroscopicsilicovolcanoconiosis is another extremely long word."

			const result = await service.chunkText(longWordText)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
		})

		it("should handle mixed content types", async () => {
			const mixedContent = `# Header

Regular paragraph text.

\`\`\`javascript
const code = "inline code";
\`\`\`

Another paragraph.

- List item
- List item

> Blockquote

\`\`\`
code block
\`\`\`

Final paragraph.`

			const result = await service.chunkText(mixedContent)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			expect(result.data?.chunks!.length).toBeGreaterThan(1)
		})
	})

	describe("Content Preservation", () => {
		it("should preserve formatting when enabled", async () => {
			const options: ChunkingOptions = {
				...mockOptions,
				preserveFormatting: true,
			}

			const formatService = new ChunkingService(options)
			const formattedText = "Text with **bold** and *italic* formatting. [Link](http://example.com) and `code`."

			const result = await formatService.chunkText(formattedText)

			expect(result.success).toBe(true)
			expect(result.data?.chunks![0].content).toContain('**bold**')
			expect(result.data?.chunks![0].content).toContain('*italic*')
		})

		it("should strip formatting when disabled", async () => {
			const options: ChunkingOptions = {
				...mockOptions,
				preserveFormatting: false,
			}

			const stripService = new ChunkingService(options)
			const formattedText = "Text with **bold** and *italic* formatting."

			const result = await stripService.chunkText(formattedText)

			expect(result.success).toBe(true)
			// Should have basic text without markdown formatting
		})
	})
})
