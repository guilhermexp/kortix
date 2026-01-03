/**
 * URL Security Validator
 * Prevents Server-Side Request Forgery (SSRF) attacks by validating URLs
 * before making HTTP requests.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])

// Private IP ranges and special addresses that should never be accessed
const BLOCKED_PATTERNS = [
	// Loopback addresses
	/^localhost$/i,
	/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
	/^::1$/,
	/^0\.0\.0\.0$/,

	// Private IP ranges (RFC 1918)
	/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8
	/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
	/^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16

	// Link-local addresses
	/^169\.254\.\d{1,3}\.\d{1,3}$/, // 169.254.0.0/16

	// AWS metadata service
	/^169\.254\.169\.254$/,

	// Docker/Kubernetes internal networks
	/^172\.17\.\d{1,3}\.\d{1,3}$/, // Docker default bridge
	/^10\.96\.\d{1,3}\.\d{1,3}$/, // Kubernetes ClusterIP default

	// IPv6 private ranges
	/^fd[0-9a-f]{2}:/i, // Unique Local Addresses
	/^fe80:/i, // Link-local
]

// Optional: Allow specific domains (e.g., for testing)
const ALLOWED_DOMAINS: string[] = process.env.ALLOWED_FETCH_DOMAINS
	? process.env.ALLOWED_FETCH_DOMAINS.split(",").map((d) => d.trim())
	: []

export class URLValidationError extends Error {
	constructor(
		message: string,
		public readonly url: string,
		public readonly reason: string,
	) {
		super(message)
		this.name = "URLValidationError"
	}
}

/**
 * Validates if a URL is safe to fetch
 * Throws URLValidationError if validation fails
 */
export function validateUrlSafety(urlString: string): URL {
	let parsed: URL
	try {
		parsed = new URL(urlString)
	} catch (_error) {
		throw new URLValidationError(
			`Invalid URL format: ${urlString}`,
			urlString,
			"invalid_format",
		)
	}

	// Check protocol
	if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
		throw new URLValidationError(
			`Protocol not allowed: ${parsed.protocol}`,
			urlString,
			"invalid_protocol",
		)
	}

	// Check for blocked hostnames
	const hostname = parsed.hostname.toLowerCase()

	for (const pattern of BLOCKED_PATTERNS) {
		if (pattern.test(hostname)) {
			throw new URLValidationError(
				`Hostname blocked for security reasons: ${hostname}`,
				urlString,
				"blocked_hostname",
			)
		}
	}

	// If allowlist is configured, enforce it
	if (ALLOWED_DOMAINS.length > 0) {
		const isAllowed = ALLOWED_DOMAINS.some((domain) => {
			return hostname === domain || hostname.endsWith(`.${domain}`)
		})

		if (!isAllowed) {
			throw new URLValidationError(
				`Domain not in allowlist: ${hostname}`,
				urlString,
				"domain_not_allowed",
			)
		}
	}

	// Additional checks for edge cases
	// Prevent URL redirects to file:// or other protocols
	if (parsed.pathname.includes("://")) {
		throw new URLValidationError(
			"Nested protocol detected in URL path",
			urlString,
			"nested_protocol",
		)
	}

	return parsed
}

/**
 * Safe wrapper around fetch that validates URLs first
 */
export async function safeFetch(
	url: string,
	options?: RequestInit,
): Promise<Response> {
	const validatedUrl = validateUrlSafety(url)

	// Add security headers
	const secureOptions: RequestInit = {
		...options,
		headers: {
			...options?.headers,
			"User-Agent": "KortixSelfHosted/1.0 (+self-hosted extractor)",
		},
		// Prevent following redirects to potentially malicious URLs
		redirect: "manual",
	}

	const response = await fetch(validatedUrl.toString(), secureOptions)

	// If there's a redirect, validate the redirect URL too
	if (response.status >= 300 && response.status < 400) {
		const location = response.headers.get("location")
		if (location) {
			validateUrlSafety(location) // Throws if redirect is unsafe
		}
	}

	return response
}

/**
 * Check if URL validation is strict mode (allowlist enabled)
 */
export function isStrictMode(): boolean {
	return ALLOWED_DOMAINS.length > 0
}
