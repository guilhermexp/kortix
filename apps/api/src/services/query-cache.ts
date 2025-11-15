/**
 * Simple In-Memory Query Cache
 *
 * Caches expensive database queries to reduce load for production with 1000+ users
 * Uses LRU (Least Recently Used) strategy with TTL (Time To Live)
 */

interface CacheEntry<T> {
  data: T
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

    const age = Date.now() - entry.timestamp

    // Check if expired
    if (age > this.ttl) {
      this.cache.delete(key)
      this.misses++
      return null
    }

    // Update hit count and return data
    entry.hits++
    this.hits++
    return entry.data as T
  }

  /**
   * Store data in cache
   */
  set<T>(key: string, data: T): void {
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
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    let lowestHits = Infinity

    for (const [key, entry] of this.cache.entries()) {
      // Prioritize entries with fewer hits and older timestamp
      const score = entry.hits * 1000 + (Date.now() - entry.timestamp)

      if (score < oldestTime || (score === oldestTime && entry.hits < lowestHits)) {
        oldestKey = key
        oldestTime = score
        lowestHits = entry.hits
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
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
  maxSize: 500,  // Cache 500 different list queries
  ttl: 2 * 60 * 1000 // 2 minutes TTL for lists (frequently updated)
})

export const documentCache = new QueryCache({
  maxSize: 2000, // Cache 2000 individual documents
  ttl: 10 * 60 * 1000 // 10 minutes TTL for single documents
})

export const searchCache = new QueryCache({
  maxSize: 1000, // Cache 1000 search queries
  ttl: 5 * 60 * 1000 // 5 minutes TTL for search results
})

// Cleanup interval - run every minute
setInterval(() => {
  const removedDocs = documentListCache.cleanup()
  const removedLists = documentCache.cleanup()
  const removedSearch = searchCache.cleanup()

  if (removedDocs + removedLists + removedSearch > 0) {
    console.log(`[Cache] Cleaned up ${removedDocs + removedLists + removedSearch} expired entries`)
  }
}, 60 * 1000)

// Log cache stats every 5 minutes
setInterval(() => {
  console.log('[Cache] Stats:', {
    documentList: documentListCache.getStats(),
    document: documentCache.getStats(),
    search: searchCache.getStats(),
  })
}, 5 * 60 * 1000)

/**
 * Helper function to generate cache keys
 */
export function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${JSON.stringify(params[key])}`)
    .join('&')

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
