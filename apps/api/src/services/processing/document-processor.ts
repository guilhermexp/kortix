/**
 * Document Processor Service
 *
 * Unified service for processing extracted documents.
 * Features:
 * - Orchestrates all processing steps (chunking, embeddings, summary, tags)
 * - Pipeline management with configurable stages
 * - Parallel and sequential processing support
 * - Performance monitoring and optimization
 * - Comprehensive error handling
 * - Progress tracking and reporting
 */

import { BaseService } from "../base/base-service"
import type {
	Chunk,
	ExtractionResult,
	DocumentProcessorService as IDocumentProcessorService,
	ProcessedDocument,
	ProcessingMetrics,
	ProcessingOptions,
	ProcessorServiceConfig,
} from "../interfaces"
import { type ChunkingService, createChunkingService } from "./chunking-service"
import {
	createEmbeddingService,
	type EmbeddingService,
} from "./embedding-service"
import {
	createSummarizationService,
	type SummarizationService,
} from "./summarization-service"
import { createTaggingService, type TaggingService } from "./tagging-service"

// ============================================================================
// Document Processor Service Implementation
// ============================================================================

/**
 * Service that coordinates all document processing steps
 */
export class DocumentProcessorService
	extends BaseService
	implements IDocumentProcessorService
{
	private readonly config: ProcessorServiceConfig
	private chunkingService?: ChunkingService
	private embeddingService?: EmbeddingService
	private summarizationService?: SummarizationService
	private taggingService?: TaggingService

	constructor(config: ProcessorServiceConfig) {
		super("DocumentProcessorService")
		this.config = config
	}

	// ========================================================================
	// Initialization
	// ========================================================================

	protected async onInitialize(): Promise<void> {
		this.logger.info("Initializing document processor service", {
			config: this.config,
		})

		// Initialize processing services
		await this.initializeServices()

		this.logger.info("Document processor service initialized")
	}

	/**
	 * Initialize all processing services
	 */
	private async initializeServices(): Promise<void> {
		// Chunking service
		if (this.config.chunking?.enabled !== false) {
			this.chunkingService = createChunkingService({
				chunkSize: this.config.chunking?.chunkSize,
				chunkOverlap: this.config.chunking?.chunkOverlap,
				respectSentences: this.config.chunking?.respectSentences,
				respectParagraphs: this.config.chunking?.respectParagraphs,
			})
			await this.chunkingService.initialize()
			this.logger.debug("Chunking service initialized")
		}

		// Embedding service
		if (this.config.embedding?.enabled !== false) {
			this.embeddingService = createEmbeddingService({
				provider: this.config.embedding?.provider,
				batchSize: this.config.embedding?.batchSize,
				useCache: this.config.embedding?.useCache,
			})
			await this.embeddingService.initialize()
			this.logger.debug("Embedding service initialized")
		}

		// Summarization service
		if (this.config.summarization?.enabled !== false) {
			this.summarizationService = createSummarizationService({
				provider: this.config.summarization?.provider,
				maxLength: this.config.summarization?.maxLength,
				style: this.config.summarization?.style,
			})
			await this.summarizationService.initialize()
			this.logger.debug("Summarization service initialized")
		}

		// Tagging service
		if (this.config.tagging?.enabled !== false) {
			this.taggingService = createTaggingService({
				maxTags: this.config.tagging?.maxTags,
				locale: this.config.tagging?.locale,
				provider: this.config.tagging?.provider,
			})
			await this.taggingService.initialize()
			this.logger.debug("Tagging service initialized")
		}
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Process extracted document through the full processing pipeline
	 *
	 * Orchestrates the complete document processing workflow:
	 * 1. Chunking - Splits text into manageable chunks
	 * 2. Embedding - Generates vector embeddings for semantic search
	 * 3. Summarization - Creates AI-powered summary (optional)
	 * 4. Tagging - Extracts relevant tags and categories (optional)
	 *
	 * @param extraction - Extracted document content and metadata
	 * @param options - Processing options to control pipeline behavior
	 * @returns Fully processed document with chunks, embeddings, summary, and tags
	 *
	 * @example
	 * ```typescript
	 * // Process with all features
	 * const processed = await processor.process(extractionResult);
	 *
	 * // Process without summary and tags
	 * const processed = await processor.process(extractionResult, {
	 *   skipSummary: true,
	 *   skipTags: true
	 * });
	 *
	 * // Process with custom chunking
	 * const processed = await processor.process(extractionResult, {
	 *   chunkSize: 1000,
	 *   chunkOverlap: 100
	 * });
	 * ```
	 */
	async process(
		extraction: ExtractionResult,
		options?: ProcessingOptions,
	): Promise<ProcessedDocument> {
		this.assertInitialized()
		this.assertServicesRegistered()

		const tracker = this.performanceMonitor.startOperation("process")
		const startTime = Date.now()

		try {
			this.logger.info("Starting document processing", {
				title: extraction.title,
				wordCount: extraction.wordCount,
			})

			// Step 1: Chunking
			const chunks = await this.executeChunking(extraction, options)

			// Step 2: Generate embeddings
			const chunksWithEmbeddings = await this.executeEmbedding(chunks, options)

			// Step 3: Generate summary (optional)
			let summary: string | undefined
			if (!options?.skipSummary) {
				summary = await this.executeSummarization(extraction, options)
			}

			// Step 4: Generate tags (optional)
			let tags: string[] | undefined
			if (!options?.skipTags) {
				tags = await this.executeTagging(extraction, options)
			}

			// Build processed document
			const processed: ProcessedDocument = {
				content: extraction.text,
				chunks: chunksWithEmbeddings,
				summary,
				tags,
				metadata: {
					extractionResult: extraction,
					processingDate: new Date(),
					processingTime: Date.now() - startTime,
					chunkCount: chunksWithEmbeddings.length,
					embeddingDimensions:
						this.embeddingService?.getEmbeddingDimensions() || 0,
				},
			}

			tracker.end(true)

			this.logger.info("Document processing completed", {
				chunkCount: processed.chunks.length,
				hasSummary: !!processed.summary,
				tagCount: processed.tags?.length || 0,
				processingTime: processed.metadata.processingTime,
			})

			return processed
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "process")
		}
	}

	/**
	 * Validate processing options
	 */
	async validateProcessingOptions(options: ProcessingOptions): Promise<void> {
		// Validate chunking options
		if (options.chunkSize !== undefined && this.chunkingService) {
			this.chunkingService.validateChunkConfig({
				chunkSize: options.chunkSize,
				chunkOverlap: options.chunkOverlap,
			})
		}

		// Validate summarization options
		if (options.summaryMaxLength !== undefined && this.summarizationService) {
			this.summarizationService.validateSummarizationOptions({
				maxLength: options.summaryMaxLength,
			})
		}

		// Validate tagging options
		if (options.maxTags !== undefined && this.taggingService) {
			this.taggingService.validateTaggingOptions({
				maxTags: options.maxTags,
			})
		}
	}

	/**
	 * Get service configuration
	 */
	getConfig(): ProcessorServiceConfig {
		return { ...this.config }
	}

	/**
	 * Get processing services
	 */
	getServices(): {
		chunking?: ChunkingService
		embedding?: EmbeddingService
		summarization?: SummarizationService
		tagging?: TaggingService
	} {
		return {
			chunking: this.chunkingService,
			embedding: this.embeddingService,
			summarization: this.summarizationService,
			tagging: this.taggingService,
		}
	}

	// ========================================================================
	// Private Methods - Processing Steps
	// ========================================================================

	/**
	 * Execute chunking step
	 */
	private async executeChunking(
		extraction: ExtractionResult,
		options?: ProcessingOptions,
	): Promise<Chunk[]> {
		if (!this.chunkingService) {
			throw this.createError(
				"SERVICE_NOT_AVAILABLE",
				"Chunking service not initialized",
			)
		}

		const tracker = this.performanceMonitor.startOperation("chunking")

		try {
			this.logger.debug("Executing chunking")

			const chunks = await this.chunkingService.chunk(extraction.text, {
				chunkSize: options?.chunkSize,
				chunkOverlap: options?.chunkOverlap,
				respectSentences: options?.respectSentences,
				respectParagraphs: options?.respectParagraphs,
			})

			tracker.end(true)

			this.logger.debug("Chunking completed", {
				chunkCount: chunks.length,
			})

			return chunks
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "executeChunking")
		}
	}

	/**
	 * Execute embedding generation step
	 */
	private async executeEmbedding(
		chunks: Chunk[],
		options?: ProcessingOptions,
	): Promise<Chunk[]> {
		if (!this.embeddingService) {
			throw this.createError(
				"SERVICE_NOT_AVAILABLE",
				"Embedding service not initialized",
			)
		}

		const tracker = this.performanceMonitor.startOperation("embedding")

		try {
			this.logger.debug("Executing embedding generation")

			const chunksWithEmbeddings =
				await this.embeddingService.generateEmbeddings(chunks)

			tracker.end(true)

			this.logger.debug("Embedding generation completed", {
				chunkCount: chunksWithEmbeddings.length,
			})

			return chunksWithEmbeddings
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "executeEmbedding")
		}
	}

	/**
	 * Execute summarization step
	 */
	private async executeSummarization(
		extraction: ExtractionResult,
		options?: ProcessingOptions,
	): Promise<string> {
		if (!this.summarizationService) {
			throw this.createError(
				"SERVICE_NOT_AVAILABLE",
				"Summarization service not initialized",
			)
		}

		const tracker = this.performanceMonitor.startOperation("summarization")

		try {
			this.logger.debug("Executing summarization")

			const result =
				await this.summarizationService.summarizeExtraction(extraction)

			tracker.end(true)

			this.logger.debug("Summarization completed", {
				summaryLength: result.summary.length,
				quality: result.quality,
			})

			return result.summary
		} catch (error) {
			tracker.end(false)

			// Summarization is non-critical, log error and return fallback
			this.logger.warn("Summarization failed, using fallback", {
				error: (error as Error).message,
			})

			return this.generateFallbackSummary(extraction)
		}
	}

	/**
	 * Execute tagging step
	 */
	private async executeTagging(
		extraction: ExtractionResult,
		options?: ProcessingOptions,
	): Promise<string[]> {
		if (!this.taggingService) {
			throw this.createError(
				"SERVICE_NOT_AVAILABLE",
				"Tagging service not initialized",
			)
		}

		const tracker = this.performanceMonitor.startOperation("tagging")

		try {
			this.logger.debug("Executing tagging")

			const result =
				await this.taggingService.generateTagsFromExtraction(extraction)

			tracker.end(true)

			this.logger.debug("Tagging completed", {
				tagCount: result.tags.length,
				tags: result.tags,
			})

			return result.tags
		} catch (error) {
			tracker.end(false)

			// Tagging is non-critical, log error and return empty array
			this.logger.warn("Tagging failed", {
				error: (error as Error).message,
			})

			return []
		}
	}

	// ========================================================================
	// Private Methods - Fallbacks
	// ========================================================================

	/**
	 * Generate fallback summary when AI fails
	 */
	private generateFallbackSummary(extraction: ExtractionResult): string {
		// Use first few sentences as summary
		const sentences = extraction.text
			.split(/[.!?]+/)
			.map((s) => s.trim())
			.filter((s) => s.length > 20)

		const summary = sentences.slice(0, 3).join(". ")

		return summary.length > 0 ? summary + "." : "No summary available."
	}

	// ========================================================================
	// Private Methods - Validation
	// ========================================================================

	/**
	 * Assert all required services are registered
	 */
	private assertServicesRegistered(): void {
		if (!this.chunkingService) {
			throw this.createError(
				"SERVICE_NOT_REGISTERED",
				"ChunkingService not registered",
			)
		}
		if (!this.embeddingService) {
			throw this.createError(
				"SERVICE_NOT_REGISTERED",
				"EmbeddingService not registered",
			)
		}
		// Summarization and tagging are optional
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Check if all services are healthy
		let healthyCount = 0
		let totalCount = 0

		if (this.chunkingService) {
			totalCount++
			if (await this.chunkingService.healthCheck()) {
				healthyCount++
			}
		}

		if (this.embeddingService) {
			totalCount++
			if (await this.embeddingService.healthCheck()) {
				healthyCount++
			}
		}

		if (this.summarizationService) {
			totalCount++
			if (await this.summarizationService.healthCheck()) {
				healthyCount++
			}
		}

		if (this.taggingService) {
			totalCount++
			if (await this.taggingService.healthCheck()) {
				healthyCount++
			}
		}

		// At least chunking and embedding must be healthy
		const isHealthy = healthyCount >= 2

		this.logger.debug("Service health check", {
			healthy: isHealthy,
			healthyServices: healthyCount,
			totalServices: totalCount,
		})

		return isHealthy
	}

	protected async onCleanup(): Promise<void> {
		this.logger.info("Cleaning up document processor service")

		// Cleanup services
		if (this.chunkingService) {
			await this.chunkingService.cleanup()
		}
		if (this.embeddingService) {
			await this.embeddingService.cleanup()
		}
		if (this.summarizationService) {
			await this.summarizationService.cleanup()
		}
		if (this.taggingService) {
			await this.taggingService.cleanup()
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create document processor service with configuration
 */
export function createDocumentProcessorService(
	config?: Partial<ProcessorServiceConfig>,
): DocumentProcessorService {
	const defaultConfig: ProcessorServiceConfig = {
		chunking: {
			enabled: true,
			chunkSize: 800,
			chunkOverlap: 200,
			respectSentences: true,
			respectParagraphs: true,
		},
		embedding: {
			enabled: true,
			provider: "hybrid",
			batchSize: 10,
			useCache: true,
		},
		summarization: {
			enabled: true,
			provider: "openrouter",
			maxLength: 500,
			style: "concise",
		},
		tagging: {
			enabled: true,
			provider: "openrouter",
			maxTags: 6,
			locale: "en-US",
		},
		pipeline: {
			parallel: false,
			stopOnError: false,
			timeout: 300000, // 5 minutes
		},
		...config,
	}

	return new DocumentProcessorService(defaultConfig)
}
