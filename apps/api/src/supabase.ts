import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env } from "./env"

const adminClient = createClient(
	env.SUPABASE_URL,
	env.SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: { persistSession: false },
	},
)

export const supabaseAdmin = adminClient

/**
 * Create a Supabase client authenticated with a user's JWT access token.
 * This enables RLS policies that use auth.uid().
 */
export function createAuthenticatedSupabase(accessToken: string): SupabaseClient {
	return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
		auth: { persistSession: false },
		global: {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	})
}

/**
 * Create the best available Supabase client for a session.
 * - If session has accessToken (Supabase Auth), creates authenticated client with RLS
 * - Otherwise, falls back to admin client (for legacy sessions or backend operations)
 */
export function createClientForSession(session: {
	accessToken?: string
	organizationId: string
	userId?: string
}): SupabaseClient {
	if (session.accessToken) {
		return createAuthenticatedSupabase(session.accessToken)
	}
	// For legacy sessions or when no JWT is available, use admin client
	// The backend has already verified the session, so this is safe
	return supabaseAdmin
}

/**
 * @deprecated Use createClientForSession or createAuthenticatedSupabase instead.
 * This function relies on custom headers that don't propagate in Supabase Cloud.
 */
export function createScopedSupabase(
	organizationId: string,
	userId?: string,
): SupabaseClient {
	// DEPRECATED: Custom headers don't propagate to PostgreSQL context in Supabase Cloud
	// For now, return admin client to ensure operations work
	// TODO: Remove this function after full migration to Supabase Auth
	return supabaseAdmin
}

async function getDefaultOrganizationId(client: SupabaseClient) {
	const { data, error } = await client
		.from("organizations")
		.select("id")
		.eq("slug", "default")
		.maybeSingle()

	if (error) throw error
	return data?.id ?? null
}

export async function ensureDefaultOrganization() {
	const existing = await getDefaultOrganizationId(supabaseAdmin)
	if (existing) return existing

	const { data, error } = await supabaseAdmin
		.from("organizations")
		.insert({
			slug: "default",
			name: "Default Organization",
			metadata: {},
		})
		.select("id")
		.single()

	if (error) {
		if ((error as { code?: string }).code === "23505") {
			const retry = await getDefaultOrganizationId(supabaseAdmin)
			if (retry) return retry
		}
		throw error
	}
	return data.id as string
}

export async function getDefaultUserId() {
	const email = env.DEFAULT_ADMIN_EMAIL
	if (!email) return null

	const { data, error } = await supabaseAdmin
		.from("users")
		.select("id")
		.eq("email", email)
		.maybeSingle()

	if (error) throw error
	return data?.id ?? null
}

export async function ensureMembershipForUser(userId: string) {
	const orgId = await ensureDefaultOrganization()

	const { data, error } = await supabaseAdmin
		.from("organization_members")
		.select("id")
		.eq("organization_id", orgId)
		.eq("user_id", userId)
		.maybeSingle()

	if (error) throw error

	if (!data) {
		const { error: insertError } = await supabaseAdmin
			.from("organization_members")
			.insert({
				organization_id: orgId,
				user_id: userId,
				role: "owner",
				is_owner: true,
			})

		if (insertError && (insertError as { code?: string }).code !== "23505") {
			throw insertError
		}
	}

	return orgId
}
