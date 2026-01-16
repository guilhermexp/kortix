/**
 * Simple In-Memory Query Cache
 *
 * Caches expensive database queries to reduce load for production with 1000+ users
 * Uses LRU (Least Recently Used) strategy with TTL (Time To Live)
 */

interface CacheEntry<T> {
	data: T
	/** Last access time (used for TTL + LRU ordering) */
	timestamp: number
	hits: number
}

interface CacheStats {
	hits: number
	misses: number
	size: number
	hitRate: number
}

class QueryCache {
	private cache: Map<string, CacheEntry<any>> = new Map()
	private readonly maxSize: number
	private readonly ttl: number // milliseconds
	private hits = 0
	private misses = 0

	constructor(options: { maxSize?: number; ttl?: number } = {}) {
		this.maxSize = options.maxSize ?? 1000 // Store up to 1000 entries
		this.ttl = options.ttl ?? 5 * 60 * 1000 // 5 minutes default TTL
	}

	/**
	 * Get cached data if available and not expired
	 */
	get<T>(key: string): T | null {
		const entry = this.cache.get(key)

		if (!entry) {
			this.misses++
			return null
		}

		const now = Date.now()
		const age = now - entry.timestamp

		// Check if expired
		if (age > this.ttl) {
			this.cache.delete(key)
			this.misses++
			return null
		}

		// Update hit count + access time, and move to the end (MRU)
		entry.hits++
		entry.timestamp = now
		this.cache.delete(key)
		this.cache.set(key, entry)
		this.hits++
		return entry.data as T
	}

	/**
	 * Store data in cache
	 */
	set<T>(key: string, data: T): void {
		// Ensure key is treated as most-recently-used
		if (this.cache.has(key)) {
			this.cache.delete(key)
		}

		// If cache is full, remove least recently used entry
		if (this.cache.size >= this.maxSize) {
			this.evictLRU()
		}

		this.cache.set(key, {
			data,
			timestamp: Date.now(),
			hits: 0,
		})
	}

	/**
	 * Remove entry from cache
	 */
	delete(key: string): void {
		this.cache.delete(key)
	}

	/**
	 * Clear entire cache
	 */
	clear(): void {
		this.cache.clear()
		this.hits = 0
		this.misses = 0
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		const total = this.hits + this.misses
		return {
			hits: this.hits,
			misses: this.misses,
			size: this.cache.size,
			hitRate: total > 0 ? (this.hits / total) * 100 : 0,
		}
	}

	/**
	 * Reset statistics counters (useful after logging stats)
	 */
	resetStats(): void {
		this.hits = 0
		this.misses = 0
	}

	/**
	 * Evict least recently used entry
	 */
	private evictLRU(): void {
		const oldestKey = this.cache.keys().next().value as string | undefined
		if (oldestKey !== undefined) this.cache.delete(oldestKey)
	}

	/**
	 * Clean up expired entries (should be called periodically)
	 */
	cleanup(): number {
		const now = Date.now()
		let removed = 0

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > this.ttl) {
				this.cache.delete(key)
				removed++
			}
		}

		return removed
	}
}

// Create singleton instances for different cache types
export const documentListCache = new QueryCache({
	maxSize: 500, // Cache 500 different list queries
	ttl: 2 * 60 * 1000, // 2 minutes TTL for lists (frequently updated)
})

export const documentCache = new QueryCache({
	maxSize: 2000, // Cache 2000 individual documents
	ttl: 10 * 60 * 1000, // 10 minutes TTL for single documents
})

export const searchCache = new QueryCache({
	maxSize: 1000, // Cache 1000 search queries
	ttl: 5 * 60 * 1000, // 5 minutes TTL for search results
})

