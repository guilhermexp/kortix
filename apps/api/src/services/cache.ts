import { createClient, type RedisClientType } from "redis"
import { env } from "../env"

export type CacheOptions = {
	ttl?: number // Time to live in seconds
}

export class CacheService {
	private client: RedisClientType | null = null
	private connectionAttempts = 0
	private maxConnectionAttempts = 3
	private isConnected = false
	private isEnabled = false

	constructor(private readonly redisUrl?: string) {
		this.isEnabled = Boolean(redisUrl)
		if (this.isEnabled) {
			this.connect()
		}
	}

	/**
	 * Connect to Redis with retry logic
	 */
	private async connect(): Promise<void> {
		if (!this.redisUrl || this.connectionAttempts >= this.maxConnectionAttempts) {
			return
		}

		this.connectionAttempts++

		try {
			this.client = createClient({
				url: this.redisUrl,
				socket: {
					reconnectStrategy: (retries) => {
						if (retries > 10) {
							console.error("[CacheService] Max Redis reconnection attempts reached")
							return new Error("Max reconnection attempts reached")
						}
						// Exponential backoff: 100ms, 200ms, 400ms, etc.
						return Math.min(retries * 100, 3000)
					},
				},
			})

			this.client.on("error", (error) => {
				console.error("[CacheService] Redis client error:", error)
				this.isConnected = false
			})

			this.client.on("connect", () => {
				console.log("[CacheService] Redis client connected")
				this.isConnected = true
				this.connectionAttempts = 0
			})

			this.client.on("disconnect", () => {
				console.warn("[CacheService] Redis client disconnected")
				this.isConnected = false
			})

			await this.client.connect()
		} catch (error) {
			console.error(`[CacheService] Failed to connect to Redis (attempt ${this.connectionAttempts}):`, error)
			this.client = null
			this.isConnected = false

			// Retry after delay if not at max attempts
			if (this.connectionAttempts < this.maxConnectionAttempts) {
				setTimeout(() => this.connect(), 5000)
			}
		}
	}

	/**
	 * Check if cache is available
	 */
	isAvailable(): boolean {
		return this.isEnabled && this.isConnected && this.client !== null
	}

	/**
	 * Get a value from cache
	 */
	async get<T = unknown>(key: string): Promise<T | null> {
		if (!this.isAvailable()) {
			return null
		}

		try {
			const value = await this.client!.get(key)
			if (!value) {
				return null
			}

			return JSON.parse(value) as T
		} catch (error) {
			console.error(`[CacheService] Error getting key "${key}":`, error)
			return null
		}
	}

	/**
	 * Set a value in cache
	 */
	async set(key: string, value: unknown, options?: CacheOptions): Promise<boolean> {
		if (!this.isAvailable()) {
			return false
		}

		try {
			const serialized = JSON.stringify(value)

			if (options?.ttl) {
				await this.client!.setEx(key, options.ttl, serialized)
			} else {
				await this.client!.set(key, serialized)
			}

			return true
		} catch (error) {
			console.error(`[CacheService] Error setting key "${key}":`, error)
			return false
		}
	}

	/**
	 * Delete a value from cache
	 */
	async delete(key: string): Promise<boolean> {
		if (!this.isAvailable()) {
			return false
		}

		try {
			await this.client!.del(key)
			return true
		} catch (error) {
			console.error(`[CacheService] Error deleting key "${key}":`, error)
			return false
		}
	}

	/**
	 * Delete multiple keys matching a pattern
	 */
	async deletePattern(pattern: string): Promise<number> {
		if (!this.isAvailable()) {
			return 0
		}

		try {
			const keys = await this.client!.keys(pattern)
			if (keys.length === 0) {
				return 0
			}

			await this.client!.del(keys)
			return keys.length
		} catch (error) {
			console.error(`[CacheService] Error deleting pattern "${pattern}":`, error)
			return 0
		}
	}

	/**
	 * Check if a key exists in cache
	 */
	async exists(key: string): Promise<boolean> {
		if (!this.isAvailable()) {
			return false
		}

		try {
			const result = await this.client!.exists(key)
			return result === 1
		} catch (error) {
			console.error(`[CacheService] Error checking existence of key "${key}":`, error)
			return false
		}
	}

	/**
	 * Set expiration time for a key
	 */
	async expire(key: string, seconds: number): Promise<boolean> {
		if (!this.isAvailable()) {
			return false
		}

		try {
			await this.client!.expire(key, seconds)
			return true
		} catch (error) {
			console.error(`[CacheService] Error setting expiration for key "${key}":`, error)
			return false
		}
	}

	/**
	 * Get multiple values at once
	 */
	async mget<T = unknown>(keys: string[]): Promise<(T | null)[]> {
		if (!this.isAvailable() || keys.length === 0) {
			return keys.map(() => null)
		}

		try {
			const values = await this.client!.mGet(keys)
			return values.map(value => {
				if (!value) return null
				try {
					return JSON.parse(value) as T
				} catch {
					return null
				}
			})
		} catch (error) {
			console.error("[CacheService] Error getting multiple keys:", error)
			return keys.map(() => null)
		}
	}

	/**
	 * Set multiple values at once
	 */
	async mset(entries: Array<{ key: string; value: unknown; ttl?: number }>): Promise<boolean> {
		if (!this.isAvailable() || entries.length === 0) {
			return false
		}

		try {
			// Set values without TTL first
			const simpleEntries = entries.filter(e => !e.ttl)
			if (simpleEntries.length > 0) {
				const pairs: string[] = []
				for (const entry of simpleEntries) {
					pairs.push(entry.key, JSON.stringify(entry.value))
				}
				await this.client!.mSet(pairs)
			}

			// Set values with TTL individually
			const ttlEntries = entries.filter(e => e.ttl)
			for (const entry of ttlEntries) {
				await this.set(entry.key, entry.value, { ttl: entry.ttl })
			}

			return true
		} catch (error) {
			console.error("[CacheService] Error setting multiple keys:", error)
			return false
		}
	}

	/**
	 * Increment a numeric value
	 */
	async increment(key: string, amount = 1): Promise<number | null> {
		if (!this.isAvailable()) {
			return null
		}

		try {
			const result = await this.client!.incrBy(key, amount)
			return result
		} catch (error) {
			console.error(`[CacheService] Error incrementing key "${key}":`, error)
			return null
		}
	}

	/**
	 * Get cache statistics
	 */
	async getStats(): Promise<{ isAvailable: boolean; isConnected: boolean; connectionAttempts: number } | null> {
		return {
			isAvailable: this.isAvailable(),
			isConnected: this.isConnected,
			connectionAttempts: this.connectionAttempts,
		}
	}

	/**
	 * Disconnect from Redis
	 */
	async disconnect(): Promise<void> {
		if (this.client) {
			try {
				await this.client.quit()
			} catch (error) {
				console.error("[CacheService] Error disconnecting from Redis:", error)
			}
			this.client = null
			this.isConnected = false
		}
	}

	/**
	 * Flush all cache entries (use with caution!)
	 */
	async flushAll(): Promise<boolean> {
		if (!this.isAvailable()) {
			return false
		}

		try {
			await this.client!.flushAll()
			return true
		} catch (error) {
			console.error("[CacheService] Error flushing cache:", error)
			return false
		}
	}
}

// Create and export a singleton instance
let cacheInstance: CacheService | null = null

export function getCacheService(): CacheService {
	if (!cacheInstance) {
		// Try to get Redis URL from environment
		const redisUrl = process.env.REDIS_URL
		cacheInstance = new CacheService(redisUrl)
	}
	return cacheInstance
}
