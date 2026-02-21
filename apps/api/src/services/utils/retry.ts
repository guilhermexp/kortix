/**
 * Simple retry utility with exponential backoff + jitter.
 *
 * Replaces the 495-line RetryHandler class and 451-line CircuitBreaker class
 * from the orchestration layer.
 */

export interface RetryOptions {
	/** Maximum number of attempts (default: 3) */
	maxAttempts?: number
	/** Base delay in milliseconds (default: 1000) */
	baseDelay?: number
	/** Maximum delay in milliseconds (default: 30000) */
	maxDelay?: number
	/** Backoff multiplier (default: 2) */
	backoffMultiplier?: number
	/** Whether to add jitter (default: true) */
	jitter?: boolean
	/** Custom check if error is retryable (default: network/timeout errors) */
	isRetryable?: (error: Error) => boolean
}

const RETRYABLE_PATTERNS = [
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

function isRetryableError(error: Error): boolean {
	const msg = error.message.toLowerCase()
	return RETRYABLE_PATTERNS.some((p) => msg.includes(p.toLowerCase()))
}

function calculateDelay(attempt: number, opts: Required<RetryOptions>): number {
	let delay = opts.baseDelay * opts.backoffMultiplier ** (attempt - 1)
	delay = Math.min(delay, opts.maxDelay)
	if (opts.jitter) {
		delay = delay * (0.5 + Math.random())
	}
	return Math.floor(delay)
}

/**
 * Execute an async operation with retry logic.
 *
 * @example
 * const result = await withRetry(() => fetch(url), { maxAttempts: 3 })
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	options?: RetryOptions,
): Promise<T> {
	const opts: Required<RetryOptions> = {
		maxAttempts: options?.maxAttempts ?? 3,
		baseDelay: options?.baseDelay ?? 1000,
		maxDelay: options?.maxDelay ?? 30000,
		backoffMultiplier: options?.backoffMultiplier ?? 2,
		jitter: options?.jitter ?? true,
		isRetryable: options?.isRetryable ?? isRetryableError,
	}

	let lastError: Error | undefined

	for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
		try {
			return await operation()
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))

			const canRetry =
				attempt < opts.maxAttempts && opts.isRetryable(lastError)

			if (!canRetry) {
				throw lastError
			}

			const delay = calculateDelay(attempt, opts)
			await new Promise((resolve) => setTimeout(resolve, delay))
		}
	}

	throw lastError ?? new Error("Max retry attempts reached")
}
