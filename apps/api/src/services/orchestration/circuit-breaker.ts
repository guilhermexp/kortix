/**
 * Circuit Breaker Implementation
 *
 * Implements the circuit breaker pattern to protect against cascading failures.
 * The circuit breaker has three states:
 * - Closed: Normal operation, requests pass through
 * - Open: Failure threshold exceeded, requests fail fast
 * - Half-Open: Testing if service recovered, limited requests allowed
 *
 * Features:
 * - Automatic state transitions based on failure rates
 * - Configurable thresholds and timeouts
 * - Event emission for monitoring
 * - Metrics collection
 */

import { BaseService } from "../base/base-service"
import type {
	CircuitBreakerEvent,
	CircuitBreakerMetrics,
	CircuitBreakerOptions,
	CircuitBreakerState,
	CircuitBreaker as ICircuitBreaker,
	StateChange,
} from "../interfaces"

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

/**
 * Circuit breaker for protecting services from cascading failures
 */
export class CircuitBreaker extends BaseService implements ICircuitBreaker {
	private state: "closed" | "open" | "half-open" = "closed"
	private failures = 0
	private successes = 0
	private totalRequests = 0
	private lastFailureTime: Date | null = null
	private lastSuccessTime: Date | null = null
	private stateChanges: StateChange[] = []
	private readonly options: Required<CircuitBreakerOptions>
	private readonly eventListeners: Array<(event: CircuitBreakerEvent) => void> =
		[]

	// Window for tracking recent requests
	private readonly requestWindow: Array<{
		timestamp: Date
		success: boolean
	}> = []

