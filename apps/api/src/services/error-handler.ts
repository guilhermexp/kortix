/**
 * Comprehensive Error Handling Service
 * Provides centralized error handling with proper logging, user-friendly messages, and recovery mechanisms
 */

export enum ErrorCategory {
	VALIDATION = "VALIDATION",
	DATABASE = "DATABASE",
	EXTERNAL_API = "EXTERNAL_API",
	AUTHENTICATION = "AUTHENTICATION",
	AUTHORIZATION = "AUTHORIZATION",
	NOT_FOUND = "NOT_FOUND",
	RATE_LIMIT = "RATE_LIMIT",
	TIMEOUT = "TIMEOUT",
	INTERNAL = "INTERNAL",
}

export type ErrorMetadata = {
	category: ErrorCategory
	statusCode: number
	userMessage: string
	internalMessage: string
	originalError?: unknown
	context?: Record<string, unknown>
	recoverable?: boolean
	retryable?: boolean
}

export class AppError extends Error {
	public readonly category: ErrorCategory
	public readonly statusCode: number
	public readonly userMessage: string
	public readonly internalMessage: string
	public readonly context?: Record<string, unknown>
	public readonly recoverable: boolean
	public readonly retryable: boolean
	public readonly timestamp: string

	constructor(metadata: ErrorMetadata) {
		super(metadata.internalMessage)
		this.name = "AppError"
		this.category = metadata.category
		this.statusCode = metadata.statusCode
		this.userMessage = metadata.userMessage
		this.internalMessage = metadata.internalMessage
		this.context = metadata.context
		this.recoverable = metadata.recoverable ?? false
		this.retryable = metadata.retryable ?? false
		this.timestamp = new Date().toISOString()

		// Maintain proper stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, AppError)
		}
	}

	toJSON() {
		return {
			name: this.name,
			category: this.category,
			statusCode: this.statusCode,
			userMessage: this.userMessage,
			internalMessage: this.internalMessage,
			context: this.context,
			recoverable: this.recoverable,
			retryable: this.retryable,
			timestamp: this.timestamp,
		}
	}

	toResponse() {
		return new Response(
			JSON.stringify({
				error: this.userMessage,
				category: this.category,
				recoverable: this.recoverable,
				retryable: this.retryable,
				...(this.context ? { context: this.context } : {}),
			}),
			{
				status: this.statusCode,
				headers: {
					"Content-Type": "application/json",
				},
			}
		)
	}
}

export class ErrorHandler {
	/**
	 * Create a validation error
	 */
	static validation(message: string, context?: Record<string, unknown>): AppError {
		return new AppError({
			category: ErrorCategory.VALIDATION,
			statusCode: 400,
			userMessage: message,
			internalMessage: `Validation error: ${message}`,
			context,
			recoverable: true,
			retryable: false,
		})
	}

	/**
	 * Create a database error
	 */
	static database(
		operation: string,
		error: unknown,
		context?: Record<string, unknown>
	): AppError {
		const errorMessage = error instanceof Error ? error.message : String(error)
		return new AppError({
			category: ErrorCategory.DATABASE,
			statusCode: 500,
			userMessage: "A database error occurred. Please try again later.",
			internalMessage: `Database error during ${operation}: ${errorMessage}`,
			originalError: error,
			context,
			recoverable: true,
			retryable: true,
		})
	}

	/**
	 * Create an external API error
	 */
	static externalApi(
		service: string,
		error: unknown,
		context?: Record<string, unknown>
	): AppError {
		const errorMessage = error instanceof Error ? error.message : String(error)
		return new AppError({
			category: ErrorCategory.EXTERNAL_API,
			statusCode: 502,
			userMessage: `Service temporarily unavailable. Please try again later.`,
			internalMessage: `External API error from ${service}: ${errorMessage}`,
			originalError: error,
			context: { ...context, service },
			recoverable: true,
			retryable: true,
		})
	}

	/**
	 * Create an authentication error
	 */
	static authentication(message: string, context?: Record<string, unknown>): AppError {
		return new AppError({
			category: ErrorCategory.AUTHENTICATION,
			statusCode: 401,
			userMessage: "Authentication required. Please log in.",
			internalMessage: `Authentication error: ${message}`,
			context,
			recoverable: false,
			retryable: false,
		})
	}

	/**
	 * Create an authorization error
	 */
	static authorization(
		resource: string,
		action: string,
		context?: Record<string, unknown>
	): AppError {
		return new AppError({
			category: ErrorCategory.AUTHORIZATION,
			statusCode: 403,
			userMessage: "You don't have permission to perform this action.",
			internalMessage: `Authorization error: User not authorized to ${action} ${resource}`,
			context: { ...context, resource, action },
			recoverable: false,
			retryable: false,
		})
	}

