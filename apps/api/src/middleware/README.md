# API Middleware

This directory contains middleware components for the Supermemory API.

## Rate Limiter

### Overview

The rate limiter middleware protects the API against abuse and DoS attacks using a sliding window algorithm. It tracks requests per client identifier (API key or IP address) and enforces configurable limits per endpoint category.

### Features

- ✅ **Sliding Window Algorithm** - Accurate rate limiting without sudden bursts
- ✅ **Multiple Rate Limit Tiers** - Different limits for different endpoint types
- ✅ **Client Identification** - Tracks by API key (preferred) or IP address
- ✅ **Automatic Cleanup** - Periodically removes expired entries to prevent memory leaks
- ✅ **Standard Headers** - Returns `X-RateLimit-*` headers for client awareness
- ✅ **Path Exemptions** - Health checks and monitoring endpoints skip rate limiting

### Configuration

Rate limits are defined in `/Users/guilhermevarela/Public/supermemory/apps/api/src/config/constants.ts`:

```typescript
export const RATE_LIMITS = {
  WINDOW_MS: 60_000, // 1 minute window

  LIMITS: {
    DEFAULT: 60,      // General endpoints
    AUTH: 10,         // Authentication (stricter)
    INGESTION: 30,    // Document ingestion
    SEARCH: 100,      // Search queries (higher)
    CHAT: 20,         // Chat endpoints (expensive)
    UPLOAD: 15,       // File uploads
  },

  SKIP_PATHS: [
    "/health",
    "/api/health",
    "/ping",
  ],
}
```

### Usage

#### Global Application

Applied automatically in `src/index.ts`:

```typescript
import { rateLimiter } from "./middleware/rate-limiter"

app.use("*", rateLimiter())
```

#### Custom Limits for Specific Routes

```typescript
// Stricter limit for sensitive endpoint
app.post("/admin/action", rateLimiter({ limit: 5 }), handler)

// Longer window for batch operations
app.post("/bulk-import", rateLimiter({
  limit: 10,
  windowMs: 5 * 60 * 1000, // 5 minutes
}), handler)
```

### Response Headers

The middleware adds standard rate limit headers to all responses:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 2025-01-09T15:30:00.000Z
```

When rate limit is exceeded (HTTP 429):

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2025-01-09T15:30:00.000Z

{
  "message": "Rate limit exceeded. Try again in 45 seconds."
}
```

### Client Identification Priority

1. **API Key** (most specific) - From `X-API-Key` or `Authorization` header
2. **IP Address** - From `X-Forwarded-For` or `X-Real-IP` header
3. **Fallback** - "unknown" if neither is available

### Automatic Endpoint Categorization

The middleware automatically applies appropriate limits based on path patterns:

| Path Pattern | Category | Limit (per minute) |
|--------------|----------|-------------------|
| `/api/auth/*`, `/login`, `/register` | AUTH | 10 |
| `/v3/documents/file` | UPLOAD | 15 |
| `/v3/documents/*`, `/v3/projects/*` | INGESTION | 30 |
| `/v3/search/*`, `/v4/search/*` | SEARCH | 100 |
| `/chat*` | CHAT | 20 |
| All others | DEFAULT | 60 |

### Memory Management

- **Automatic Cleanup**: Runs every 5 minutes
- **Cleanup Strategy**: Removes entries older than 2x the window duration
- **Memory Footprint**: Typically <1MB for moderate traffic
- **Graceful Shutdown**: Call `stopCleanupTimer()` before process exit

### Monitoring

Get current statistics:

```typescript
import { getRateLimiterStats } from "./middleware/rate-limiter"

const stats = getRateLimiterStats()
// {
//   totalKeys: 142,
//   windowMs: 60000,
//   limits: { DEFAULT: 60, AUTH: 10, ... }
// }
```

### Testing

Clear rate limit store for tests:

```typescript
import { clearRateLimitStore } from "./middleware/rate-limiter"

beforeEach(() => {
  clearRateLimitStore()
})
```

### Production Considerations

#### Current Implementation (In-Memory)

✅ **Pros:**
- Zero external dependencies
- Low latency
- Simple configuration
- No network calls

❌ **Cons:**
- Not shared across multiple instances
- Lost on restart
- Limited to single-server deployments

#### Future: Redis-Based Implementation

For multi-instance deployments, consider migrating to Redis:

```typescript
// Example Redis-based rate limiter
import { Redis } from "ioredis"

const redis = new Redis(process.env.REDIS_URL)

export function rateLimiterRedis(options) {
  return async (c, next) => {
    const key = `ratelimit:${getClientIdentifier(c)}`
    const count = await redis.incr(key)

    if (count === 1) {
      await redis.expire(key, Math.ceil(windowMs / 1000))
    }

    if (count > limit) {
      throw new HTTPException(429, { message: "Rate limit exceeded" })
    }

    return next()
  }
}
```

### Security Best Practices

1. **Use API Keys** - More reliable than IP addresses (proxies, NAT)
2. **Monitor 429 Responses** - High rates may indicate abuse
3. **Adjust Limits** - Based on actual usage patterns
4. **Combine with Auth** - Rate limiting is not a substitute for authentication
5. **Log Violations** - Track repeated offenders for analysis

### Troubleshooting

#### Rate limit too strict

Increase limits in `constants.ts` or add specific route exemptions:

```typescript
app.post("/public/webhook", rateLimiter({ limit: 1000 }), handler)
```

#### Health checks being rate limited

Ensure health check paths are in `RATE_LIMITS.SKIP_PATHS`

#### Memory usage growing

Check cleanup timer is running. Manually trigger cleanup:

```typescript
import { clearRateLimitStore } from "./middleware/rate-limiter"
clearRateLimitStore() // Clears all entries
```

### Examples

#### Example 1: Custom Rate Limit for Admin Endpoints

```typescript
const adminLimiter = rateLimiter({ limit: 5, windowMs: 60_000 })

app.post("/admin/delete-all", adminLimiter, requireAdmin, handler)
```

#### Example 2: Progressive Rate Limiting

```typescript
// Different limits based on authentication
app.post("/search", async (c, next) => {
  const hasApiKey = c.req.header("x-api-key")
  const limiter = hasApiKey
    ? rateLimiter({ limit: 1000 }) // Higher for authenticated
    : rateLimiter({ limit: 10 })   // Lower for anonymous

  return limiter(c, next)
})
```

#### Example 3: Rate Limit Monitoring Endpoint

```typescript
import { getRateLimiterStats } from "./middleware/rate-limiter"

app.get("/admin/rate-limit-stats", requireAdmin, (c) => {
  return c.json(getRateLimiterStats())
})
```

## Future Middleware

Additional middleware planned:
- Request logging with structured format
- Request size validation
- Content-type validation
- API versioning
