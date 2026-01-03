/**
 * Retry Handler Implementation
 *
 * Implements robust retry logic with exponential backoff for failed operations.
 *
 * Features:
 * - Exponential backoff with configurable multiplier
 * - Jitter to prevent thundering herd
 * - Maximum delay cap
 * - Custom retry conditions
 * - Timeout per attempt
 * - Event hooks for monitoring
 * - Statistics collection
 */

import { BaseService } from "../base/base-service"
import type {
	ExtendedRetryOptions,
	RetryHandler as IRetryHandler,
	RetryAttempt,
	RetryExecutionContext,
	RetryOptions,
	RetryStatistics,
} from "../interfaces"

// ============================================================================
// Retry Handler Implementation
// ============================================================================

/**
 * Retry handler with exponential backoff
 */
export class RetryHandler extends BaseService implements IRetryHandler {
	private statistics: RetryStatistics = {
		totalOperations: 0,
		successfulFirstTry: 0,
		successfulAfterRetry: 0,
		failed: 0,
		averageRetryCount: 0,
		maxRetryCount: 0,
		retrySuccessRate: 0,
	}

	private readonly executionContexts: Map<string, RetryExecutionContext> =
		new Map()
	private contextCounter = 0

	constructor() {
		super("RetryHandler")
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Execute operation with retry logic
	 */
	async execute<T>(
		operation: () => Promise<T>,
		options?: RetryOptions | ExtendedRetryOptions,
	): Promise<T> {
		const effectiveOptions = this.mergeOptions(options)
		const context = this.createExecutionContext()

		this.statistics.totalOperations++

		try {
			const result = await this.executeWithRetry(
				operation,
				effectiveOptions,
				context,
			)

			// Update statistics
			if (context.attempts.length === 1) {
				this.statistics.successfulFirstTry++
			} else {
				this.statistics.successfulAfterRetry++
			}

			this.updateStatistics()
			return result
		} catch (error) {
			this.statistics.failed++
			this.updateStatistics()

			// Call onFailure hook if provided
			const extendedOptions = options as ExtendedRetryOptions
			if (extendedOptions?.onFailure) {
				await extendedOptions.onFailure(error as Error, context.attempts.length)
			}

			throw error
		} finally {
			// Cleanup old contexts
			this.cleanupContexts()
		}
	}

	/**
	 * Calculate delay for next retry
	 */
	calculateDelay(attempt: number, options: RetryOptions): number {
		const baseDelay = options.baseDelay ?? 1000
		const backoffMultiplier = options.backoffMultiplier ?? 2
		const maxDelay = options.maxDelay ?? 30000
		const jitter = options.jitter ?? true

		// Calculate exponential delay
		let delay = baseDelay * backoffMultiplier ** (attempt - 1)

		// Cap at maximum delay
		delay = Math.min(delay, maxDelay)

		// Add jitter (0-100% of calculated delay)
		if (jitter) {
			const jitterAmount = delay * Math.random()
			delay = delay - jitterAmount / 2 + jitterAmount
		}

		return Math.floor(delay)
	}

	/**
	 * Check if error is retryable
	 */
	isRetryable(error: Error): boolean {
		// Network and timeout errors are typically retryable
		const retryablePatterns = [
			"ECONNREFUSED",
			"ETIMEDOUT",
			"ENOTFOUND",
			"ECONNRESET",
			"EPIPE",
			"timeout",
			"network",
			"socket hang up",
			"rate limit",
			"503",
			"502",
			"504",
		]

		const errorMessage = error.message.toLowerCase()
		const errorName = error.name.toLowerCase()

		return retryablePatterns.some(
			(pattern) =>
				errorMessage.includes(pattern.toLowerCase()) ||
				errorName.includes(pattern.toLowerCase()),
		)
	}

	/**
	 * Get retry statistics
	 */
	getStats(): RetryStatistics {
		return { ...this.statistics }
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.statistics = {
			totalOperations: 0,
			successfulFirstTry: 0,
			successfulAfterRetry: 0,
			failed: 0,
			averageRetryCount: 0,
			maxRetryCount: 0,
			retrySuccessRate: 0,
		}
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	/**
	 * Execute operation with retry logic
	 */
	async executeWithRetry<T>(
		operation: () => Promise<T>,
		options: Required<RetryOptions> & Partial<ExtendedRetryOptions>,
		context: RetryExecutionContext,
	): Promise<T> {
		let lastError: Error | undefined

		for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
			const attemptInfo: RetryAttempt = {
				attemptNumber: attempt,
				timestamp: new Date(),
				successful: false,
			}

			try {
				// Call onRetry hook if not first attempt
				if (attempt > 1 && options.onRetry) {
					await options.onRetry(attempt, lastError!)
				}

				this.logger.debug(
					`Executing operation (attempt ${attempt}/${options.maxAttempts})`,
					{
						operationId: context.operationId,
						attempt,
					},
				)

				// Execute with timeout if configured
				const result = options.timeout
					? await this.executeWithTimeout(operation, options.timeout)
					: await operation()

				// Success!
				attemptInfo.successful = true
				context.attempts.push(attemptInfo)
				context.endTime = new Date()
				context.duration =
					context.endTime.getTime() - context.startTime.getTime()
				context.result = result

				this.logger.debug(`Operation succeeded on attempt ${attempt}`, {
					operationId: context.operationId,
					duration: context.duration,
				})

				return result
			} catch (error) {
				lastError = error as Error
				attemptInfo.error = lastError
				context.attempts.push(attemptInfo)
				// Store error in context
				if (!context.error) {
					context.error = lastError
				}

				this.logger.warn(
					`Operation failed on attempt ${attempt}/${options.maxAttempts}`,
					{
						operationId: context.operationId,
						error: lastError.message,
					},
				)

				// Check if should retry
				const shouldRetry = this.shouldRetry(lastError, attempt, options)

				if (!shouldRetry || attempt === options.maxAttempts) {
					// No more retries
					context.endTime = new Date()
					context.duration =
						context.endTime.getTime() - context.startTime.getTime()
					context.error = lastError
					throw lastError
				}

				// Calculate and apply delay before next retry
				const delay = options.calculateDelay
					? options.calculateDelay(attempt)
					: this.calculateDelay(attempt, options)

				attemptInfo.nextRetryDelay = delay

				this.logger.info(`Retrying after ${delay}ms`, {
					operationId: context.operationId,
					attempt,
					delay,
				})

				await this.sleep(delay)
			}
		}

		// Should never reach here, but satisfy TypeScript
		throw lastError || new Error("Max retry attempts reached")
	}

	getMetrics(): RetryStatistics {
		return this.getStats()
	}

	/**
	 * Execute operation with timeout
	 */
	private async executeWithTimeout<T>(
		operation: () => Promise<T>,
		timeout: number,
	): Promise<T> {
		return Promise.race([
			operation(),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`Operation timed out after ${timeout}ms`)),
					timeout,
				),
			),
		])
	}

	/**
	 * Check if should retry
	 */
	private shouldRetry(
		error: Error,
		_attempt: number,
		options: Required<RetryOptions> & Partial<ExtendedRetryOptions>,
	): boolean {
		// Check custom retry condition if provided
		if (options.isRetryableError) {
			return options.isRetryableError(error)
		}

		// Use default retryable check
		return this.isRetryable(error)
	}

	/**
	 * Merge options with defaults
	 */
	private mergeOptions(
		options?: RetryOptions | ExtendedRetryOptions,
	): Required<RetryOptions> & Partial<ExtendedRetryOptions> {
		return {
			maxAttempts: options?.maxAttempts ?? 3,
			baseDelay: options?.baseDelay ?? 1000,
			maxDelay: options?.maxDelay ?? 30000,
			backoffMultiplier: options?.backoffMultiplier ?? 2,
			jitter: options?.jitter ?? true,
			timeout: options?.timeout,
			...(options as ExtendedRetryOptions),
		}
	}

	/**
	 * Create execution context
	 */
	private createExecutionContext(): RetryExecutionContext {
		const operationId = `retry-${++this.contextCounter}-${Date.now()}`
		const context: RetryExecutionContext = {
			operationId,
			attempts: [],
			startTime: new Date(),
		}

		this.executionContexts.set(operationId, context)
		return context
	}

	/**
	 * Update statistics
	 */
	private updateStatistics(): void {
		const totalRetries =
			this.statistics.successfulAfterRetry + this.statistics.failed
		const _totalSuccess =
			this.statistics.successfulFirstTry + this.statistics.successfulAfterRetry

		// Calculate average retry count
		if (totalRetries > 0) {
			let totalAttempts = 0
			const contexts = Array.from(this.executionContexts.values())
			for (const context of contexts) {
				if (context.attempts.length > 1) {
					totalAttempts += context.attempts.length
				}
			}
			this.statistics.averageRetryCount = totalAttempts / totalRetries
		}

		// Calculate max retry count
		const contexts = Array.from(this.executionContexts.values())
		this.statistics.maxRetryCount = Math.max(
			...contexts.map((ctx) => ctx.attempts.length),
			0,
		)

		// Calculate retry success rate
		if (totalRetries > 0) {
			this.statistics.retrySuccessRate =
				this.statistics.successfulAfterRetry / totalRetries
		}
	}

	/**
	 * Cleanup old execution contexts
	 */
	private cleanupContexts(): void {
		// Keep only last 100 contexts
		if (this.executionContexts.size > 100) {
			const sortedContexts = Array.from(this.executionContexts.entries()).sort(
				(a, b) => a[1].startTime.getTime() - b[1].startTime.getTime(),
			)

			// Remove oldest contexts
			const toRemove = sortedContexts.slice(0, sortedContexts.length - 100)
			for (const [key] of toRemove) {
				this.executionContexts.delete(key)
			}
		}
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a retry handler instance
 */
export function createRetryHandler(): RetryHandler {
	return new RetryHandler()
}

/**
 * Global retry handler instance
 */
let globalRetryHandler: RetryHandler | null = null

/**
 * Get or create global retry handler
 */
export function getRetryHandler(): RetryHandler {
	if (!globalRetryHandler) {
		globalRetryHandler = new RetryHandler()
	}
	return globalRetryHandler
}

/**
 * Execute operation with retry (convenience function)
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	options?: RetryOptions,
): Promise<T> {
	const handler = getRetryHandler()
	return handler.execute(operation, options)
}

/**
 * Execute operation with aggressive retry (short delays, more attempts)
 */
export async function withAggressiveRetry<T>(
	operation: () => Promise<T>,
): Promise<T> {
	return withRetry(operation, {
		maxAttempts: 5,
		baseDelay: 500,
		maxDelay: 5000,
		backoffMultiplier: 1.5,
		jitter: true,
	})
}

/**
 * Execute operation with conservative retry (long delays, fewer attempts)
 */
export async function withConservativeRetry<T>(
	operation: () => Promise<T>,
): Promise<T> {
	return withRetry(operation, {
		maxAttempts: 2,
		baseDelay: 2000,
		maxDelay: 60000,
		backoffMultiplier: 3,
		jitter: true,
	})
}

/**
 * Execute operation with linear backoff (constant delay)
 */
export async function withLinearRetry<T>(
	operation: () => Promise<T>,
	delay = 1000,
	maxAttempts = 3,
): Promise<T> {
	return withRetry(operation, {
		maxAttempts,
		baseDelay: delay,
		maxDelay: delay,
		backoffMultiplier: 1, // No exponential increase
		jitter: false,
	})
}
