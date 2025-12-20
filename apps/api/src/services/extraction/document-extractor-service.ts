/**
 * Document Extractor Service
 *
 * Unified service managing all document extractors.
 * Features:
 * - Extractor chain management with priority ordering
 * - Automatic extractor selection based on input type
 * - Fallback mechanism with multiple strategies
 * - Circuit breaker integration for resilience
 * - Comprehensive error handling and logging
 * - Performance monitoring and metrics
 */

import { BaseService } from "../base/base-service"
import type {
	ChainExecutionResult,
	DocumentExtractor,
	ExtractionInput,
	ExtractionResult,
	ExtractorChainConfig,
	ExtractorServiceConfig,
	DocumentExtractorService as IDocumentExtractorService,
	ProcessingError,
} from "../interfaces"
import { CircuitBreaker } from "../orchestration/circuit-breaker"
import { RetryHandler } from "../orchestration/retry-handler"
import { createFileExtractor, FileExtractor } from "./file-extractor"
import { createPDFExtractor, PDFExtractor } from "./pdf-extractor"
import { createURLExtractor, URLExtractor } from "./url-extractor"
import { createYouTubeExtractor, YouTubeExtractor } from "./youtube-extractor"

// ============================================================================
// Document Extractor Service Implementation
// ============================================================================

/**
 * Service that coordinates all document extractors
 */
