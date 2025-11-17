/**
 * Base Service Class
 *
 * Provides common functionality for all services including:
 * - Structured logging
 * - Error handling utilities
 * - Performance monitoring
 * - Configuration management
 * - Common validation methods
 * - Lifecycle management (initialize, healthCheck, cleanup)
 */

import type { BaseService as IBaseService } from "../interfaces"

// ============================================================================
// Logging Types
// ============================================================================

export enum LogLevel {
	DEBUG = "debug",
	INFO = "info",
	WARN = "warn",
	ERROR = "error",
}

export interface LogEntry {
	timestamp: string
	level: LogLevel
	service: string
	operation: string
	message: string
	duration?: number
	error?: string
	metadata?: Record<string, unknown>
}

export interface Logger {
	debug(message: string, metadata?: Record<string, unknown>): void
	info(message: string, metadata?: Record<string, unknown>): void
	warn(message: string, metadata?: Record<string, unknown>): void
	error(
		message: string,
		error?: Error,
		metadata?: Record<string, unknown>,
	): void
}

// ============================================================================
// Performance Monitoring Types
// ============================================================================

export interface PerformanceMetric {
	operation: string
	duration: number
	timestamp: Date
	success: boolean
	metadata?: Record<string, unknown>
}

export interface PerformanceMonitor {
	startOperation(operation: string): PerformanceTracker
	recordMetric(metric: PerformanceMetric): void
	getMetrics(operation?: string): PerformanceMetric[]
	getAverageTime(operation: string): number
}

export interface PerformanceTracker {
	end(success?: boolean, metadata?: Record<string, unknown>): void
}

// ============================================================================
// Base Service Implementation
// ============================================================================

/**
 * Abstract base service class with common functionality
 */
export abstract class BaseService implements IBaseService {
	protected logger: Logger
	protected performanceMonitor: PerformanceMonitor
	private initialized = false

	constructor(
		public readonly serviceName: string,
		logger?: Logger,
		performanceMonitor?: PerformanceMonitor,
	) {
		this.logger = logger || new ConsoleLogger(serviceName)
		this.performanceMonitor =
			performanceMonitor || new SimplePerformanceMonitor()
	}

	// ========================================================================
	// Lifecycle Methods
	// ========================================================================

	/**
	 * Initialize the service
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			this.logger.warn("Service already initialized", {
				service: this.serviceName,
			})
			return
		}

		const tracker = this.performanceMonitor.startOperation("initialize")

		try {
			this.logger.info("Initializing service", { service: this.serviceName })
			await this.onInitialize()
			this.initialized = true
			this.logger.info("Service initialized successfully", {
				service: this.serviceName,
			})
			tracker.end(true)
		} catch (error) {
			this.logger.error("Service initialization failed", error as Error, {
				service: this.serviceName,
			})
			tracker.end(false)
			throw this.handleError(error, "initialization")
		}
	}

	/**
	 * Check if service is healthy
	 */
	async healthCheck(): Promise<boolean> {
		try {
			this.logger.debug("Running health check", { service: this.serviceName })
			const healthy = await this.onHealthCheck()
			this.logger.debug("Health check completed", {
				service: this.serviceName,
				healthy,
			})
			return healthy
		} catch (error) {
			this.logger.error("Health check failed", error as Error, {
				service: this.serviceName,
			})
			return false
		}
	}

	/**
	 * Cleanup resources
	 */
	async cleanup(): Promise<void> {
		if (!this.initialized) {
			this.logger.warn("Service not initialized, skipping cleanup", {
				service: this.serviceName,
			})
			return
		}

		try {
			this.logger.info("Cleaning up service", { service: this.serviceName })
			await this.onCleanup()
			this.initialized = false
			this.logger.info("Service cleaned up successfully", {
				service: this.serviceName,
			})
		} catch (error) {
			this.logger.error("Service cleanup failed", error as Error, {
				service: this.serviceName,
			})
			throw this.handleError(error, "cleanup")
		}
	}

	// ========================================================================
	// Protected Lifecycle Hooks (to be implemented by subclasses)
	// ========================================================================

