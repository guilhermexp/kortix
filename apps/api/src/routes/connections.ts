import { ConnectionResponseSchema } from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

export const createConnectionInputSchema = z.object({
	containerTags: z.array(z.string()).optional(),
	documentLimit: z.number().int().min(1).max(10000).optional(),
	metadata: z
		.record(z.union([z.string(), z.number(), z.boolean()]))
		.optional()
		.nullable(),
	redirectUrl: z.string().url().optional(),
})

export type CreateConnectionInput = z.infer<typeof createConnectionInputSchema>

export async function createConnection(
	client: SupabaseClient,
	{
		organizationId,
		userId,
		provider,
		payload,
	}: {
		organizationId: string
		userId: string
		provider: string
		payload: CreateConnectionInput
	},
) {
	const parsed = createConnectionInputSchema.parse(payload)
	const { data, error } = await client
		.from("connections")
		.insert({
			org_id: organizationId,
			user_id: userId,
			provider,
			document_limit: parsed.documentLimit ?? 1000,
			container_tags: parsed.containerTags ?? [],
			metadata: parsed.metadata ?? {},
		})
		.select("id, created_at")
		.single()

	if (error) throw error

	const connectionId = data.id
	const authLink = `${process.env.APP_URL ?? "http://localhost:3000"}/oauth/${provider}?connection=${connectionId}`

	return {
		authLink,
		expiresIn: "900",
		id: connectionId,
		redirectsTo: parsed.redirectUrl,
	}
}

export async function listConnections(
	client: SupabaseClient,
	organizationId: string,
	containerTags?: string[],
) {
	const { data, error } = await client
		.from("connections")
		.select(
			"id, provider, email, document_limit, metadata, expires_at, created_at, container_tags",
		)
		.eq("org_id", organizationId)
		.order("created_at", { ascending: false })

	if (error) throw error

	const filtered = (data ?? []).filter((connection) => {
		if (!containerTags || containerTags.length === 0) return true
		const tags = Array.isArray(connection.container_tags)
			? connection.container_tags
			: []
		return containerTags.some((tag) => tags.includes(tag))
	})

	return filtered.map((connection) =>
		ConnectionResponseSchema.parse({
			id: connection.id,
			provider: connection.provider,
			email: connection.email ?? undefined,
			documentLimit: connection.document_limit ?? undefined,
			metadata: connection.metadata ?? undefined,
			expiresAt: connection.expires_at ?? undefined,
			createdAt: connection.created_at,
		}),
	)
}

export async function getConnection(
	client: SupabaseClient,
	organizationId: string,
	connectionId: string,
) {
	const { data, error } = await client
		.from("connections")
		.select(
			"id, provider, email, document_limit, metadata, expires_at, created_at",
		)
		.eq("org_id", organizationId)
		.eq("id", connectionId)
		.maybeSingle()

	if (error) throw error
	if (!data) return null

	return ConnectionResponseSchema.parse({
		id: data.id,
		provider: data.provider,
		email: data.email ?? undefined,
		documentLimit: data.document_limit ?? undefined,
		metadata: data.metadata ?? undefined,
		expiresAt: data.expires_at ?? undefined,
		createdAt: data.created_at,
	})
}

export async function deleteConnection(
	client: SupabaseClient,
	organizationId: string,
	connectionId: string,
) {
	const { error } = await client
		.from("connections")
		.delete()
		.eq("org_id", organizationId)
		.eq("id", connectionId)

	if (error) throw error
}
