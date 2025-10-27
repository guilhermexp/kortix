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

export function createScopedSupabase(
	organizationId: string,
	userId?: string,
): SupabaseClient {
	// Always use ANON_KEY to ensure RLS policies are enforced
	// SUPABASE_ANON_KEY is required (not optional) to prevent RLS bypass
	// NOTE: Headers must be lowercase as Supabase converts them
	return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
		auth: { persistSession: false },
		global: {
			headers: {
				"x-supermemory-organization": organizationId,
				...(userId ? { "x-supermemory-user": userId } : {}),
			},
		},
	})
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
