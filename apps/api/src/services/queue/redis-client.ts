import Redis from "ioredis"

// Redis connection for BullMQ queues
// Reads REDIS_URL (primary) with UPSTASH_REDIS_URL as legacy fallback
const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL

if (!redisUrl) {
	console.warn("⚠️ REDIS_URL not set. Queue features will be disabled.")
}

const redisOptions = {
	maxRetriesPerRequest: null, // Required for BullMQ
	enableReadyCheck: false,
	tls: redisUrl?.includes("upstash.io") ? {} : undefined, // TLS only for Upstash
}

export const redis = redisUrl ? new Redis(redisUrl, redisOptions) : null

// Duplicate connection for BullMQ (subscriber)
export const redisSubscriber = redisUrl
	? new Redis(redisUrl, redisOptions)
	: null

export const isRedisEnabled = (): boolean => {
	return redis !== null
}

// Test connection
if (redis) {
	redis.on("connect", () => {
		console.log("✅ Redis connected successfully")
	})

	redis.on("error", (err) => {
		console.error("❌ Redis connection error:", err.message)
	})
}
