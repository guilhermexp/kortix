import { ensureMembershipForUser, supabaseAdmin } from "./supabase"
import { parseCookies } from "./utils/cookies"

export type SessionContext = {
	organizationId: string
	userId: string
}

const SESSION_COOKIE = "sm_session"

export async function resolveSession(
	request: Request,
): Promise<SessionContext | null> {
	try {
		const token = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE]
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
		return { organizationId, userId: data.user_id }
	} catch (error) {
		console.warn("resolveSession failed", error)
		return null
	}
}
