/**
 * Ingestion Orchestrator Service
 *
 * Coordinates the complete document processing flow:
 * 1. Document extraction (via DocumentExtractorService)
 * 2. Content processing (via DocumentProcessorService)
 * 3. Preview generation (via PreviewGeneratorService)
 * 4. Database storage
 *
 * Features:
 * - Circuit breaker protection for external services
 * - Retry logic for transient failures
 * - State management and transitions
 * - Job queue integration
 * - Comprehensive error handling
 * - Performance monitoring
 */

import { BaseService } from "../base/base-service"
import type {
	CircuitBreakerState,
	DocumentExtractorService,
	DocumentProcessorService,
	ExtractionResult,
	IngestionOrchestratorService as IIngestionOrchestratorService,
	JobResult,
	OrchestratorServiceConfig,
	PreviewGeneratorService,
	PreviewResult,
	ProcessDocumentInput,
	ProcessedDocument,
	ProcessingError,
	ProcessingResult,
	QueueDocumentInput,
} from "../interfaces"
import { CircuitBreaker } from "./circuit-breaker"
import { RetryHandler } from "./retry-handler"

// ============================================================================
// Processing State Types
// ============================================================================

interface ProcessingState {
	documentId: string
	status: "queued" | "processing" | "done" | "failed"
	internalStatus?:
		| "extracting"
		| "processing"
		| "generating_preview"
		| "storing"
	startTime: Date
	extraction?: ExtractionResult
	processed?: ProcessedDocument
	preview?: any // Use any to avoid type conflicts between PreviewResult definitions
	error?: ProcessingError
	retryCount: number
}

// ============================================================================
// Ingestion Orchestrator Implementation
// ============================================================================

/**
 * Orchestrates the complete document ingestion flow
 */
