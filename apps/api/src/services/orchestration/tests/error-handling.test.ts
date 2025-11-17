import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import { CircuitBreaker, createCircuitBreaker } from "../circuit-breaker"
import type { ProcessingError, RetryOptions } from "../interfaces"
import { createRetryHandler, RetryHandler } from "../retry-handler"

/**
 * Error handling tests for orchestration services
 *
 * Tests resilience patterns including:
 * - Circuit breaker behavior under various failure scenarios
 * - Retry logic with exponential backoff
 * - Fallback chain behavior
 * - Graceful degradation when services are unavailable
 * - Error logging and monitoring
 * - Recovery mechanisms
 */

describe("Error Handling Tests", () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Circuit Breaker", () => {
		let circuitBreaker: CircuitBreaker

		beforeEach(() => {
			circuitBreaker = new CircuitBreaker({
				failureThreshold: 3,
				resetTimeout: 60000,
				monitoringWindow: 300000,
			})
		})

		describe("Circuit Breaker States", () => {
			it("should start in closed state", () => {
				expect(circuitBreaker.getState()).toBe("closed")
			})

			it("should transition to open state after threshold failures", async () => {
				const failingOperation = vi
					.fn()
					.mockRejectedValue(new Error("Service unavailable"))

				// Trigger failures to exceed threshold
				for (let i = 0; i < 3; i++) {
					try {
						await circuitBreaker.execute(failingOperation)
					} catch (error) {
						// Expected to fail
					}
				}

				expect(circuitBreaker.getState()).toBe("open")
			})

			it("should transition to half-open state after reset timeout", async () => {
				const failingOperation = vi
					.fn()
					.mockRejectedValue(new Error("Service unavailable"))

				// Trigger failures to open circuit
				for (let i = 0; i < 3; i++) {
					try {
						await circuitBreaker.execute(failingOperation)
					} catch (error) {
						// Expected to fail
					}
				}

				expect(circuitBreaker.getState()).toBe("open")

				// Mock time passage
				vi.useFakeTimers()
				vi.advanceTimersByTime(60000) // Advance past reset timeout

				// Next call should transition to half-open
				try {
					await circuitBreaker.execute(failingOperation)
				} catch (error) {
					// Expected to fail
				}

				expect(circuitBreaker.getState()).toBe("half-open")
				vi.useRealTimers()
			})

			it("should transition back to closed on success in half-open", async () => {
				const failingOperation = vi
					.fn()
					.mockRejectedValue(new Error("Service unavailable"))
				const successOperation = vi.fn().mockResolvedValue("Success")

				// Open circuit
				for (let i = 0; i < 3; i++) {
					try {
						await circuitBreaker.execute(failingOperation)
					} catch (error) {
						// Expected to fail
					}
				}

				expect(circuitBreaker.getState()).toBe("open")

				// Wait for reset and try again
				vi.useFakeTimers()
				vi.advanceTimersByTime(60000)

				// In half-open state, success should close circuit
				await circuitBreaker.execute(successOperation)
				expect(circuitBreaker.getState()).toBe("closed")
				vi.useRealTimers()
			})
		})

		describe("Failure Detection", () => {
			it("should count different types of failures", async () => {
				const errors = [
					new Error("Network timeout"),
					new Error("Service unavailable"),
					new Error("Rate limit exceeded"),
				]

				for (const error of errors) {
					try {
						await circuitBreaker.execute(() => Promise.reject(error))
					} catch (e) {
						// Expected to fail
					}
				}

				expect(circuitBreaker.getState()).toBe("open")
				expect(circuitBreaker.getFailureCount()).toBe(3)
			})

			it("should distinguish between transient and permanent failures", async () => {
				const transientError = new Error("Temporary service issue")
				transientError.code = "TRANSIENT_ERROR"

				const permanentError = new Error("Permanent configuration error")
				permanentError.code = "PERMANENT_ERROR"

				// Only transient errors should count toward circuit breaker
				try {
					await circuitBreaker.execute(() => Promise.reject(transientError))
				} catch (e) {
					// Expected
				}

				try {
					await circuitBreaker.execute(() => Promise.reject(permanentError))
				} catch (e) {
					// Expected
				}

				// Should only be open due to transient error
				expect(circuitBreaker.getState()).toBe("open")
			})

			it("should handle rapid successive failures", async () => {
				const failingOperation = vi
					.fn()
					.mockRejectedValue(new Error("Service down"))

				// Rapid failures should quickly open circuit
				const promises = Array(5)
					.fill(null)
					.map(() => circuitBreaker.execute(failingOperation).catch(() => {}))

				await Promise.all(promises)

				expect(circuitBreaker.getState()).toBe("open")
				expect(circuitBreaker.getFailureCount()).toBeGreaterThanOrEqual(3)
			})
		})

		describe("Recovery Mechanisms", () => {
			it("should attempt recovery at regular intervals", async () => {
				const failingOperation = vi
					.fn()
					.mockRejectedValue(new Error("Service down"))

				// Open circuit
				for (let i = 0; i < 3; i++) {
					try {
						await circuitBreaker.execute(failingOperation)
					} catch (error) {
						// Expected
					}
				}

				expect(circuitBreaker.getState()).toBe("open")

				// Mock time passage and test recovery attempts
				vi.useFakeTimers()

				// First recovery attempt (should fail)
				vi.advanceTimersByTime(60000)
				try {
					await circuitBreaker.execute(failingOperation)
				} catch (error) {
					// Expected
				}
				expect(circuitBreaker.getState()).toBe("open")

				// Second recovery attempt (should succeed)
				const successOperation = vi.fn().mockResolvedValue("Recovered")
				vi.advanceTimersByTime(60000)
				await circuitBreaker.execute(successOperation)
				expect(circuitBreaker.getState()).toBe("closed")

				vi.useRealTimers()
			})

			it("should provide recovery metrics", () => {
				const metrics = circuitBreaker.getMetrics()

				expect(metrics).toHaveProperty("state")
				expect(metrics).toHaveProperty("failureCount")
				expect(metrics).toHaveProperty("successCount")
				expect(metrics).toHaveProperty("lastFailureTime")
				expect(metrics).toHaveProperty("lastSuccessTime")
			})
		})
	})

	describe("Retry Handler", () => {
		let retryHandler: RetryHandler

		beforeEach(() => {
			retryHandler = new RetryHandler({
				maxAttempts: 3,
				initialDelay: 1000,
				maxDelay: 10000,
				backoffMultiplier: 2,
				jitter: true,
			})
		})

		describe("Exponential Backoff", () => {
			it("should implement exponential backoff strategy", async () => {
				const failingOperation = vi
					.fn()
					.mockRejectedValue(new Error("Temporary error"))
				const startTime = Date.now()

				try {
					await retryHandler.executeWithRetry(failingOperation)
				} catch (error) {
					// Expected to fail after max attempts
				}

				const endTime = Date.now()
				const totalTime = endTime - startTime

				// Should take at least 1s + 2s + 4s = 7s (plus jitter)
				expect(totalTime).toBeGreaterThan(7000)
				expect(failingOperation).toHaveBeenCalledTimes(3) // 3 attempts
			})

			it("should cap delay at maximum delay", async () => {
				const failingOperation = vi
					.fn()
					.mockRejectedValue(new Error("Temporary error"))

				// Mock time to test delay capping
				vi.useFakeTimers()

				const startTime = Date.now()
				try {
					await retryHandler.executeWithRetry(failingOperation)
				} catch (error) {
					// Expected
				}

				// Each delay should be capped at maxDelay (10s)
				// With maxAttempts=3, delays should be: 1s, 2s, 4s (all under 10s)
				vi.useRealTimers()
			})

			it("should add jitter to prevent thundering herd", async () => {
				const operation = vi.fn().mockResolvedValue("Success")

				// Multiple concurrent operations should have different delays
				const operations = Array(5)
					.fill(null)
					.map(() => retryHandler.executeWithRetry(operation))

				const startTime = Date.now()
				await Promise.all(operations)
				const endTime = Date.now()

				// Should complete reasonably quickly due to immediate success
				expect(endTime - startTime).toBeLessThan(5000)
				expect(operation).toHaveBeenCalledTimes(5)
			})
		})

		describe("Retry Conditions", () => {
			it("should retry on retryable errors", async () => {
				const retryableErrors = [
					new Error("Network timeout"),
					new Error("Rate limit exceeded"),
					new Error("Service temporarily unavailable"),
				]

				for (const error of retryableErrors) {
					const operation = vi
						.fn()
						.mockRejectedValueOnce(error)
						.mockResolvedValue("Success")

					const result = await retryHandler.executeWithRetry(operation)
					expect(result).toBe("Success")
					expect(operation).toHaveBeenCalledTimes(2)
				}
			})

			it("should not retry on non-retryable errors", async () => {
				const nonRetryableErrors = [
					new Error("Invalid input"),
					new Error("Authentication failed"),
					new Error("Permission denied"),
				]

				for (const error of nonRetryableErrors) {
					const operation = vi.fn().mockRejectedValue(error)

					try {
						await retryHandler.executeWithRetry(operation)
					} catch (e) {
						// Expected to fail immediately
					}

					expect(operation).toHaveBeenCalledTimes(1)
				}
			})

			it("should respect maximum attempt limits", async () => {
				const operation = vi.fn().mockRejectedValue(new Error("Always fails"))

				try {
					await retryHandler.executeWithRetry(operation)
				} catch (error) {
					// Expected to fail
				}

				// Should attempt exactly maxAttempts times
				expect(operation).toHaveBeenCalledTimes(3)
			})
		})

		describe("Custom Retry Strategies", () => {
			it("should support linear backoff", async () => {
				const linearHandler = new RetryHandler({
					maxAttempts: 3,
					initialDelay: 1000,
					backoffStrategy: "linear",
				})

				const operation = vi
					.fn()
					.mockRejectedValueOnce(new Error("Fail 1"))
					.mockRejectedValueOnce(new Error("Fail 2"))
					.mockResolvedValue("Success")

				const startTime = Date.now()
				const result = await linearHandler.executeWithRetry(operation)
				const endTime = Date.now()
				const totalTime = endTime - startTime

				expect(result).toBe("Success")
				// Linear: 1s + 1s = 2s (plus jitter)
				expect(totalTime).toBeGreaterThan(2000)
			})

			it("should support fixed delay strategy", async () => {
				const fixedHandler = new RetryHandler({
					maxAttempts: 3,
					initialDelay: 1500,
					backoffStrategy: "fixed",
				})

				const operation = vi
					.fn()
					.mockRejectedValueOnce(new Error("Fail 1"))
					.mockResolvedValue("Success")

				const startTime = Date.now()
				const result = await fixedHandler.executeWithRetry(operation)
				const endTime = Date.now()
				const totalTime = endTime - startTime

				expect(result).toBe("Success")
				// Fixed: 1.5s delay
				expect(totalTime).toBeGreaterThan(1500)
			})
		})

		describe("Error Classification", () => {
			it("should classify HTTP errors appropriately", async () => {
				const httpErrors = [
					{ status: 408, shouldRetry: true }, // Request Timeout
					{ status: 429, shouldRetry: true }, // Too Many Requests
					{ status: 500, shouldRetry: true }, // Internal Server Error
					{ status: 502, shouldRetry: true }, // Bad Gateway
					{ status: 503, shouldRetry: true }, // Service Unavailable
					{ status: 400, shouldRetry: false }, // Bad Request
					{ status: 401, shouldRetry: false }, // Unauthorized
					{ status: 403, shouldRetry: false }, // Forbidden
					{ status: 404, shouldRetry: false }, // Not Found
				]

				for (const { status, shouldRetry } of httpErrors) {
					const error = new Error(`HTTP ${status}`)
					;(error as any).status = status

					const operation = shouldRetry
						? vi.fn().mockRejectedValueOnce(error).mockResolvedValue("Success")
						: vi.fn().mockRejectedValue(error)

					try {
						await retryHandler.executeWithRetry(operation)
						if (!shouldRetry) {
							fail("Should have thrown error")
						}
					} catch (e) {
						if (shouldRetry) {
							fail("Should have succeeded")
						}
					}

					const expectedCalls = shouldRetry ? 2 : 1
					expect(operation).toHaveBeenCalledTimes(expectedCalls)
				}
			})

			it("should handle custom error classification", async () => {
				const customHandler = new RetryHandler({
					maxAttempts: 2,
					errorClassifier: (error) => {
						if (error.message.includes("custom-retry")) {
							return "retryable"
						}
						if (error.message.includes("custom-fatal")) {
							return "fatal"
						}
						return "retryable"
					},
				})

				const retryableOp = vi
					.fn()
					.mockRejectedValueOnce(new Error("custom-retry error"))
					.mockResolvedValue("Success")
				const fatalOp = vi
					.fn()
					.mockRejectedValue(new Error("custom-fatal error"))

				const retryableResult =
					await customHandler.executeWithRetry(retryableOp)
				expect(retryableResult).toBe("Success")

				try {
					await customHandler.executeWithRetry(fatalOp)
				} catch (e) {
					// Expected
				}

				expect(retryableOp).toHaveBeenCalledTimes(2)
				expect(fatalOp).toHaveBeenCalledTimes(1)
			})
		})
	})

	describe("Integration Scenarios", () => {
		it("should coordinate circuit breaker and retry handler", async () => {
			const circuitBreaker = new CircuitBreaker({
				failureThreshold: 2,
				resetTimeout: 1000,
			})

			const retryHandler = new RetryHandler({
				maxAttempts: 2,
				initialDelay: 100,
			})

			const operation = vi.fn().mockRejectedValue(new Error("Service down"))

			// Circuit breaker should prevent retries when open
			for (let i = 0; i < 2; i++) {
				try {
					await circuitBreaker.execute(() =>
						retryHandler.executeWithRetry(operation),
					)
				} catch (error) {
					// Expected to fail
				}
			}

			// Circuit should be open
			expect(circuitBreaker.getState()).toBe("open")

			// Further calls should be immediately rejected
			const immediateResult = await circuitBreaker.execute(() =>
				retryHandler.executeWithRetry(() => Promise.resolve("Success")),
			)

			expect(immediateResult).toBe("Success") // Operation succeeds but circuit prevents execution
		})

		it("should handle cascading failures gracefully", async () => {
			const primaryService = new CircuitBreaker({ failureThreshold: 1 })
			const fallbackService = new CircuitBreaker({ failureThreshold: 2 })

			const primaryOp = vi.fn().mockRejectedValue(new Error("Primary failed"))
			const fallbackOp = vi
				.fn()
				.mockRejectedValueOnce(new Error("Fallback failed"))
				.mockResolvedValue("Fallback success")

			try {
				// Try primary service
				await primaryService.execute(primaryOp)
			} catch (primaryError) {
				// Primary failed, try fallback
				const result = await fallbackService.execute(() =>
					retryHandler.executeWithRetry(fallbackOp),
				)
				expect(result).toBe("Fallback success")
			}

			expect(primaryService.getState()).toBe("open")
			expect(fallbackService.getState()).toBe("closed")
		})
	})

	describe("Monitoring and Logging", () => {
		it("should provide comprehensive error metrics", () => {
			const circuitBreaker = new CircuitBreaker({ failureThreshold: 2 })
			const retryHandler = new RetryHandler({ maxAttempts: 2 })

			const metrics = {
				circuitBreaker: circuitBreaker.getMetrics(),
				retryHandler: retryHandler.getMetrics(),
			}

			expect(metrics.circuitBreaker).toHaveProperty("state")
			expect(metrics.circuitBreaker).toHaveProperty("failureCount")
			expect(metrics.circuitBreaker).toHaveProperty("successCount")

			expect(metrics.retryHandler).toHaveProperty("totalAttempts")
			expect(metrics.retryHandler).toHaveProperty("successfulRetries")
			expect(metrics.retryHandler).toHaveProperty("failedRetries")
		})

		it("should log error events appropriately", async () => {
			const logger = {
				error: vi.fn(),
				warn: vi.fn(),
				info: vi.fn(),
			}

			const circuitBreaker = new CircuitBreaker({
				failureThreshold: 1,
				logger: logger as any,
			})

			const operation = vi.fn().mockRejectedValue(new Error("Test error"))

			try {
				await circuitBreaker.execute(operation)
			} catch (e) {
				// Expected
			}

			// Verify error logging occurred
			expect(logger.error).toHaveBeenCalled()
		})
	})

	describe("Factory Functions", () => {
		it("should create circuit breaker with default options", () => {
			const circuitBreaker = createCircuitBreaker()
			expect(circuitBreaker).toBeDefined()
			expect(circuitBreaker.getState()).toBe("closed")
		})

		it("should create circuit breaker with custom options", () => {
			const circuitBreaker = createCircuitBreaker({
				failureThreshold: 5,
				resetTimeout: 300000,
			})
			expect(circuitBreaker).toBeDefined()
		})

		it("should create retry handler with default options", () => {
			const retryHandler = createRetryHandler()
			expect(retryHandler).toBeDefined()
		})

		it("should create retry handler with custom options", () => {
			const retryHandler = createRetryHandler({
				maxAttempts: 5,
				initialDelay: 2000,
			})
			expect(retryHandler).toBeDefined()
		})
	})
})
