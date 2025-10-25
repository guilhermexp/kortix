/**
 * Rate Limiting Middleware
 *
 * Implements sliding window rate limiting to protect against abuse and DoS attacks.
 * Uses in-memory storage (suitable for single-instance deployments).
 * For multi-instance deployments, consider using Redis-backed storage.
 */

import type { Context, Next } from "hono"
import { HTTPException } from "hono/http-exception"
import { RATE_LIMITS } from "../config/constants"

/**
 * Request record for sliding window algorithm
 */
interface RequestRecord {
	count: number
	windowStart: number
}

/**
 * In-memory store for rate limit tracking
 * Key format: `${identifier}:${endpoint}`
 */
const requestStore = new Map<string, RequestRecord>()

/**
 * Cleanup interval to prevent memory leaks
 * Runs every 5 minutes to remove expired entries
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

/**
 * Get client identifier from request
 * Priority: API key > IP address > User ID
 */
function getClientIdentifier(c: Context): string {
	// Try API key first (most specific)
	const apiKey = c.req.header("x-api-key") || c.req.header("authorization")
	if (apiKey) {
		return `api:${apiKey.slice(0, 16)}` // Use first 16 chars to avoid huge keys
	}

	// Try IP address
	const forwardedFor = c.req.header("x-forwarded-for")
	const ip = forwardedFor?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown"

	return `ip:${ip}`
}

/**
 * Get rate limit for specific path
 */
function getRateLimitForPath(path: string): number {
	// Match path patterns to rate limit categories
	if (path.startsWith("/api/auth") || path.includes("/login") || path.includes("/register")) {
		return RATE_LIMITS.LIMITS.AUTH
	}

	if (path.startsWith("/v3/documents") && path.includes("/file")) {
		return RATE_LIMITS.LIMITS.UPLOAD
	}

	if (path.startsWith("/v3/documents") || path.startsWith("/v3/projects")) {
		return RATE_LIMITS.LIMITS.INGESTION
	}

	if (path.startsWith("/v3/search") || path.startsWith("/v4/search")) {
		return RATE_LIMITS.LIMITS.SEARCH
	}

	if (path.startsWith("/chat")) {
		return RATE_LIMITS.LIMITS.CHAT
	}

	return RATE_LIMITS.LIMITS.DEFAULT
}

/**
 * Check if path should skip rate limiting
 */
function shouldSkipPath(path: string): boolean {
	return RATE_LIMITS.SKIP_PATHS.some(skipPath => path === skipPath || path.startsWith(skipPath))
}

/**
 * Cleanup old entries from request store
 */
function cleanupExpiredEntries(): void {
	const now = Date.now()
	const expiredKeys: string[] = []

	// Convert entries to array to avoid iteration issues
	const entries = Array.from(requestStore.entries())

	for (const [key, record] of entries) {
		// Remove entries older than 2x the window (safety margin)
		if (now - record.windowStart > RATE_LIMITS.WINDOW_MS * 2) {
			expiredKeys.push(key)
		}
	}

	for (const key of expiredKeys) {
		requestStore.delete(key)
	}

	if (expiredKeys.length > 0) {
		console.info(`Rate limiter: Cleaned up ${expiredKeys.length} expired entries`)
	}
}

/**
 * Start periodic cleanup
 */
let cleanupTimer: Timer | null = null

function startCleanupTimer(): void {
	if (cleanupTimer) return // Already running

	cleanupTimer = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS)

	// Ensure timer doesn't prevent process from exiting
	if (cleanupTimer.unref) {
		cleanupTimer.unref()
	}
}

/**
 * Rate limiting middleware using sliding window algorithm
 *
 * @param options - Configuration options
 * @param options.limit - Override default rate limit
 * @param options.windowMs - Override default time window
 */
export function rateLimiter(options: {
	limit?: number
	windowMs?: number
} = {}) {
	// Start cleanup timer on first use
	startCleanupTimer()

	return async (c: Context, next: Next) => {
		const path = c.req.path

		// Skip rate limiting for specific paths
		if (shouldSkipPath(path)) {
			return next()
		}

		const identifier = getClientIdentifier(c)
		const limit = options.limit ?? getRateLimitForPath(path)
		const windowMs = options.windowMs ?? RATE_LIMITS.WINDOW_MS

		const key = `${identifier}:${path}`
		const now = Date.now()

		// Get or create request record
		let record = requestStore.get(key)

		if (!record || now - record.windowStart >= windowMs) {
			// Start new window
			record = {
				count: 1,
				windowStart: now,
			}
			requestStore.set(key, record)

			// Add rate limit headers
			c.header("X-RateLimit-Limit", limit.toString())
			c.header("X-RateLimit-Remaining", (limit - 1).toString())
			c.header("X-RateLimit-Reset", new Date(now + windowMs).toISOString())

			return next()
		}

		// Increment counter
		record.count++

		// Calculate remaining requests
		const remaining = Math.max(0, limit - record.count)

		// Add rate limit headers
		c.header("X-RateLimit-Limit", limit.toString())
		c.header("X-RateLimit-Remaining", remaining.toString())
		c.header("X-RateLimit-Reset", new Date(record.windowStart + windowMs).toISOString())

		// Check if limit exceeded
		if (record.count > limit) {
			const resetTime = new Date(record.windowStart + windowMs)
			const retryAfter = Math.ceil((resetTime.getTime() - now) / 1000)

			c.header("Retry-After", retryAfter.toString())

			throw new HTTPException(429, {
				message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
				cause: {
					identifier: identifier.split(":")[0], // Only include type (ip/api)
					limit,
					windowMs,
					resetTime: resetTime.toISOString(),
				},
			})
		}

		return next()
	}
}

/**
 * Get current rate limiter statistics (for monitoring)
 */
export function getRateLimiterStats() {
	return {
		totalKeys: requestStore.size,
		windowMs: RATE_LIMITS.WINDOW_MS,
		limits: RATE_LIMITS.LIMITS,
	}
}

/**
 * Clear all rate limit records (useful for testing)
 */
export function clearRateLimitStore(): void {
	requestStore.clear()
}

/**
 * Stop cleanup timer (useful for graceful shutdown)
 */
export function stopCleanupTimer(): void {
	if (cleanupTimer) {
		clearInterval(cleanupTimer)
		cleanupTimer = null
	}
}