declare global {
	// eslint-disable-next-line no-var
	var __KORTIX_QUERY_CACHE_INTERVALS_STARTED: boolean | undefined
	// eslint-disable-next-line no-var
	var __KORTIX_QUERY_CACHE_CLEANUP_INTERVAL: NodeJS.Timeout | undefined
	// eslint-disable-next-line no-var
	var __KORTIX_QUERY_CACHE_STATS_INTERVAL: NodeJS.Timeout | undefined
}

// Clear previous intervals if they exist (handles hot reload)
if (globalThis.__KORTIX_QUERY_CACHE_CLEANUP_INTERVAL) {
	clearInterval(globalThis.__KORTIX_QUERY_CACHE_CLEANUP_INTERVAL)
}
if (globalThis.__KORTIX_QUERY_CACHE_STATS_INTERVAL) {
	clearInterval(globalThis.__KORTIX_QUERY_CACHE_STATS_INTERVAL)
}

if (!globalThis.__KORTIX_QUERY_CACHE_INTERVALS_STARTED) {
	globalThis.__KORTIX_QUERY_CACHE_INTERVALS_STARTED = true

	// Cleanup interval - run every 15 minutes in production, 30 minutes in development
	// Increased to reduce CPU overhead from frequent cache iterations
	const cleanupInterval =
		process.env.NODE_ENV === "production" ? 15 * 60 * 1000 : 30 * 60 * 1000
	globalThis.__KORTIX_QUERY_CACHE_CLEANUP_INTERVAL = setInterval(() => {
		const removedLists = documentListCache.cleanup()
		const removedDocs = documentCache.cleanup()
		const removedSearch = searchCache.cleanup()

		// Only log if we actually removed something
		if (removedDocs + removedLists + removedSearch > 0) {
			console.log(
				`[Cache] Cleaned up ${removedDocs + removedLists + removedSearch} expired entries`,
			)
		}
	}, cleanupInterval)

	// Log cache stats only in production and only when there's activity
	if (process.env.NODE_ENV === "production") {
		globalThis.__KORTIX_QUERY_CACHE_STATS_INTERVAL = setInterval(
			() => {
				const stats = {
					documentList: documentListCache.getStats(),
					document: documentCache.getStats(),
					search: searchCache.getStats(),
				}

				// Only log if cache has been used (hits + misses > 0)
				const hasActivity =
					stats.documentList.hits + stats.documentList.misses > 0 ||
					stats.document.hits + stats.document.misses > 0 ||
					stats.search.hits + stats.search.misses > 0

				if (hasActivity) {
					const totalRequests =
						stats.documentList.hits +
						stats.documentList.misses +
						stats.document.hits +
						stats.document.misses +
						stats.search.hits +
						stats.search.misses

					console.log(
						`[Cache] Stats (${totalRequests} requests, TTL: list=2m/doc=10m/search=5m):`,
						{
							documentList: {
								...stats.documentList,
								maxSize: 500,
								hitRate: `${stats.documentList.hitRate.toFixed(1)}%`,
							},
							document: {
								...stats.document,
								maxSize: 2000,
								hitRate: `${stats.document.hitRate.toFixed(1)}%`,
							},
							search: {
								...stats.search,
								maxSize: 1000,
								hitRate: `${stats.search.hitRate.toFixed(1)}%`,
							},
						},
					)

					// Reset stats after logging to get fresh metrics for next interval
					documentListCache.resetStats()
					documentCache.resetStats()
					searchCache.resetStats()
				}
			},
			30 * 60 * 1000, // Every 30 minutes in production (reduced from 10 to avoid log spam)
		)
	}
}

/**
 * Helper function to generate cache keys
 */
export function generateCacheKey(
	prefix: string,
	params: Record<string, any>,
): string {
	const sortedParams = Object.keys(params)
		.sort()
		.map((key) => `${key}=${JSON.stringify(params[key])}`)
		.join("&")

	return `${prefix}:${sortedParams}`
}

// Export for external monitoring
export function getAllCacheStats() {
	return {
		documentList: documentListCache.getStats(),
		document: documentCache.getStats(),
		search: searchCache.getStats(),
	}
}
