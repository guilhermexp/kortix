/**
 * Worker Circuit Breaker
 *
 * Protects the ingestion worker from cascading failures.
 * Handles both database connection errors and systemic job errors
 * (rate limits, auth failures, service outages).
 */

import { sanitizeJson } from "../services/ingestion/utils"
import { supabaseAdmin } from "../supabase"

// ============================================================================
// Configuration
// ============================================================================

export interface CircuitBreakerConfig {
	/** Consecutive failures before opening circuit */
	failureThreshold: number
	/** Max backoff time in ms */
	maxBackoff: number
	/** Base backoff time in ms */
	baseBackoff: number
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
	failureThreshold: 3,
	maxBackoff: 300_000, // 5 minutes
	baseBackoff: 5_000, // 5 seconds
}

/** Error patterns indicating systemic failures (not document-specific) */
const SYSTEMIC_ERROR_PATTERNS = [
	"rate limit", "rate_limit", "quota exceeded", "too many requests",
	"429", "503", "502", "500",
	"unauthorized", "authentication", "invalid api key", "api key",
	"forbidden", "401", "403",
	"service unavailable", "temporarily unavailable",
	"internal server error", "server error",
	"timeout", "ECONNREFUSED", "ETIMEDOUT", "fetch failed",
	"connection refused", "network error",
	"gemini", "openai", "anthropic",
	"model not found", "resource exhausted", "billing",
]

// ============================================================================
// Circuit Breaker
// ============================================================================

export class WorkerCircuitBreaker {
	private state: "closed" | "open" | "half-open" = "closed"
	private consecutiveDbFailures = 0
	private consecutiveJobFailures = 0
	private lastFailureTime = 0
	private currentBackoff: number
	private readonly config: CircuitBreakerConfig

	constructor(config?: Partial<CircuitBreakerConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.currentBackoff = this.config.baseBackoff
	}

	/** Check if the circuit breaker allows requests */
	canMakeRequest(): boolean {
		if (this.state === "closed") return true

		if (this.state === "open") {
			const elapsed = Date.now() - this.lastFailureTime
			if (elapsed >= this.currentBackoff) {
				this.state = "half-open"
				console.log(
					`[circuit-breaker] Half-open, attempting recovery after ${Math.round(this.currentBackoff / 1000)}s`,
				)
				return true
			}
			return false
		}

		return true // half-open allows one request
	}

	/** Record successful database operation */
	recordDbSuccess(): void {
		if (this.state !== "closed") {
			console.log("[circuit-breaker] Closed - database recovered")
		}
		this.state = "closed"
		this.consecutiveDbFailures = 0
		this.currentBackoff = this.config.baseBackoff
	}

	/** Record failed database operation */
	recordDbFailure(error: unknown): void {
		this.consecutiveDbFailures++
		this.lastFailureTime = Date.now()

		const msg = error instanceof Error ? error.message : String(error)
		const isConnectionError = ["timeout", "connection", "ECONNREFUSED", "fetch failed", "522", "Connection terminated"]
			.some((p) => msg.includes(p))

		if (isConnectionError && this.consecutiveDbFailures >= this.config.failureThreshold) {
			this.openCircuit()
			console.error(
				`[circuit-breaker] OPEN after ${this.consecutiveDbFailures} DB failures. ` +
				`Retry in ${Math.round(this.currentBackoff / 1000)}s. Error: ${msg}`,
			)
		}
	}

	/** Record successful job completion */
	recordJobSuccess(): void {
		this.consecutiveJobFailures = 0
	}

	/**
	 * Record a job failure. Returns true if queue should be paused.
	 */
	async recordJobFailure(error: unknown): Promise<boolean> {
		const msg = error instanceof Error ? error.message : String(error)

		if (!this.isSystemicError(msg)) {
			this.consecutiveJobFailures = 0
			return false
		}

		this.consecutiveJobFailures++
		this.lastFailureTime = Date.now()

		console.warn(
			`[circuit-breaker] Systemic error (${this.consecutiveJobFailures}/${this.config.failureThreshold}): ${msg}`,
		)

		if (this.consecutiveJobFailures >= this.config.failureThreshold) {
			console.error(
				`[circuit-breaker] QUEUE PAUSED - ${this.consecutiveJobFailures} consecutive systemic errors`,
			)
			await this.pausePendingJobs(msg)
			this.openCircuit()
			return true
		}

		return false
	}

	/** Get current backoff delay in ms */
	getBackoff(): number {
		return this.currentBackoff
	}

	/** Get remaining time until circuit breaker retry */
	getRemainingBackoff(): number {
		if (this.state !== "open") return 0
		return Math.max(this.currentBackoff - (Date.now() - this.lastFailureTime), 0)
	}

	getState(): string {
		return this.state
	}

	getConsecutiveFailures(): number {
		return this.consecutiveDbFailures
	}

	// ========================================================================
	// Private
	// ========================================================================

	private openCircuit(): void {
		this.state = "open"
		this.currentBackoff = Math.min(
			this.currentBackoff * 2 + Math.random() * 1000,
			this.config.maxBackoff,
		)
	}

	private isSystemicError(message: string): boolean {
		const lower = message.toLowerCase()
		return SYSTEMIC_ERROR_PATTERNS.some((p) => lower.includes(p.toLowerCase()))
	}

	private async pausePendingJobs(errorMessage: string): Promise<void> {
		try {
			const { data: pausedJobs, error } = await supabaseAdmin
				.from("ingestion_jobs")
				.update({
					status: "paused",
					error_message: `Queue paused: ${errorMessage}`,
				})
				.eq("status", "queued")
				.select("id, document_id")

			if (error) {
				console.error("[circuit-breaker] Failed to pause jobs:", error)
				return
			}

			const count = pausedJobs?.length ?? 0
			if (count > 0) {
				const docIds = pausedJobs?.map((j) => j.document_id) ?? []
				await supabaseAdmin
					.from("documents")
					.update({
						status: "paused",
						processing_metadata: sanitizeJson({
							pausedAt: new Date().toISOString(),
							pauseReason: errorMessage,
						}) as Record<string, unknown>,
					})
					.in("id", docIds)

				console.log(`[circuit-breaker] Paused ${count} pending jobs`)
			}
		} catch (err) {
			console.error("[circuit-breaker] Error pausing jobs:", err)
		}
	}
}