	/**
	 * Hook called during initialization
	 */
	protected async onInitialize(): Promise<void> {
		// Default implementation does nothing
	}

	/**
	 * Hook called during health check
	 */
	protected async onHealthCheck(): Promise<boolean> {
		// Default implementation returns true
		return true
	}

	/**
	 * Hook called during cleanup
	 */
	protected async onCleanup(): Promise<void> {
		// Default implementation does nothing
	}

	// ========================================================================
	// Error Handling Utilities
	// ========================================================================

	/**
	 * Handle and normalize errors
	 */
	protected handleError(error: unknown, context: string): Error {
		if (error instanceof Error) {
			this.logger.error(`Error in ${context}`, error, {
				service: this.serviceName,
				context,
			})
			return error
		}

		const errorMessage = String(error)
		const wrappedError = new Error(`Error in ${context}: ${errorMessage}`)
		this.logger.error(`Error in ${context}`, wrappedError, {
			service: this.serviceName,
			context,
		})
		return wrappedError
	}

	/**
	 * Create a standardized error
	 */
	protected createError(
		code: string,
		message: string,
		details?: Record<string, unknown>,
	): Error {
		const error = new Error(message) as Error & {
			code?: string
			details?: Record<string, unknown>
		}
		error.code = code
		error.details = details
		return error
	}

	/**
	 * Check if error is retryable
	 */
	protected isRetryableError(error: Error): boolean {
		// Network errors are typically retryable
		const retryableMessages = [
			"ECONNREFUSED",
			"ETIMEDOUT",
			"ENOTFOUND",
			"ECONNRESET",
			"timeout",
			"network",
		]

		const errorMessage = error.message.toLowerCase()
		return retryableMessages.some((msg) => errorMessage.includes(msg))
	}

	// ========================================================================
	// Validation Utilities
	// ========================================================================

	/**
	 * Validate required field
	 */
	protected validateRequired<T>(
		value: T | null | undefined,
		fieldName: string,
	): asserts value is T {
		if (value === null || value === undefined || value === "") {
			throw this.createError("VALIDATION_ERROR", `${fieldName} is required`)
		}
	}

	/**
	 * Validate string is not empty
	 */
	protected validateNotEmpty(value: string, fieldName: string): void {
		if (!value || value.trim().length === 0) {
			throw this.createError("VALIDATION_ERROR", `${fieldName} cannot be empty`)
		}
	}

	/**
	 * Validate string length
	 */
	protected validateLength(
		value: string,
		fieldName: string,
		min?: number,
		max?: number,
	): void {
		if (min !== undefined && value.length < min) {
			throw this.createError(
				"VALIDATION_ERROR",
				`${fieldName} must be at least ${min} characters`,
			)
		}
		if (max !== undefined && value.length > max) {
			throw this.createError(
				"VALIDATION_ERROR",
				`${fieldName} must be at most ${max} characters`,
			)
		}
	}

	/**
	 * Validate URL format
	 */
	protected validateUrl(value: string, fieldName: string): void {
		try {
			new URL(value)
		} catch {
			throw this.createError(
				"VALIDATION_ERROR",
				`${fieldName} must be a valid URL`,
			)
		}
	}

	/**
	 * Validate number range
	 */
	protected validateRange(
		value: number,
		fieldName: string,
		min?: number,
		max?: number,
	): void {
		if (min !== undefined && value < min) {
			throw this.createError(
				"VALIDATION_ERROR",
				`${fieldName} must be at least ${min}`,
			)
		}
		if (max !== undefined && value > max) {
			throw this.createError(
				"VALIDATION_ERROR",
				`${fieldName} must be at most ${max}`,
			)
		}
	}

	/**
	 * Validate enum value
	 */
	protected validateEnum<T extends string>(
		value: T,
		fieldName: string,
		allowedValues: readonly T[],
	): void {
		if (!allowedValues.includes(value)) {
			throw this.createError(
				"VALIDATION_ERROR",
				`${fieldName} must be one of: ${allowedValues.join(", ")}`,
			)
		}
	}

	// ========================================================================
	// Performance Monitoring Utilities
	// ========================================================================