export class IngestionOrchestratorService
	extends BaseService
	implements IIngestionOrchestratorService
{
	private readonly config: OrchestratorServiceConfig
	private readonly circuitBreakers: Map<string, CircuitBreaker> = new Map()
	private readonly retryHandler: RetryHandler
	private readonly processingStates: Map<string, ProcessingState> = new Map()

	// Service dependencies (to be injected)
	private extractorService?: DocumentExtractorService
	private processorService?: DocumentProcessorService
	private previewService?: PreviewGeneratorService

	constructor(config: OrchestratorServiceConfig) {
		super("IngestionOrchestrator")
		this.config = config
		this.retryHandler = new RetryHandler()

		// Initialize circuit breakers if enabled
		if (config.circuitBreaker?.enabled) {
			this.initializeCircuitBreakers()
		}
	}

	// ========================================================================
	// Service Dependencies
	// ========================================================================

	/**
	 * Set document extractor service
	 */
	setExtractorService(service: DocumentExtractorService): void {
		this.extractorService = service
		this.logger.info("Extractor service registered")
	}

	/**
	 * Set document processor service
	 */
	setProcessorService(service: DocumentProcessorService): void {
		this.processorService = service
		this.logger.info("Processor service registered")
	}

	/**
	 * Set preview generator service
	 */
	setPreviewService(service: PreviewGeneratorService): void {
		this.previewService = service
		this.logger.info("Preview service registered")
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Process a document through the complete ingestion pipeline
	 *
	 * Orchestrates the full document lifecycle:
	 * 1. Content Extraction - Extracts text from various sources (PDF, URL, etc.)
	 * 2. Document Processing - Chunks, embeds, summarizes, and tags content
	 * 3. Preview Generation - Creates preview images using fallback chain
	 * 4. Database Storage - Persists all data to Supabase
	 *
	 * Features built-in protection and resilience:
	 * - Circuit breaker protection for external services
	 * - Automatic retry with exponential backoff
	 * - State tracking and error recovery
	 * - Performance monitoring and metrics
	 *
	 * @param input - Document input containing URL, content, or file buffer
	 * @returns Processing result with document ID, status, and all generated data
	 *
	 * @example
	 * ```typescript
	 * // Process URL
	 * const result = await orchestrator.processDocument({
	 *   url: 'https://example.com/article',
	 *   type: 'url',
	 *   userId: 'user-123',
	 *   organizationId: 'org-456'
	 * });
	 *
	 * // Process PDF file
	 * const pdfResult = await orchestrator.processDocument({
	 *   fileBuffer: pdfBuffer,
	 *   fileName: 'document.pdf',
	 *   type: 'pdf',
	 *   userId: 'user-123',
	 *   organizationId: 'org-456'
	 * });
	 *
	 * // Process with custom options
	 * const customResult = await orchestrator.processDocument({
	 *   url: 'https://example.com',
	 *   type: 'url',
	 *   userId: 'user-123',
	 *   organizationId: 'org-456',
	 *   processingOptions: {
	 *     skipSummary: false,
	 *     skipTags: false,
	 *     chunkSize: 1000
	 *   }
	 * });
	 * ```
	 */
	async processDocument(
		input: ProcessDocumentInput,
	): Promise<ProcessingResult> {
		this.assertInitialized()
		this.assertServicesRegistered()

		// Generate document ID
		const documentId = this.generateDocumentId()

		// Initialize processing state
		const state: ProcessingState = {
			documentId,
			status: "processing",
			internalStatus: "extracting",
			startTime: new Date(),
			retryCount: 0,
		}
		this.processingStates.set(documentId, state)

		const tracker = this.performanceMonitor.startOperation("processDocument")

		try {
			this.logger.info("Starting document processing", {
				documentId,
				type: input.type,
				url: input.url,
			})

			// Step 1: Extract content
			state.status = "processing"
			state.internalStatus = "extracting"
			const extraction = await this.executeExtraction(input)
			state.extraction = extraction

			// Step 2: Process content
			state.internalStatus = "processing"
			const processed = await this.executeProcessing(extraction, input.options)
			state.processed = processed

			// Step 3: Generate preview (optional)
			if (!input.options?.skipPreview) {
				state.internalStatus = "generating_preview"
				const preview = await this.executePreviewGeneration(extraction)
				state.preview = preview
			}

			// Step 4: Store in database
			state.internalStatus = "storing"
			await this.storeDocument(documentId, input, processed, state.preview)

			// Success!
			state.status = "done"
			tracker.end(true)

			this.logger.info("Document processing completed", {
				documentId,
				duration: Date.now() - state.startTime.getTime(),
			})

			return {
				success: true,
				documentId,
				status: "done",
				metadata: {
					extraction,
					processed,
					preview: state.preview,
				},
			}
		} catch (error) {
			state.status = "failed"
			state.error = this.createProcessingError(error)
			tracker.end(false)

			this.logger.error("Document processing failed", error as Error, {
				documentId,
				status: state.status,
			})

			return {
				success: false,
				documentId,
				status: "failed",
				error: state.error,
			}
		} finally {
			// Cleanup state after some time
			setTimeout(() => {
				this.processingStates.delete(documentId)
			}, 300000) // 5 minutes
		}
	}

	/**
	 * Queue a document for async processing
	 */
	async queueDocument(input: QueueDocumentInput): Promise<JobResult> {
		this.assertInitialized()

		// For now, just process synchronously
		// TODO: Implement actual job queue
		const documentId = this.generateDocumentId()

		this.logger.info("Queueing document for processing", {
			documentId,
			priority: input.priority,
		})

		// Process in background (don't await)
		this.processDocument(input.document).catch((error) => {
			this.logger.error("Background processing failed", error as Error, {
				documentId,
			})
		})

		return {
			jobId: documentId,
			documentId,
			status: "queued",
		}
	}

	/**
	 * Retry a failed document
	 */
	async retryFailedDocument(documentId: string): Promise<ProcessingResult> {
		const state = this.processingStates.get(documentId)

		if (!state) {
			throw this.createError(
				"DOCUMENT_NOT_FOUND",
				`Document ${documentId} not found in processing states`,
			)
		}

		if (state.status !== "failed") {
			throw this.createError(
				"DOCUMENT_NOT_FAILED",
				`Document ${documentId} is not in failed state`,
			)
		}

		// Increment retry count
		state.retryCount++

		this.logger.info("Retrying failed document", {
			documentId,
			retryCount: state.retryCount,
		})

		// Reset state
		state.status = "processing"
		state.internalStatus = "extracting"
		state.error = undefined

		// We would need the original input to retry, which we don't have here
		// In a real implementation, we'd store this in the database
		throw this.createError(
			"NOT_IMPLEMENTED",
			"Retry functionality requires database integration",
		)
	}

	/**
	 * Get processing status
	 */
	async getStatus(documentId: string): Promise<ProcessingResult> {
		const state = this.processingStates.get(documentId)

		if (!state) {
			return {
				success: false,
				documentId,
				status: "failed",
				error: {
					code: "DOCUMENT_NOT_FOUND",
					message: `Document ${documentId} not found`,
					recoverable: false,
				},
			}
		}

		return {
			success: state.status === "done",
			documentId,
			status: state.status,
			error: state.error,
			metadata: {
				extraction: state.extraction,
				processed: state.processed,
				preview: state.preview,
				retryCount: state.retryCount,
			},
		}
	}

	/**
	 * Cancel processing
	 */
	async cancelProcessing(documentId: string): Promise<void> {
		const state = this.processingStates.get(documentId)

		if (!state) {
			throw this.createError(
				"DOCUMENT_NOT_FOUND",
				`Document ${documentId} not found`,
			)
		}

		this.logger.info("Cancelling document processing", { documentId })

		// Mark as failed
		state.status = "failed"
		state.error = {
			code: "CANCELLED",
			message: "Processing was cancelled",
			recoverable: false,
		}

		// Cleanup
		this.processingStates.delete(documentId)
	}

	/**
	 * Get service configuration
	 */
	getConfig(): OrchestratorServiceConfig {
		return { ...this.config }
	}

	/**
	 * Get circuit breaker state
	 */
	getCircuitBreakerState(): CircuitBreakerState {
		const extractorBreaker = this.circuitBreakers.get("extractor")
		return (
			extractorBreaker?.getState() ?? {
				state: "closed",
				failures: 0,
				lastFailureTime: 0,
				lastSuccessTime: 0,
				totalRequests: 0,
				successfulRequests: 0,
			}
		)
	}

	// ========================================================================
	// Private Execution Methods
	// ========================================================================

	/**
	 * Execute extraction step
	 */
	private async executeExtraction(
		input: ProcessDocumentInput,
	): Promise<ExtractionResult> {
		const operation = async () => {
			this.logger.debug("Executing extraction", {
				type: input.type,
				url: input.url,
			})

			// Build extraction input
			const extractionInput = {
				originalContent: input.content,
				url: input.url,
				type: input.type,
				metadata: input.metadata,
			}

			// Call extractor service
			return await this.extractorService!.extract(extractionInput)
		}

		// Execute with circuit breaker and retry
		return await this.executeWithProtection("extractor", operation)
	}

	/**
	 * Execute processing step
	 */
	private async executeProcessing(
		extraction: ExtractionResult,
		options?: ProcessDocumentInput["options"],
	): Promise<ProcessedDocument> {
		const operation = async () => {
			this.logger.debug("Executing processing")

			return await this.processorService!.process(extraction, options)
		}

		// Execute with circuit breaker and retry
		return await this.executeWithProtection("processor", operation)
	}

	/**
	 * Execute preview generation step
	 */
	private async executePreviewGeneration(
		extraction: ExtractionResult,
	): Promise<any> {
		const operation = async () => {
			this.logger.debug("Executing preview generation")

			return await this.previewService!.generate(extraction)
		}

		// Execute with circuit breaker and retry (with fallback)
		try {
			return await this.executeWithProtection("preview", operation)
		} catch (error) {
			// Preview generation is non-critical, return default
			this.logger.warn("Preview generation failed, using default", {
				error: (error as Error).message,
			})

			return {
				url: "/default-preview.svg",
				source: "default",
				type: "svg",
			}
		}
	}

	/**
	 * Execute operation with circuit breaker and retry protection
	 */
	private async executeWithProtection<T>(
		serviceName: string,
		operation: () => Promise<T>,
	): Promise<T> {
		const circuitBreaker = this.circuitBreakers.get(serviceName)

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

	/**
	 * Store document in database
	 */
	private async storeDocument(
		documentId: string,
		input: ProcessDocumentInput,
		processed: ProcessedDocument,
		preview?: PreviewResult,
	): Promise<void> {
		this.logger.debug("Storing document", { documentId })

		// TODO: Implement actual database storage
		// This would involve:
		// 1. Creating document record
		// 2. Storing chunks with embeddings
		// 3. Storing preview URL
		// 4. Updating document status

		// For now, just log
		this.logger.info("Document stored (mock)", {
			documentId,
			chunkCount: processed.chunks.length,
			hasPreview: !!preview,
		})
	}

	// ========================================================================
	// Helper Methods
	// ========================================================================

	/**
	 * Initialize circuit breakers for each service
	 */
	private initializeCircuitBreakers(): void {
		const { circuitBreaker } = this.config

		if (!circuitBreaker) return

		// Create circuit breakers for each service
		const services = ["extractor", "processor", "preview"]

		for (const serviceName of services) {
			const breaker = new CircuitBreaker(serviceName, {
				failureThreshold: circuitBreaker.failureThreshold,
				resetTimeout: circuitBreaker.resetTimeout,
				monitoringWindow: circuitBreaker.monitoringWindow,
			})

			this.circuitBreakers.set(serviceName, breaker)
			this.logger.debug(`Circuit breaker initialized for ${serviceName}`)
		}
	}

	/**
	 * Generate unique document ID
	 */
	private generateDocumentId(): string {
		return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
	}

	/**
	 * Create processing error from unknown error
	 */
	private createProcessingError(error: unknown): ProcessingError {
		const err = error as Error

		return {
			code: "PROCESSING_ERROR",
			message: err.message || "Unknown error",
			recoverable: this.isRetryableError(err),
			details: {
				name: err.name,
				stack: err.stack,
			},
		}
	}

	/**
	 * Assert all required services are registered
	 */
	private assertServicesRegistered(): void {
		if (!this.extractorService) {
			throw this.createError(
				"SERVICE_NOT_REGISTERED",
				"DocumentExtractorService not registered",
			)
		}
		if (!this.processorService) {
			throw this.createError(
				"SERVICE_NOT_REGISTERED",
				"DocumentProcessorService not registered",
			)
		}
		if (!this.previewService) {
			throw this.createError(
				"SERVICE_NOT_REGISTERED",
				"PreviewGeneratorService not registered",
			)
		}
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onInitialize(): Promise<void> {
		this.logger.info("Initializing ingestion orchestrator", {
			config: this.config,
		})

		// Initialize retry handler
		await this.retryHandler.initialize()

		// Initialize circuit breakers
		if (this.config.circuitBreaker?.enabled) {
			const breakers = Array.from(this.circuitBreakers.values())
			for (const breaker of breakers) {
				await breaker.initialize()
			}
		}
	}

	protected async onHealthCheck(): Promise<boolean> {
		// Check if retry handler is healthy
		return await this.retryHandler.healthCheck()
	}

	protected async onCleanup(): Promise<void> {
		this.logger.info("Cleaning up ingestion orchestrator")

		// Cleanup circuit breakers
		const breakers = Array.from(this.circuitBreakers.values())
		for (const breaker of breakers) {
			await breaker.cleanup()
		}

		// Cleanup retry handler
		await this.retryHandler.cleanup()

		// Clear processing states
		this.processingStates.clear()
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create ingestion orchestrator with default configuration
 */
export function createIngestionOrchestrator(
	config?: Partial<OrchestratorServiceConfig>,
): IngestionOrchestratorService {
	const defaultConfig: OrchestratorServiceConfig = {
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
		processingTimeout: 300000,
		parallelProcessing: false,
		maxConcurrentJobs: 10,
		...config,
	}

	return new IngestionOrchestratorService(defaultConfig)
}