export class DocumentExtractorService
	extends BaseService
	implements IDocumentExtractorService
{
	private readonly config: ExtractorServiceConfig
	private readonly extractors: Map<string, DocumentExtractor> = new Map()
	private readonly circuitBreakers: Map<string, CircuitBreaker> = new Map()
	private readonly retryHandler: RetryHandler

	constructor(config: ExtractorServiceConfig) {
		super("DocumentExtractorService")
		this.config = config
		this.retryHandler = new RetryHandler()
	}

	// ========================================================================
	// Initialization
	// ========================================================================

	protected async onInitialize(): Promise<void> {
		this.logger.info("Initializing document extractor service", {
			config: this.config,
		})

		// Initialize retry handler
		await this.retryHandler.initialize()

		// Register all extractors
		await this.registerExtractors()

		// Initialize circuit breakers if enabled
		if (this.config.circuitBreaker?.enabled) {
			await this.initializeCircuitBreakers()
		}

		this.logger.info("Document extractor service initialized", {
			extractorCount: this.extractors.size,
		})
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Extract content from input using appropriate extractors
	 *
	 * This method automatically selects and executes the most suitable extractors
	 * for the given input, with automatic fallback to alternative extractors if needed.
	 *
	 * @param input - The extraction input containing content/URL/buffer
	 * @returns Extraction result with text, metadata, and extraction details
	 * @throws {ProcessingError} If no suitable extractor found or all extractors fail
	 *
	 * @example
	 * ```typescript
	 * // Extract from URL
	 * const result = await service.extract({
	 *   url: 'https://example.com',
	 *   type: 'url'
	 * });
	 *
	 * // Extract from PDF buffer
	 * const pdfResult = await service.extract({
	 *   fileBuffer: pdfBuffer,
	 *   fileName: 'document.pdf',
	 *   type: 'pdf'
	 * });
	 * ```
	 */
	async extract(input: ExtractionInput): Promise<ExtractionResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("extract")

		try {
			this.logger.info("Starting extraction", {
				type: input.type,
				url: input.url,
				hasBuffer: !!input.fileBuffer,
			})

			// Get suitable extractors
			const suitableExtractors = this.selectExtractors(input)

			if (suitableExtractors.length === 0) {
				throw this.createError(
					"NO_SUITABLE_EXTRACTOR",
					"No extractor found that can handle this input",
				)
			}

			this.logger.debug("Selected extractors", {
				extractors: suitableExtractors.map((e) => e.constructor.name),
			})

			// Execute extractor chain
			const result = await this.executeExtractorChain(input, suitableExtractors)

			tracker.end(true)

			this.logger.info("Extraction completed", {
				extractor: result.successfulExtractor,
				wordCount: result.result.wordCount,
			})

			return result.result
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "extract")
		}
	}

	/**
	 * Validate extraction input before processing
	 *
	 * Performs validation checks including URL format, file size limits,
	 * and compatibility with available extractors.
	 *
	 * @param input - The extraction input to validate
	 * @throws {ProcessingError} If input is invalid or unsupported
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   await service.validateInput({ url: 'https://example.com', type: 'url' });
	 *   console.log('Input is valid');
	 * } catch (error) {
	 *   console.error('Validation failed:', error.message);
	 * }
	 * ```
	 */
	async validateInput(input: ExtractionInput): Promise<void> {
		// Basic validation
		if (!input.originalContent && !input.url && !input.fileBuffer) {
			throw this.createError(
				"INVALID_INPUT",
				"Input must have at least one of: originalContent, url, or fileBuffer",
			)
		}

		// URL validation
		if (input.url) {
			this.validateUrl(input.url, "url")
		}

		// Buffer validation
		if (input.fileBuffer) {
			if (input.fileBuffer.length === 0) {
				throw this.createError("EMPTY_BUFFER", "File buffer is empty")
			}

			const maxSize = 100 * 1024 * 1024 // 100MB
			if (input.fileBuffer.length > maxSize) {
				throw this.createError(
					"FILE_TOO_LARGE",
					`File size ${input.fileBuffer.length} exceeds maximum of ${maxSize}`,
				)
			}
		}

		// Get suitable extractors and validate with them
		const extractors = this.selectExtractors(input)

		if (extractors.length === 0) {
			throw this.createError(
				"UNSUPPORTED_INPUT",
				"No extractor available for this input type",
			)
		}

		// Validate with first suitable extractor
		await extractors[0].validateInput(input)
	}

	/**
	 * Get all registered extractors
	 *
	 * Returns a copy of the extractor registry for inspection or manual use.
	 *
	 * @returns Map of extractor name to extractor instance
	 *
	 * @example
	 * ```typescript
	 * const extractors = service.getExtractors();
	 * console.log('Available extractors:', Array.from(extractors.keys()));
	 * ```
	 */
	getExtractors(): Map<string, DocumentExtractor> {
		return new Map(this.extractors)
	}

	/**
	 * Get specific extractor by name
	 *
	 * Retrieves a single extractor instance for direct use.
	 *
	 * @param name - Name of the extractor (e.g., 'pdf', 'youtube', 'url')
	 * @returns The extractor instance or undefined if not found
	 *
	 * @example
	 * ```typescript
	 * const pdfExtractor = service.getExtractor('pdf');
	 * if (pdfExtractor) {
	 *   const result = await pdfExtractor.extract(input);
	 * }
	 * ```
	 */
	getExtractor(name: string): DocumentExtractor | undefined {
		return this.extractors.get(name)
	}

	/**
	 * Check if service can handle the given input
	 *
	 * Tests if any registered extractor can process the input.
	 *
	 * @param input - The extraction input to check
	 * @returns True if at least one extractor can handle the input
	 *
	 * @example
	 * ```typescript
	 * if (service.canHandle({ url: 'https://youtube.com/watch?v=abc' })) {
	 *   await service.extract(input);
	 * } else {
	 *   console.log('No suitable extractor available');
	 * }
	 * ```
	 */
	canHandle(input: ExtractionInput): boolean {
		const extractors = this.selectExtractors(input)
		return extractors.length > 0
	}

	// ========================================================================
	// Private Methods - Extractor Management
	// ========================================================================

	/**
	 * Register all configured extractors
	 */
	private async registerExtractors(): Promise<void> {
		// URL extractor (uses MarkItDown)
		if (this.config.url?.enabled !== false) {
			const extractor = createURLExtractor()
			await extractor.initialize()
			this.extractors.set("url", extractor)
			this.logger.debug("Registered URL extractor (MarkItDown)")
		}

		// YouTube extractor
		if (this.config.youtube?.enabled !== false) {
			const extractor = createYouTubeExtractor(
				this.config.youtube?.preferredLanguages,
			)
			await extractor.initialize()
			this.extractors.set("youtube", extractor)
			this.logger.debug("Registered YouTube extractor")
		}

		// PDF extractor
		if (this.config.pdf?.enabled !== false) {
			const extractor = createPDFExtractor({
				ocrEnabled: this.config.pdf?.ocrEnabled,
				ocrProvider: this.config.pdf?.ocrProvider,
			})
			await extractor.initialize()
			this.extractors.set("pdf", extractor)
			this.logger.debug("Registered PDF extractor")
		}

		// File extractor
		if (this.config.file?.enabled !== false) {
			const extractor = createFileExtractor(this.config.file?.markitdownEnabled)
			await extractor.initialize()
			this.extractors.set("file", extractor)
			this.logger.debug("Registered File extractor")
		}
	}

	/**
	 * Select extractors that can handle the input
	 */
	private selectExtractors(input: ExtractionInput): DocumentExtractor[] {
		const suitableExtractors: Array<{
			extractor: DocumentExtractor
			priority: number
		}> = []

		for (const [name, extractor] of this.extractors) {
			try {
				if (extractor.canHandle(input)) {
					const priority = extractor.getPriority()
					suitableExtractors.push({ extractor, priority })
					this.logger.debug("Extractor can handle input", {
						extractor: name,
						priority,
					})
				}
			} catch (error) {
				this.logger.warn("Error checking if extractor can handle input", {
					extractor: name,
					error: (error as Error).message,
				})
			}
		}

		// Sort by priority (highest first)
		suitableExtractors.sort((a, b) => b.priority - a.priority)

		return suitableExtractors.map((item) => item.extractor)
	}

	/**
	 * Execute extractor chain with fallbacks
	 */
	private async executeExtractorChain(
		input: ExtractionInput,
		extractors: DocumentExtractor[],
	): Promise<ChainExecutionResult> {
		const startTime = Date.now()
		const attemptedExtractors: string[] = []
		const errors = new Map<string, ProcessingError>()

		for (const extractor of extractors) {
			const extractorName = extractor.constructor.name
			attemptedExtractors.push(extractorName)

			try {
				this.logger.debug("Attempting extraction", { extractor: extractorName })

				// Execute with protection (circuit breaker + retry)
				const result = await this.executeWithProtection(extractorName, () =>
					extractor.extract(input),
				)

				// Success!
				return {
					result,
					successfulExtractor: extractorName,
					attemptedExtractors,
					errors,
					executionTime: Date.now() - startTime,
				}
			} catch (error) {
				const err = error as Error

				this.logger.warn("Extractor failed", {
					extractor: extractorName,
					error: err.message,
				})

				errors.set(extractorName, {
					code: "EXTRACTION_FAILED",
					message: err.message,
					recoverable: this.isRetryableError(err),
					details: {
						extractor: extractorName,
						stack: err.stack,
					},
				})

				// Continue to next extractor
			}
		}

		// All extractors failed
		throw this.createError(
			"ALL_EXTRACTORS_FAILED",
			`All ${attemptedExtractors.length} extractors failed. Attempted: ${attemptedExtractors.join(", ")}`,
		)
	}

	/**
	 * Execute extraction with circuit breaker and retry protection
	 */
	private async executeWithProtection<T>(
		extractorName: string,
		operation: () => Promise<T>,
	): Promise<T> {
		const circuitBreaker = this.circuitBreakers.get(extractorName)

		// Execute with circuit breaker if enabled
		const protectedOperation = circuitBreaker
			? () => circuitBreaker.execute(operation)
			: operation

		// Execute with retry logic
		return await this.retryHandler.execute(
			protectedOperation,
			this.config.retry,
		)
	}

	// ========================================================================
	// Private Methods - Circuit Breaker
	// ========================================================================

	/**
	 * Initialize circuit breakers for all extractors
	 */
	private async initializeCircuitBreakers(): Promise<void> {
		const { circuitBreaker } = this.config

		if (!circuitBreaker) return

		for (const [name, extractor] of this.extractors) {
			const breaker = new CircuitBreaker(name, {
				failureThreshold: circuitBreaker.failureThreshold,
				resetTimeout: circuitBreaker.resetTimeout,
				monitoringWindow: circuitBreaker.monitoringWindow,
			})

			await breaker.initialize()
			this.circuitBreakers.set(name, breaker)

			this.logger.debug(`Circuit breaker initialized for ${name}`)
		}
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Check if at least one extractor is healthy
		let healthyCount = 0

		for (const [name, extractor] of this.extractors) {
			try {
				const isHealthy = await extractor.healthCheck()
				if (isHealthy) {
					healthyCount++
				}
			} catch (error) {
				this.logger.warn("Extractor health check failed", {
					extractor: name,
					error: (error as Error).message,
				})
			}
		}

		const isHealthy = healthyCount > 0
		this.logger.debug("Service health check", {
			healthy: isHealthy,
			healthyExtractors: healthyCount,
			totalExtractors: this.extractors.size,
		})

		return isHealthy
	}

	protected async onCleanup(): Promise<void> {
		this.logger.info("Cleaning up document extractor service")

		// Cleanup circuit breakers
		const breakers = Array.from(this.circuitBreakers.values())
		for (const breaker of breakers) {
			await breaker.cleanup()
		}

		// Cleanup extractors
		const extractors = Array.from(this.extractors.values())
		for (const extractor of extractors) {
			await extractor.cleanup()
		}

		// Cleanup retry handler
		await this.retryHandler.cleanup()

		this.extractors.clear()
		this.circuitBreakers.clear()
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create document extractor service with configuration
 *
 * Factory function to create a fully configured DocumentExtractorService instance
 * with all extractors (URL/MarkItDown, YouTube, PDF, File) and protection
 * mechanisms (circuit breakers, retry logic) enabled by default.
 *
 * @param config - Optional service configuration to override defaults
 * @returns Configured DocumentExtractorService instance
 *
 * @example
 * ```typescript
 * // Create with default configuration
 * const service = createDocumentExtractorService();
 * await service.initialize();
 *
 * // Create with custom configuration
 * const customService = createDocumentExtractorService({
 *   pdf: {
 *     enabled: true,
 *     ocrEnabled: true,
 *     ocrProvider: 'replicate'
 *   },
 *   circuitBreaker: {
 *     enabled: true,
 *     failureThreshold: 3
 *   },
 *   retry: {
 *     maxAttempts: 5
 *   }
 * });
 * await customService.initialize();
 * ```
 */
export function createDocumentExtractorService(
	config: Partial<ExtractorServiceConfig> = {},
): DocumentExtractorService {
	const defaultConfig: ExtractorServiceConfig = {
		url: {
			enabled: true, // URL extractor using MarkItDown
			timeout: 30000,
		},
		youtube: {
			enabled: true,
			preferredLanguages: ["en", "en-US", "pt", "pt-BR"],
		},
		pdf: {
			enabled: true,
			ocrEnabled: true,
			ocrProvider: "replicate",
		},
		file: {
			enabled: true,
			markitdownEnabled: true,
		},
		circuitBreaker: {
			enabled: true,
			failureThreshold: 5,
			resetTimeout: 60000,
			monitoringWindow: 300000,
		},
		retry: {
			maxAttempts: 3,
			baseDelay: 1000,
			maxDelay: 30000,
			backoffMultiplier: 2,
			jitter: true,
		},
		...config,
	}

	return new DocumentExtractorService(defaultConfig)
}
