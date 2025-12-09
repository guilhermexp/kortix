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
		// Look for Supabase auth token in Authorization header or cookies
		const authHeader = request.headers.get("authorization")
		let accessToken: string | null = null

		if (authHeader?.startsWith("Bearer ")) {
			accessToken = authHeader.slice(7)
		} else {
			// First, check kortix_session cookie (may contain JWT token)
			const kortixSession = cookies[SESSION_COOKIE]
			if (kortixSession && kortixSession.startsWith("eyJ")) {
				// Looks like a JWT token (starts with base64 encoded JSON header)
				accessToken = kortixSession
			} else {
				// Try to find Supabase auth cookies
				// Supabase stores tokens in cookies like sb-<project-ref>-auth-token
				for (const [key, value] of Object.entries(cookies)) {
					if (key.startsWith(SUPABASE_AUTH_COOKIE_PREFIX) && key.includes("-auth-token")) {
						try {
							const parsed = JSON.parse(value)
							accessToken = parsed.access_token || parsed[0]?.access_token
							if (accessToken) break
						} catch {
							// Not JSON, try as raw token
							accessToken = value
							break
						}
					}
				}
			}
		}

		if (!accessToken) {
			return null
		}

		// Verify the token with Supabase
		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
			auth: { persistSession: false },
			global: {
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		})

		const { data: { user }, error } = await supabase.auth.getUser()

		if (error || !user) {
			console.log("[resolveSupabaseAuthSession] getUser failed:", error?.message || "no user")
			return null
		}

		console.log("[resolveSupabaseAuthSession] User found:", user.id, user.email)

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
				return {
					organizationId,
					userId: user.id,
					accessToken,
					internalUserId: userByEmail.id,
				}
			}
			return null
		}

		const organizationId = await ensureMembershipForUser(internalUser.id)

		return {
			organizationId,
			userId: user.id,
			accessToken,
			internalUserId: internalUser.id,
		}
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
