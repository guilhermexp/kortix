import { randomBytes } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import type { Context } from "hono"
import { z } from "zod"
import { env } from "../env"
import { ensureMembershipForUser, supabaseAdmin } from "../supabase"
import { parseCookies, serializeCookie } from "../utils/cookies"
import { hashPassword, verifyPassword } from "../utils/password"

const SESSION_COOKIE = "kortix_session"
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

const SignUpSchema = z.object({
	email: z.string().email(),
	password: z.string().min(6, "Password must be at least 6 characters"),
	name: z.string().trim().min(1).max(120).optional(),
})

const SignInSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
})

/**
 * Sign up using Supabase Auth
 */
export async function signUp(c: Context) {
	let body: unknown
	try {
		body = await c.req.json()
	} catch {
		return c.json({ error: { message: "Invalid request" } }, 400)
	}

	const parseResult = SignUpSchema.safeParse(body)
	if (!parseResult.success) {
		return c.json({ error: { message: "Invalid credentials" } }, 400)
	}

	const { email, password, name } = parseResult.data
	const normalizedEmail = email.toLowerCase()

	// Create auth client for this request
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
		auth: { persistSession: false },
	})

	// Sign up with Supabase Auth
	const { data: authData, error: authError } = await supabase.auth.signUp({
		email: normalizedEmail,
		password,
		options: {
			data: {
				name: name ?? normalizedEmail.split("@")[0],
			},
		},
	})

	if (authError) {
		console.error("signUp: Supabase Auth error", authError)
		if (authError.message.includes("already registered")) {
			return c.json({ error: { message: "Email already registered" } }, 409)
		}
		return c.json({ error: { message: authError.message } }, 400)
	}

	if (!authData.user || !authData.session) {
		return c.json({ error: { message: "Failed to create account" } }, 500)
	}

	// The trigger handle_new_auth_user will create the public.users record
	// Wait a moment for the trigger to complete
	await new Promise((resolve) => setTimeout(resolve, 100))

	// Set session cookie for Next.js middleware compatibility
	setSessionCookie(c, authData.session.access_token)

	// Return session info
	return c.json({
		ok: true,
		session: {
			access_token: authData.session.access_token,
			refresh_token: authData.session.refresh_token,
			expires_at: authData.session.expires_at,
		},
		user: {
			id: authData.user.id,
			email: authData.user.email,
		},
	})
}

/**
 * Sign in using Supabase Auth
 */
export async function signIn(c: Context) {
	let body: unknown
	try {
		body = await c.req.json()
	} catch {
		return c.json({ error: { message: "Invalid request" } }, 400)
	}

	const parseResult = SignInSchema.safeParse(body)
	if (!parseResult.success) {
		return c.json({ error: { message: "Invalid credentials" } }, 400)
	}

	const { email, password } = parseResult.data
	const normalizedEmail = email.toLowerCase()

	// Create auth client for this request
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
		auth: { persistSession: false },
	})

	// First check if user exists in public.users (migrated user)
	const { data: existingUser } = await supabaseAdmin
		.from("users")
		.select("id, auth_id, password_hash")
		.eq("email", normalizedEmail)
		.maybeSingle()

	// If user exists but doesn't have auth_id, migrate them to Supabase Auth
	if (existingUser && !existingUser.auth_id) {
		// Verify legacy password first
		if (!existingUser.password_hash || !verifyPassword(password, existingUser.password_hash)) {
			return c.json({ error: { message: "Invalid email or password" } }, 401)
		}

		// Create Supabase Auth user
		const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
			email: normalizedEmail,
			password,
			email_confirm: true,
			user_metadata: {
				name: normalizedEmail.split("@")[0],
			},
		})

		if (createError) {
			console.error("signIn: failed to migrate user to Supabase Auth", createError)
			// Fall back to legacy auth
			return legacySignIn(c, existingUser, password)
		}

		// Link auth user to existing user
		await supabaseAdmin
			.from("users")
			.update({ auth_id: newAuthUser.user.id })
			.eq("id", existingUser.id)

		// Now sign in with Supabase Auth
		const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
			email: normalizedEmail,
			password,
		})

		if (signInError || !authData.session) {
			console.error("signIn: failed to sign in after migration", signInError)
			return c.json({ error: { message: "Failed to sign in" } }, 500)
		}

		// Set session cookie for Next.js middleware compatibility
		setSessionCookie(c, authData.session.access_token)

		return c.json({
			ok: true,
			session: {
				access_token: authData.session.access_token,
				refresh_token: authData.session.refresh_token,
				expires_at: authData.session.expires_at,
			},
			user: {
				id: authData.user.id,
				email: authData.user.email,
			},
		})
	}

	// Standard Supabase Auth sign in
	const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
		email: normalizedEmail,
		password,
	})

	if (authError) {
		console.error("signIn: Supabase Auth error", authError)
		return c.json({ error: { message: "Invalid email or password" } }, 401)
	}

	if (!authData.session) {
		return c.json({ error: { message: "Failed to sign in" } }, 500)
	}

	// Set session cookie for Next.js middleware compatibility
	setSessionCookie(c, authData.session.access_token)

	return c.json({
		ok: true,
		session: {
			access_token: authData.session.access_token,
			refresh_token: authData.session.refresh_token,
			expires_at: authData.session.expires_at,
		},
		user: {
			id: authData.user.id,
			email: authData.user.email,
		},
	})
}