	constructor(serviceName: string, options?: CircuitBreakerOptions) {
		super(`CircuitBreaker:${serviceName}`)

		// Set default options
		this.options = {
			failureThreshold: options?.failureThreshold ?? 5,
			successThreshold: options?.successThreshold ?? 2,
			resetTimeout: options?.resetTimeout ?? 60000, // 1 minute
			monitoringWindow: options?.monitoringWindow ?? 300000, // 5 minutes
			minimumRequests: options?.minimumRequests ?? 1,
			errorFilter: options?.errorFilter ?? (() => true),
		}

		this.logger.info("Circuit breaker initialized", {
			options: this.options,
		})
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Execute operation with circuit breaker protection
	 */
	async execute<T>(
		operation: () => Promise<T>,
		options?: CircuitBreakerOptions,
	): Promise<T> {
		// Merge with instance options if provided
		const effectiveOptions = options
			? { ...this.options, ...options }
			: this.options

		// Check if circuit is open
		if (this.state === "open") {
			const timeSinceLastFailure = this.lastFailureTime
				? Date.now() - this.lastFailureTime.getTime()
				: Number.POSITIVE_INFINITY

			if (timeSinceLastFailure < effectiveOptions.resetTimeout) {
				// Circuit is still open
				this.emitEvent({
					type: "rejected",
					timestamp: new Date(),
					serviceName: this.serviceName,
				})

				throw this.createError(
					"CIRCUIT_BREAKER_OPEN",
					"Circuit breaker is open",
					{
						state: this.state,
						timeSinceLastFailure,
						resetTimeout: effectiveOptions.resetTimeout,
					},
				)
			}

			// Attempt to transition to half-open
			this.transitionTo("half-open", "Reset timeout elapsed")
		}

		// Execute operation
		try {
			const result = await operation()
			this.onSuccess()
			return result
		} catch (error) {
			this.onFailure(error as Error, effectiveOptions)
			throw error
		}
	}

	/**
	 * Get current state
	 */
	getState(): CircuitBreakerState {
		return {
			state: this.state,
			failures: this.failures,
			lastFailureTime: this.lastFailureTime?.getTime() ?? 0,
			lastSuccessTime: this.lastSuccessTime?.getTime() ?? 0,
			totalRequests: this.totalRequests,
			successfulRequests: this.successes,
		}
	}

	/**
	 * Reset circuit breaker
	 */
	reset(): void {
		this.logger.info("Resetting circuit breaker")
		this.transitionTo("closed", "Manual reset")
		this.failures = 0
		this.successes = 0
		this.totalRequests = 0
		this.lastFailureTime = null
		this.lastSuccessTime = null
		this.requestWindow.length = 0
	}

	/**
	 * Force open circuit breaker
	 */
	forceOpen(): void {
		this.logger.warn("Forcing circuit breaker open")
		this.transitionTo("open", "Forced open")
	}

	/**
	 * Force close circuit breaker
	 */
	forceClose(): void {
		this.logger.info("Forcing circuit breaker closed")
		this.transitionTo("closed", "Forced close")
		this.failures = 0
	}

	/**
	 * Get circuit breaker metrics
	 */
	getMetrics(): CircuitBreakerMetrics {
		const recentRequests = this.getRequestsInWindow()
		const recentFailures = recentRequests.filter((r) => !r.success).length

		return {
			state: this.state,
			failures: this.failures,
			failureCount: this.failures as any,
			successes: this.successes,
			successCount: this.successes as any,
			totalRequests: this.totalRequests,
			lastFailureTime: this.lastFailureTime,
			lastSuccessTime: this.lastSuccessTime,
			stateChanges: [...this.stateChanges],
			failureRate:
				this.totalRequests > 0 ? this.failures / this.totalRequests : 0,
			successRate:
				this.totalRequests > 0 ? this.successes / this.totalRequests : 0,
		}
	}

	/**
	 * Subscribe to circuit breaker events
	 */
	subscribe(listener: (event: CircuitBreakerEvent) => void): () => void {
		this.eventListeners.push(listener)
		return () => {
			const index = this.eventListeners.indexOf(listener)
			if (index >= 0) {
				this.eventListeners.splice(index, 1)
			}
		}
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	/**
	 * Handle successful operation
	 */
	private onSuccess(): void {
		this.totalRequests++
		this.successes++
		this.lastSuccessTime = new Date()

		this.recordRequest(true)

		this.emitEvent({
			type: "success",
			timestamp: new Date(),
			serviceName: this.serviceName,
		})

		// Transition from half-open to closed if success threshold met
		if (this.state === "half-open") {
			const recentRequests = this.getRequestsInWindow()
			const recentSuccesses = recentRequests.filter((r) => r.success).length

			if (recentSuccesses >= this.options.successThreshold) {
				this.transitionTo("closed", "Success threshold met")
				this.failures = 0
			}
		}
	}

	/**
	 * Handle failed operation
	 */
	private onFailure(
		error: Error,
		options: Required<CircuitBreakerOptions>,
	): void {
		this.totalRequests++
		this.lastFailureTime = new Date()

		// Check if error should be counted
		if (!options.errorFilter(error)) {
			this.logger.debug("Error filtered out by errorFilter", {
				error: error.message,
			})
			return
		}

		this.failures++
		this.recordRequest(false)

		this.emitEvent({
			type: "failure",
			timestamp: new Date(),
			serviceName: this.serviceName,
			error,
		})

		// Check if we should open the circuit
		if (this.state === "closed" || this.state === "half-open") {
			const recentRequests = this.getRequestsInWindow()

			const recentFailures = recentRequests.filter((r) => !r.success).length
			if (recentFailures >= options.failureThreshold) {
				this.transitionTo(
					"open",
					`Failure threshold exceeded (${recentFailures})`,
				)
			}
		}

		// If in half-open and got failure, immediately open
		if (this.state === "half-open") {
			this.transitionTo("open", "Failure in half-open state")
		}
	}

	/**
	 * Transition to new state
	 */
	private transitionTo(
		newState: "closed" | "open" | "half-open",
		reason: string,
	): void {
		if (this.state === newState) return

		const previousState = this.state
		this.state = newState

		const stateChange: StateChange = {
			from: previousState,
			to: newState,
			timestamp: new Date(),
			reason,
		}

		this.stateChanges.push(stateChange)

		// Keep only recent state changes
		if (this.stateChanges.length > 100) {
			this.stateChanges.shift()
		}

		this.logger.info("Circuit breaker state changed", {
			from: previousState,
			to: newState,
			reason,
		})

		// Emit state change event
		const eventType =
			newState === "open"
				? "opened"
				: newState === "closed"
					? "closed"
					: "half_opened"

		this.emitEvent({
			type: eventType,
			timestamp: new Date(),
			serviceName: this.serviceName,
			metadata: { reason },
		})
	}

	/**
	 * Record request in time window
	 */
	private recordRequest(success: boolean): void {
		this.requestWindow.push({
			timestamp: new Date(),
			success,
		})

		// Cleanup old requests outside monitoring window
		this.cleanupRequestWindow()
	}

	/**
	 * Get requests within monitoring window
	 */
	private getRequestsInWindow(): Array<{ timestamp: Date; success: boolean }> {
		this.cleanupRequestWindow()
		return [...this.requestWindow]
	}

	/**
	 * Remove requests outside monitoring window
	 */
	private cleanupRequestWindow(): void {
		const cutoffTime = Date.now() - this.options.monitoringWindow
		let removeCount = 0

		for (const request of this.requestWindow) {
			if (request.timestamp.getTime() < cutoffTime) {
				removeCount++
			} else {
				break
			}
		}

		if (removeCount > 0) {
			this.requestWindow.splice(0, removeCount)
		}
	}

	/**
	 * Emit circuit breaker event
	 */
	private emitEvent(event: CircuitBreakerEvent): void {
		for (const listener of this.eventListeners) {
			try {
				listener(event)
			} catch (error) {
				this.logger.error("Error in event listener", error as Error)
			}
		}
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Circuit breaker is healthy if not permanently open
		return this.state !== "open" || this.canAttemptReset()
	}

	/**
	 * Check if circuit breaker can attempt reset
	 */
	private canAttemptReset(): boolean {
		if (!this.lastFailureTime) return true

		const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime()
		return timeSinceLastFailure >= this.options.resetTimeout
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a circuit breaker with default options
 */
export function createCircuitBreaker(
	serviceName: string,
	options?: CircuitBreakerOptions,
): CircuitBreaker {
	return new CircuitBreaker(serviceName, options)
}

/**
 * Create a circuit breaker with aggressive failure detection
 */
export function createAggressiveCircuitBreaker(
	serviceName: string,
): CircuitBreaker {
	return new CircuitBreaker(serviceName, {
		failureThreshold: 3,
		successThreshold: 2,
		resetTimeout: 30000, // 30 seconds
		monitoringWindow: 60000, // 1 minute
		minimumRequests: 5,
	})
}

/**
 * Create a circuit breaker with lenient failure detection
 */
export function createLenientCircuitBreaker(
	serviceName: string,
): CircuitBreaker {
	return new CircuitBreaker(serviceName, {
		failureThreshold: 10,
		successThreshold: 5,
		resetTimeout: 120000, // 2 minutes
		monitoringWindow: 600000, // 10 minutes
		minimumRequests: 20,
	})
}
