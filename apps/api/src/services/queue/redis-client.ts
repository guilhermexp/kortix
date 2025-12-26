import Redis from "ioredis";

// Upstash Redis connection
// Uses UPSTASH_REDIS_URL format: redis://default:PASSWORD@HOSTNAME:PORT
const redisUrl = process.env.UPSTASH_REDIS_URL;

if (!redisUrl) {
	console.warn(
		"⚠️ UPSTASH_REDIS_URL not set. Queue features will be disabled.",
	);
}

export const redis = redisUrl
	? new Redis(redisUrl, {
			maxRetriesPerRequest: null, // Required for BullMQ
			enableReadyCheck: false, // Faster connection for Upstash
			tls: redisUrl.includes("upstash.io") ? {} : undefined, // Enable TLS for Upstash
		})
	: null;

// Duplicate connection for BullMQ (subscriber)
export const redisSubscriber = redisUrl
	? new Redis(redisUrl, {
			maxRetriesPerRequest: null,
			enableReadyCheck: false,
			tls: redisUrl.includes("upstash.io") ? {} : undefined,
		})
	: null;

export const isRedisEnabled = (): boolean => {
	return redis !== null;
};

// Test connection
if (redis) {
	redis.on("connect", () => {
		console.log("✅ Redis connected successfully");
	});

	redis.on("error", (err) => {
		console.error("❌ Redis connection error:", err.message);
	});
}