	/**
	 * Execute operation with performance tracking
	 */
	protected async executeWithTracking<T>(
		operation: string,
		fn: () => Promise<T>,
	): Promise<T> {
		const tracker = this.performanceMonitor.startOperation(operation)

		try {
			const result = await fn()
			tracker.end(true)
			return result
		} catch (error) {
			tracker.end(false)
			throw error
		}
	}

	/**
	 * Get performance metrics
	 */
	protected getPerformanceMetrics(operation?: string): PerformanceMetric[] {
		return this.performanceMonitor.getMetrics(operation)
	}

	/**
	 * Get average operation time
	 */
	protected getAverageOperationTime(operation: string): number {
		return this.performanceMonitor.getAverageTime(operation)
	}

	// ========================================================================
	// State Management
	// ========================================================================

	/**
	 * Check if service is initialized
	 */
	protected isInitialized(): boolean {
		return this.initialized
	}

	/**
	 * Assert service is initialized
	 */
	protected assertInitialized(): void {
		if (!this.initialized) {
			throw this.createError(
				"SERVICE_NOT_INITIALIZED",
				`Service ${this.serviceName} is not initialized`,
			)
		}
	}
}

// ============================================================================
// Default Logger Implementation
// ============================================================================

/**
 * Simple console-based logger
 */
export class ConsoleLogger implements Logger {
	constructor(private serviceName: string) {}

	private log(
		level: LogLevel,
		message: string,
		metadata?: Record<string, unknown>,
	): void {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			service: this.serviceName,
			operation: "",
			message,
			metadata,
		}

		const logMessage = `[${entry.timestamp}] [${level.toUpperCase()}] [${
			this.serviceName
		}] ${message}`

		switch (level) {
			case LogLevel.DEBUG:
				console.debug(logMessage, metadata)
				break
			case LogLevel.INFO:
				console.info(logMessage, metadata)
				break
			case LogLevel.WARN:
				console.warn(logMessage, metadata)
				break
			case LogLevel.ERROR:
				console.error(logMessage, metadata)
				break
		}
	}

	debug(message: string, metadata?: Record<string, unknown>): void {
		this.log(LogLevel.DEBUG, message, metadata)
	}

	info(message: string, metadata?: Record<string, unknown>): void {
		this.log(LogLevel.INFO, message, metadata)
	}

	warn(message: string, metadata?: Record<string, unknown>): void {
		this.log(LogLevel.WARN, message, metadata)
	}

	error(
		message: string,
		error?: Error,
		metadata?: Record<string, unknown>,
	): void {
		const errorMetadata = {
			...metadata,
			error: error?.message,
			stack: error?.stack,
		}
		this.log(LogLevel.ERROR, message, errorMetadata)
	}
}

// ============================================================================
// Default Performance Monitor Implementation
// ============================================================================

/**
 * Simple in-memory performance monitor
 */
export class SimplePerformanceMonitor implements PerformanceMonitor {
	private metrics: PerformanceMetric[] = []
	private readonly maxMetrics = 1000 // Keep last 1000 metrics

	startOperation(operation: string): PerformanceTracker {
		const startTime = Date.now()

		return {
			end: (success = true, metadata?: Record<string, unknown>) => {
				const duration = Date.now() - startTime
				this.recordMetric({
					operation,
					duration,
					timestamp: new Date(),
					success,
					metadata,
				})
			},
		}
	}

	recordMetric(metric: PerformanceMetric): void {
		this.metrics.push(metric)

		// Keep only last N metrics
		if (this.metrics.length > this.maxMetrics) {
			this.metrics.shift()
		}
	}

	getMetrics(operation?: string): PerformanceMetric[] {
		if (operation) {
			return this.metrics.filter((m) => m.operation === operation)
		}
		return [...this.metrics]
	}

	getAverageTime(operation: string): number {
		const operationMetrics = this.getMetrics(operation)
		if (operationMetrics.length === 0) return 0

		const total = operationMetrics.reduce((sum, m) => sum + m.duration, 0)
		return total / operationMetrics.length
	}
}
