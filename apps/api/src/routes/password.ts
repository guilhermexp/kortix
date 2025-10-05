import { createHash, randomBytes } from "node:crypto"
import type { Context } from "hono"
import { z } from "zod"
import { env } from "../env"
import { sendEmail } from "../services/mailer"
import type { SessionContext } from "../session"
import { ensureMembershipForUser, supabaseAdmin } from "../supabase"
import { hashPassword, verifyPassword } from "../utils/password"

const PASSWORD_MIN_LENGTH = 6
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30 // 30 minutes

const RequestResetSchema = z.object({
	email: z.string().email(),
})

const CompleteResetSchema = z.object({
	token: z.string().min(32),
	password: z
		.string()
		.min(
			PASSWORD_MIN_LENGTH,
			`Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
		),
})

const UpdatePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z
		.string()
		.min(
			PASSWORD_MIN_LENGTH,
			`Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
		),
})

type UpdatePasswordContext = Context<
	{ Variables: { session: SessionContext } },
	string,
	{ json: z.infer<typeof UpdatePasswordSchema> }
>

type ResetRequest = z.infer<typeof RequestResetSchema>

type CompleteResetRequest = z.infer<typeof CompleteResetSchema>

function buildResetUrl(token: string) {
	const base = new URL(env.APP_URL)
	base.pathname = "/reset-password"
	base.searchParams.set("token", token)
	return base.toString()
}

function hashToken(token: string) {
	return createHash("sha256").update(token).digest("hex")
}

function extractClientIp(c: Context) {
	const forwarded =
		c.req.header("x-forwarded-for") ?? c.req.header("cf-connecting-ip")
	if (!forwarded) return null
	return forwarded.split(",")[0]?.trim() ?? null
}

export async function requestPasswordReset(c: Context) {
	let payload: ResetRequest
	try {
		payload = RequestResetSchema.parse(await c.req.json())
	} catch {
		return c.json({ error: { message: "Invalid request" } }, 400)
	}

	const email = payload.email.toLowerCase()
	const { data: user, error } = await supabaseAdmin
		.from("users")
		.select("id, email")
		.eq("email", email)
		.maybeSingle()

	if (error) {
		console.error("requestPasswordReset: user lookup failed", error)
		return c.json({ message: "If an account exists, an email will be sent" })
	}

	if (!user) {
		return c.json({ message: "If an account exists, an email will be sent" })
	}

	const organizationId = await ensureMembershipForUser(user.id)

	const token = randomBytes(32).toString("hex")
	const tokenHash = hashToken(token)
	const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString()
	const clientIp = extractClientIp(c)

	await supabaseAdmin.from("password_resets").delete().eq("user_id", user.id)

	const { error: insertError } = await supabaseAdmin
		.from("password_resets")
		.insert({
			org_id: organizationId,
			user_id: user.id,
			token_hash: tokenHash,
			requested_from: clientIp,
			expires_at: expiresAt,
		})

	if (insertError) {
		console.error("requestPasswordReset: failed to store token", insertError)
		return c.json({ error: { message: "Failed to start reset" } }, 500)
	}

	const resetUrl = buildResetUrl(token)
	await sendEmail({
		to: email,
		subject: "Redefinir senha do supermemory",
		text: `Use o link a seguir para redefinir sua senha. Ele expira em 30 minutos. ${resetUrl}`,
		html: `<p>Você solicitou a redefinição da sua senha no supermemory.</p><p><a href="${resetUrl}">Clique aqui para redefinir sua senha</a>. Este link expira em 30 minutos.</p><p>Se você não solicitou, ignore este email.</p>`,
	})

	return c.json({ message: "If an account exists, an email will be sent" })
}

export async function completePasswordReset(c: Context) {
	let payload: CompleteResetRequest
	try {
		payload = CompleteResetSchema.parse(await c.req.json())
	} catch (error) {
		console.error("completePasswordReset: invalid payload", error)
		return c.json({ error: { message: "Invalid request" } }, 400)
	}

	const hashedToken = hashToken(payload.token)
	const now = new Date().toISOString()

	const { data: resetToken, error } = await supabaseAdmin
		.from("password_resets")
		.select("id, user_id")
		.eq("token_hash", hashedToken)
		.is("used_at", null)
		.gt("expires_at", now)
		.maybeSingle()

	if (error) {
		console.error("completePasswordReset: lookup failed", error)
		return c.json({ error: { message: "Invalid or expired token" } }, 400)
	}

	if (!resetToken) {
		return c.json({ error: { message: "Invalid or expired token" } }, 400)
	}

	const { data: user, error: userError } = await supabaseAdmin
		.from("users")
		.select("id")
		.eq("id", resetToken.user_id)
		.maybeSingle()

	if (userError || !user) {
		console.error("completePasswordReset: user not found", userError)
		return c.json({ error: { message: "User not found" } }, 400)
	}

	const hashedPassword = hashPassword(payload.password)
	const { error: updateError } = await supabaseAdmin
		.from("users")
		.update({ hashed_password: hashedPassword, updated_at: now })
		.eq("id", user.id)

	if (updateError) {
		console.error(
			"completePasswordReset: failed to update password",
			updateError,
		)
		return c.json({ error: { message: "Failed to reset password" } }, 500)
	}

	const { error: markUsedError } = await supabaseAdmin
		.from("password_resets")
		.update({ used_at: now })
		.eq("id", resetToken.id)

	if (markUsedError) {
		console.error(
			"completePasswordReset: failed to mark token used",
			markUsedError,
		)
	}

	await supabaseAdmin.from("sessions").delete().eq("user_id", user.id)

	return c.json({ message: "Password updated" })
}

export async function updatePassword(c: UpdatePasswordContext) {
	const payload = c.req.valid("json")
	const { userId } = c.var.session

	const { data: user, error } = await supabaseAdmin
		.from("users")
		.select("id, hashed_password")
		.eq("id", userId)
		.maybeSingle()

	if (error || !user?.hashed_password) {
		console.error("updatePassword: failed to fetch user", error)
		return c.json({ error: { message: "Failed to update password" } }, 500)
	}

	if (!verifyPassword(payload.currentPassword, user.hashed_password)) {
		return c.json({ error: { message: "Invalid current password" } }, 401)
	}

	const newHashedPassword = hashPassword(payload.newPassword)
	const now = new Date().toISOString()

	const { error: updateError } = await supabaseAdmin
		.from("users")
		.update({ hashed_password: newHashedPassword, updated_at: now })
		.eq("id", userId)

	if (updateError) {
		console.error("updatePassword: failed to persist", updateError)
		return c.json({ error: { message: "Failed to update password" } }, 500)
	}

	await supabaseAdmin.from("password_resets").delete().eq("user_id", userId)

	return c.json({ message: "Password updated" })
}

export const updatePasswordValidator = UpdatePasswordSchema
export const requestResetValidator = RequestResetSchema
export const completeResetValidator = CompleteResetSchema
