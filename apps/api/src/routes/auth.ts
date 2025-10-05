import { randomBytes } from "node:crypto"
import type { Context } from "hono"
import { z } from "zod"
import { ensureMembershipForUser, supabaseAdmin } from "../supabase"
import { parseCookies, serializeCookie } from "../utils/cookies"
import { hashPassword, verifyPassword } from "../utils/password"

const SESSION_COOKIE = "sm_session"
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

	const existing = await supabaseAdmin
		.from("users")
		.select("id")
		.eq("email", normalizedEmail)
		.maybeSingle()

	if (existing.error) {
		console.error("signUp: failed to query user", existing.error)
		return c.json({ error: { message: "Failed to create account" } }, 500)
	}

	if (existing.data) {
		return c.json({ error: { message: "Email already registered" } }, 409)
	}

	const hashedPassword = hashPassword(password)
	const { data: userInsert, error: userError } = await supabaseAdmin
		.from("users")
		.insert({
			email: normalizedEmail,
			name: name ?? normalizedEmail.split("@")[0],
			hashed_password: hashedPassword,
		})
		.select("id")
		.single()

	if (userError || !userInsert) {
		console.error("signUp: failed to insert user", userError)
		return c.json({ error: { message: "Failed to create account" } }, 500)
	}

	const organizationId = await ensureMembershipForUser(userInsert.id)

	const session = await createSession(userInsert.id, organizationId)
	if (!session) {
		return c.json({ error: { message: "Failed to create session" } }, 500)
	}

	setSessionCookie(c, session.token)
	return c.json({ ok: true })
}

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

	const { data: user, error } = await supabaseAdmin
		.from("users")
		.select("id, hashed_password, email, name")
		.eq("email", normalizedEmail)
		.maybeSingle()

	if (error) {
		console.error("signIn: failed to fetch user", error)
		return c.json({ error: { message: "Failed to sign in" } }, 500)
	}

	if (
		!user?.hashed_password ||
		!verifyPassword(password, user.hashed_password)
	) {
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
	const token = cookies[SESSION_COOKIE]

	if (token) {
		await supabaseAdmin.from("sessions").delete().eq("session_token", token)
	}

	c.header(
		"Set-Cookie",
		serializeCookie(SESSION_COOKIE, "", {
			maxAge: 0,
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
		}),
	)
	return c.json({ ok: true })
}

export async function getSession(c: Context) {
	const cookies = parseCookies(c.req.header("cookie"))
	const token = cookies[SESSION_COOKIE]

	if (!token) {
		return c.json({ session: null })
	}

	const now = new Date().toISOString()
	const { data, error } = await supabaseAdmin
		.from("sessions")
		.select(
			"session_token, expires_at, organization_id, user:users(id, email, name, created_at, updated_at), organization:organizations(id, slug, name)",
		)
		.eq("session_token", token)
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
	const cookie = serializeCookie(SESSION_COOKIE, token, {
		maxAge: SESSION_TTL_SECONDS,
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
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