	/**
	 * Create a not found error
	 */
	static notFound(resource: string, identifier?: string): AppError {
		return new AppError({
			category: ErrorCategory.NOT_FOUND,
			statusCode: 404,
			userMessage: `${resource} not found.`,
			internalMessage: `Resource not found: ${resource}${identifier ? ` (${identifier})` : ""}`,
			context: identifier ? { resource, identifier } : { resource },
			recoverable: false,
			retryable: false,
		})
	}

	/**
	 * Create a rate limit error
	 */
	static rateLimit(limit: number, window: string): AppError {
		return new AppError({
			category: ErrorCategory.RATE_LIMIT,
			statusCode: 429,
			userMessage: `Too many requests. Please try again later.`,
			internalMessage: `Rate limit exceeded: ${limit} requests per ${window}`,
			context: { limit, window },
			recoverable: true,
			retryable: true,
		})
	}

	/**
	 * Create a timeout error
	 */
	static timeout(operation: string, timeout: number): AppError {
		return new AppError({
			category: ErrorCategory.TIMEOUT,
			statusCode: 504,
			userMessage: "The request timed out. Please try again.",
			internalMessage: `Timeout during ${operation} (${timeout}ms)`,
			context: { operation, timeout },
			recoverable: true,
			retryable: true,
		})
	}

	/**
	 * Create an internal server error
	 */
	static internal(
		message: string,
		error?: unknown,
		context?: Record<string, unknown>
	): AppError {
		const errorMessage = error instanceof Error ? error.message : String(error)
		return new AppError({
			category: ErrorCategory.INTERNAL,
			statusCode: 500,
			userMessage: "An internal error occurred. Please try again later.",
			internalMessage: `Internal error: ${message}${error ? ` - ${errorMessage}` : ""}`,
			originalError: error,
			context,
			recoverable: true,
			retryable: true,
		})
	}

	/**
	 * Log an error with appropriate severity
	 */
	static log(error: AppError | Error | unknown): void {
		if (error instanceof AppError) {
			const logData = {
				timestamp: error.timestamp,
				category: error.category,
				statusCode: error.statusCode,
				internalMessage: error.internalMessage,
				context: error.context,
				recoverable: error.recoverable,
				retryable: error.retryable,
				stack: error.stack,
			}

			// Log at different levels based on status code
			if (error.statusCode >= 500) {
				console.error("[ERROR]", JSON.stringify(logData, null, 2))
			} else if (error.statusCode >= 400) {
				console.warn("[WARNING]", JSON.stringify(logData, null, 2))
			} else {
				console.info("[INFO]", JSON.stringify(logData, null, 2))
			}
		} else if (error instanceof Error) {
			console.error("[ERROR] Unhandled error:", {
				name: error.name,
				message: error.message,
				stack: error.stack,
			})
		} else {
			console.error("[ERROR] Unknown error:", error)
		}
	}

	/**
	 * Wrap an unknown error in an AppError
	 */
	static wrap(error: unknown, defaultMessage = "An unexpected error occurred"): AppError {
		if (error instanceof AppError) {
			return error
		}

		if (error instanceof Error) {
			return ErrorHandler.internal(defaultMessage, error)
		}

		return ErrorHandler.internal(defaultMessage, undefined, {
			originalError: String(error),
		})
	}

	/**
	 * Handle an error and return an appropriate Response
	 */
	static handleError(error: unknown): Response {
		const appError = ErrorHandler.wrap(error)
		ErrorHandler.log(appError)
		return appError.toResponse()
	}

	/**
	 * Create a recovery strategy for retryable errors
	 */
	static async withRetry<T>(
		operation: () => Promise<T>,
		options: {
			maxAttempts?: number
			initialDelay?: number
			maxDelay?: number
			backoffMultiplier?: number
		} = {}
	): Promise<T> {
		const {
			maxAttempts = 3,
			initialDelay = 100,
			maxDelay = 5000,
			backoffMultiplier = 2,
		} = options

		let lastError: unknown
		let delay = initialDelay

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await operation()
			} catch (error) {
				lastError = error

				// Don't retry non-retryable errors
				if (error instanceof AppError && !error.retryable) {
					throw error
				}

				// Don't retry on last attempt
				if (attempt === maxAttempts) {
					break
				}

				// Wait before retrying
				await new Promise(resolve => setTimeout(resolve, delay))
				delay = Math.min(delay * backoffMultiplier, maxDelay)
			}
		}

		throw ErrorHandler.wrap(lastError, `Operation failed after ${maxAttempts} attempts`)
	}

	/**
	 * Create a timeout wrapper for operations
	 */
	static async withTimeout<T>(
		operation: () => Promise<T>,
		timeoutMs: number,
		operationName: string
	): Promise<T> {
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(ErrorHandler.timeout(operationName, timeoutMs))
			}, timeoutMs)
		})

		return Promise.race([operation(), timeoutPromise])
	}
}
