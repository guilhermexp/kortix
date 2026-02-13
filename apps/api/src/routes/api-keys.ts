import { createHash } from "node:crypto"
import type { Context } from "hono"
import { customAlphabet } from "nanoid"
import { z } from "zod"
import { supabaseAdmin } from "../supabase"

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
const generateSecret = customAlphabet(ALPHABET, 42)

export const CreateApiKeySchema = z.object({
	name: z.string().trim().min(1).max(120),
	prefix: z.string().trim().max(64).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
})

function hashSecret(secret: string) {
	return createHash("sha256").update(secret).digest("hex")
}

export async function createApiKeyHandler(c: Context) {
	let payload: z.infer<typeof CreateApiKeySchema>
	try {
		payload = CreateApiKeySchema.parse(await c.req.json())
	} catch {
		return c.json({ error: { message: "Invalid request" } }, 400)
	}
	const { organizationId, userId } = c.var.session

	const secretSuffix = generateSecret()
	const fullSecret = `${payload.prefix ?? "sm_"}${secretSuffix}`
	const tokenHint = fullSecret.slice(-6)
	const secretHash = hashSecret(fullSecret)

	const { data, error } = await supabaseAdmin
		.from("api_keys")
		.insert({
			org_id: organizationId,
			user_id: userId,
			name: payload.name,
			prefix: payload.prefix ?? null,
			secret_hash: secretHash,
			token_hint: tokenHint,
			metadata: payload.metadata ?? {},
		})
		.select("id, name, created_at, last_used_at, token_hint")
		.single()

	if (error || !data) {
		console.error("createApiKeyHandler: failed", error)
		return c.json({ error: { message: "Failed to create API key" } }, 500)
	}

	return c.json(
		{
			key: fullSecret,
			apiKey: {
				id: data.id,
				name: data.name,
				createdAt: data.created_at,
				lastUsedAt: data.last_used_at,
				tokenHint: data.token_hint,
			},
		},
		201,
	)
}
