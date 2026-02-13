import { createClient } from "@supabase/supabase-js"
import { env } from "./env"
import { ensureMembershipForUser, supabaseAdmin } from "./supabase"
import { parseCookies } from "./utils/cookies"

export type SessionContext = {
	organizationId: string
	userId: string
	/** Supabase Auth access token (JWT) - present when using Supabase Auth */
	accessToken?: string
	/** Internal user ID from public.users table */
	internalUserId: string
}

const SESSION_COOKIE = "kortix_session"
const SUPABASE_AUTH_COOKIE_PREFIX = "sb-"

/**
 * Extract access token from request headers and cookies
 * Shared utility to avoid duplication between auth.ts and session.ts
 */
export function extractAccessToken(
	request: Request,
	cookies: Record<string, string>,
): string | null {
	const authHeader = request.headers.get("authorization")
	if (authHeader?.startsWith("Bearer ")) {
		return authHeader.slice(7)
	}

	// Check kortix_session cookie for JWT token
	const kortixSession = cookies[SESSION_COOKIE]
	if (kortixSession?.startsWith("eyJ")) {
		// Looks like a JWT token (starts with base64 encoded JSON header)
		return kortixSession
	}

	// Try to find Supabase auth cookies
	// Supabase stores tokens in cookies like sb-<project-ref>-auth-token
	for (const [key, value] of Object.entries(cookies)) {
		if (
			key.startsWith(SUPABASE_AUTH_COOKIE_PREFIX) &&
			key.includes("-auth-token")
		) {
			try {
				// Handle base64- prefixed cookies
				let cookieValue = value
				if (value.startsWith("base64-")) {
					cookieValue = Buffer.from(value.slice(7), "base64").toString("utf-8")
				}

				const parsed = JSON.parse(cookieValue)
				return parsed.access_token || parsed[0]?.access_token || null
			} catch {
				// Not JSON, try as raw token (strip base64- prefix if present)
				if (value.startsWith("base64-")) {
					const decoded = Buffer.from(value.slice(7), "base64").toString("utf-8")
					return decoded
				}
				return value
			}
		}
	}

	return null
}

type CachedAuthSession = {
	session: SessionContext
	expiresAtMs: number
}

// In-memory cache to avoid calling Supabase Auth on every request during polling-heavy UIs.
// Keyed by access token; short TTL only (security-sensitive).
const authSessionCache = new Map<string, CachedAuthSession>()
const AUTH_CACHE_MAX_SIZE = 2000
const AUTH_CACHE_MAX_TTL_MS = 60_000

function base64UrlDecode(input: string): string {
	const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
	const pad =
		normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
	return Buffer.from(normalized + pad, "base64").toString("utf8")
}

function getJwtExpMs(token: string): number | null {
	try {
		const parts = token.split(".")
		if (parts.length < 2) return null
		const payloadJson = base64UrlDecode(parts[1] ?? "")
		const payload = JSON.parse(payloadJson) as { exp?: number }
		if (typeof payload.exp !== "number") return null
		return payload.exp * 1000
	} catch {
		return null
	}
}

function getCachedSession(accessToken: string): SessionContext | null {
	const cached = authSessionCache.get(accessToken)
	if (!cached) return null
	if (Date.now() >= cached.expiresAtMs) {
		authSessionCache.delete(accessToken)
		return null
	}
	return cached.session
}

function setCachedSession(accessToken: string, session: SessionContext): void {
	// Basic LRU: refresh insertion order
	if (authSessionCache.has(accessToken)) {
		authSessionCache.delete(accessToken)
	}
	const now = Date.now()
	const jwtExp = getJwtExpMs(accessToken)
	const ttlMs = Math.min(
		AUTH_CACHE_MAX_TTL_MS,
		typeof jwtExp === "number"
			? Math.max(0, jwtExp - now)
			: AUTH_CACHE_MAX_TTL_MS,
	)
	authSessionCache.set(accessToken, { session, expiresAtMs: now + ttlMs })

	// Evict oldest if needed
	if (authSessionCache.size > AUTH_CACHE_MAX_SIZE) {
		const oldestKey = authSessionCache.keys().next().value as string | undefined
		if (oldestKey) authSessionCache.delete(oldestKey)
	}
}