/**
 * @deprecated Legacy sign in for users not yet migrated
 */
async function legacySignIn(c: Context, user: { id: string; password_hash: string | null }, password: string) {
	if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
		return c.json({ error: { message: "Invalid email or password" } }, 401)
	}

	const organizationId = await ensureMembershipForUser(user.id)
	const session = await createSession(user.id, organizationId)

	if (!session) {
		return c.json({ error: { message: "Failed to create session" } }, 500)
	}

	setSessionCookie(c, session.token)
	return c.json({ ok: true })
}

export async function signOut(c: Context) {
	const cookies = parseCookies(c.req.header("cookie"))

	// Clear legacy session if present
	const legacyToken = cookies[SESSION_COOKIE]
	if (legacyToken) {
		await supabaseAdmin.from("sessions").delete().eq("session_token", legacyToken)
	}

	const isProduction = process.env.NODE_ENV === "production"

	// Clear legacy session cookie
	c.header(
		"Set-Cookie",
		serializeCookie(SESSION_COOKIE, "", {
			maxAge: 0,
			httpOnly: true,
			secure: isProduction,
			sameSite: "lax",
		}),
	)

	return c.json({ ok: true })
}

export async function getSession(c: Context) {
	const cookies = parseCookies(c.req.header("cookie"))
	const authHeader = c.req.header("authorization")

	// Try Supabase Auth first
	let accessToken: string | null = null

	if (authHeader?.startsWith("Bearer ")) {
		accessToken = authHeader.slice(7)
	} else {
		// First check kortix_session cookie for JWT token
		const kortixSession = cookies[SESSION_COOKIE]
		if (kortixSession && kortixSession.startsWith("eyJ")) {
			// Looks like a JWT token (starts with base64 encoded JSON header)
			accessToken = kortixSession
		} else {
			// Look for Supabase auth cookies
			for (const [key, value] of Object.entries(cookies)) {
				if (key.startsWith("sb-") && key.includes("-auth-token")) {
					try {
						const parsed = JSON.parse(value)
						accessToken = parsed.access_token || parsed[0]?.access_token
						if (accessToken) break
					} catch {
						accessToken = value
						break
					}
				}
			}
		}
	}

	if (accessToken) {
		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
			auth: { persistSession: false },
			global: { headers: { Authorization: `Bearer ${accessToken}` } },
		})

		const { data: { user }, error } = await supabase.auth.getUser()

		if (!error && user) {
			// Get internal user data
			const { data: internalUser } = await supabaseAdmin
				.from("users")
				.select("id, email, name, created_at, updated_at")
				.eq("auth_id", user.id)
				.maybeSingle()

			if (internalUser) {
				// Get organization
				const { data: membership } = await supabaseAdmin
					.from("organization_members")
					.select("organization:organizations(id, slug, name)")
					.eq("user_id", internalUser.id)
					.maybeSingle()

				return c.json({
					session: {
						access_token: accessToken,
						expires_at: null, // JWT expiration is in the token
					},
					user: {
						id: internalUser.id,
						authId: user.id,
						email: internalUser.email,
						name: internalUser.name,
						createdAt: internalUser.created_at,
						updatedAt: internalUser.updated_at,
					},
					organization: membership?.organization ?? null,
				})
			}
		}
	}

	// Fallback to legacy session
	const legacyToken = cookies[SESSION_COOKIE]
	if (!legacyToken) {
		return c.json({ session: null })
	}

	const now = new Date().toISOString()
	const { data, error } = await supabaseAdmin
		.from("sessions")
		.select(
			"session_token, expires_at, organization_id, user:users(id, email, name, created_at, updated_at), organization:organizations(id, slug, name)",
		)
		.eq("session_token", legacyToken)
		.gt("expires_at", now)
		.maybeSingle()

	if (error) {
		console.error("getSession: failed to fetch session", error)
		return c.json({ session: null })
	}

	if (!data?.user) {
		return c.json({ session: null })
	}

	return c.json({
		session: {
			token: data.session_token,
			expiresAt: data.expires_at,
			organizationId: data.organization_id,
		},
		user: {
			id: data.user.id,
			email: data.user.email,
			name: data.user.name,
			createdAt: data.user.created_at,
			updatedAt: data.user.updated_at,
		},
		organization: data.organization,
	})
}

function setSessionCookie(c: Context, token: string) {
	const isProduction = process.env.NODE_ENV === "production"
	const cookie = serializeCookie(SESSION_COOKIE, token, {
		maxAge: SESSION_TTL_SECONDS,
		httpOnly: true,
		secure: isProduction,
		// Use "lax" for same-domain cookies (via Next.js proxy)
		sameSite: "lax",
	})
	c.header("Set-Cookie", cookie)
}
async function createSession(userId: string, organizationId: string) {
	const token = randomBytes(32).toString("hex")
	const expiresAt = new Date(
		Date.now() + SESSION_TTL_SECONDS * 1000,
	).toISOString()

	const { error } = await supabaseAdmin.from("sessions").insert({
		user_id: userId,
		organization_id: organizationId,
		session_token: token,
		expires_at: expiresAt,
	})

	if (error) {
		console.error("createSession: failed", error)
		return null
	}

	return { token, expiresAt }
}
