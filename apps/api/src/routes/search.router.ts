/**
 * Search Router
 * Handles all /v3/search/* routes
 */

import { zValidator } from "@hono/zod-validator"
import { SearchRequestSchema } from "@repo/validation/api"
import { Hono } from "hono"
import { z } from "zod"
import { hybridSearch } from "../services/hybrid-search"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import { searchDocuments } from "./search"

export const searchRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

searchRouter.post("/", zValidator("json", SearchRequestSchema), async (c) => {
	const { organizationId } = c.var.session
	const body = c.req.valid("json")
	const supabase = createClientForSession(c.var.session)

	try {
		const response = await searchDocuments(supabase, organizationId, body)
		return c.json(response)
	} catch (error) {
		console.error("Search failed", error)
		return c.json({ error: { message: "Search failed" } }, 500)
	}
})

// New hybrid search endpoint with keyword + vector search
searchRouter.post(
	"/hybrid",
	zValidator(
		"json",
		SearchRequestSchema.extend({
			mode: z
				.enum(["vector", "keyword", "hybrid"])
				.default("hybrid")
				.optional(),
			weightVector: z.number().min(0).max(1).default(0.7).optional(),
			rerankResults: z.boolean().default(true).optional(),
		}),
	),
	async (c) => {
		const { organizationId } = c.var.session
		const body = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const results = await hybridSearch(supabase, {
				query: body.q,
				orgId: organizationId,
				limit: body.limit,
				mode: body.mode || "hybrid",
				weightVector: body.weightVector,
				includeSummary: body.includeSummary,
				includeFullDocs: body.includeFullDocs,
				documentId: body.docId,
				containerTags: body.containerTags,
				categoriesFilter: body.categoriesFilter,
				rerankResults: body.rerankResults,
			})

			return c.json({
				results,
				timing: 0,
				total: results.length,
			})
		} catch (error) {
			console.error("Hybrid search failed", error)
			try {
				const fallback = await searchDocuments(supabase, organizationId, body)
				return c.json(fallback, 200)
			} catch (_e) {
				return c.json({ error: { message: "Hybrid search failed" } }, 500)
			}
		}
	},
)