/**
 * Resolve session from request - supports both:
 * 1. Supabase Auth (JWT in cookies) - NEW
 * 2. Legacy custom session (kortix_session cookie) - DEPRECATED
 */
export async function resolveSession(
	request: Request,
): Promise<SessionContext | null> {
	const cookies = parseCookies(request.headers.get("cookie"))

	// Try Supabase Auth first (new method)
	const supabaseSession = await resolveSupabaseAuthSession(request, cookies)
	if (supabaseSession) {
		return supabaseSession
	}

	// Fallback to legacy custom session
	return resolveLegacySession(cookies)
}

/**
 * Resolve session from Supabase Auth cookies
 */
async function resolveSupabaseAuthSession(
	request: Request,
	cookies: Record<string, string>,
): Promise<SessionContext | null> {
	try {
		const debugAuth = process.env.DEBUG_AUTH === "1"

		// Extract access token using shared utility
		const accessToken = extractAccessToken(request, cookies)

		if (!accessToken) {
			return null
		}

		// Fast path: reuse recently-validated auth/session mapping.
		const cached = getCachedSession(accessToken)
		if (cached) {
			return cached
		}

		// Verify the token with Supabase
		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
			auth: { persistSession: false },
			global: {
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		})

		const {
			data: { user },
			error,
		} = await supabase.auth.getUser()

		if (error || !user) {
			if (debugAuth)
				console.debug(
					"[resolveSupabaseAuthSession] getUser failed:",
					error?.message || "no user",
				)
			return null
		}

		if (debugAuth)
			console.debug("[resolveSupabaseAuthSession] User authenticated:", user.id)

		// Get internal user and organization
		const { data: internalUser, error: userError } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("auth_id", user.id)
			.maybeSingle()

		if (userError || !internalUser) {
			// User exists in auth but not in public.users - trigger might not have run
			// Try to find by email as fallback
			const { data: userByEmail } = await supabaseAdmin
				.from("users")
				.select("id")
				.eq("email", user.email)
				.maybeSingle()

			if (userByEmail) {
				// Link the auth user to existing user
				await supabaseAdmin
					.from("users")
					.update({ auth_id: user.id })
					.eq("id", userByEmail.id)

				const organizationId = await ensureMembershipForUser(userByEmail.id)
				const session = {
					organizationId,
					userId: user.id,
					accessToken,
					internalUserId: userByEmail.id,
				}
				setCachedSession(accessToken, session)
				return session
			}
			return null
		}

		const organizationId = await ensureMembershipForUser(internalUser.id)

		const session = {
			organizationId,
			userId: user.id,
			accessToken,
			internalUserId: internalUser.id,
		}
		setCachedSession(accessToken, session)
		return session
	} catch (error) {
		console.warn("resolveSupabaseAuthSession failed", error)
		return null
	}
}

/**
 * @deprecated Legacy session resolution using custom kortix_session cookie
 */
async function resolveLegacySession(
	cookies: Record<string, string>,
): Promise<SessionContext | null> {
	try {
		const token = cookies[SESSION_COOKIE]
		if (!token) return null

		const { data, error } = await supabaseAdmin
			.from("sessions")
			.select("user_id, organization_id, expires_at")
			.eq("session_token", token)
			.maybeSingle()

		if (error || !data) {
			return null
		}

		if (data.expires_at && new Date(data.expires_at) < new Date()) {
			await supabaseAdmin.from("sessions").delete().eq("session_token", token)
			return null
		}

		const organizationId =
			data.organization_id ?? (await ensureMembershipForUser(data.user_id))

		return {
			organizationId,
			userId: data.user_id,
			internalUserId: data.user_id,
		}
	} catch (error) {
		console.warn("resolveLegacySession failed", error)
		return null
	}
}
