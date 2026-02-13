import {
	CanvasResponseSchema,
	CreateCanvasSchema,
	UpdateCanvasSchema,
} from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { z } from "zod"

export type CreateCanvasInput = z.infer<typeof CreateCanvasSchema>
export type UpdateCanvasInput = z.infer<typeof UpdateCanvasSchema>

function mapCanvasToResponse(canvas: any) {
	return CanvasResponseSchema.parse({
		id: canvas.id,
		userId: canvas.user_id,
		projectId: canvas.project_id,
		name: canvas.name,
		content: canvas.content,
		preview: canvas.preview,
		createdAt: new Date(canvas.created_at).toISOString(),
		updatedAt: new Date(canvas.updated_at).toISOString(),
	})
}

export async function listCanvases(
	client: SupabaseClient,
	userId: string,
	projectId?: string,
) {
	let query = client
		.from("canvases")
		.select("*")
		.eq("user_id", userId)
		.order("updated_at", { ascending: false })

	if (projectId) {
		query = query.eq("project_id", projectId)
	}

	const { data, error } = await query

	if (error) throw error

	return (data || []).map(mapCanvasToResponse)
}

export async function getCanvas(
	client: SupabaseClient,
	id: string,
	userId: string,
) {
	const { data, error } = await client
		.from("canvases")
		.select("*")
		.eq("id", id)
		.eq("user_id", userId)
		.single()

	if (error) throw error
	if (!data) throw new Error("Canvas not found")

	return mapCanvasToResponse(data)
}

export async function createCanvas(
	client: SupabaseClient,
	userId: string,
	payload: CreateCanvasInput,
) {
	const { data, error } = await client
		.from("canvases")
		.insert({
			user_id: userId,
			project_id: payload.projectId,
			name: payload.name,
			content: payload.content,
		})
		.select("*")
		.single()

	if (error) throw error

	return mapCanvasToResponse(data)
}

export async function updateCanvas(
	client: SupabaseClient,
	id: string,
	userId: string,
	payload: UpdateCanvasInput,
) {
	const updates: any = {
		updated_at: new Date().toISOString(),
	}

	if (payload.name !== undefined) updates.name = payload.name
	if (payload.content !== undefined) updates.content = payload.content
	if (payload.preview !== undefined) updates.preview = payload.preview

	const { data, error } = await client
		.from("canvases")
		.update(updates)
		.eq("id", id)
		.eq("user_id", userId)
		.select("*")
		.single()

	if (error) throw error

	return mapCanvasToResponse(data)
}

export async function deleteCanvas(
	client: SupabaseClient,
	id: string,
	userId: string,
) {
	// Verify canvas exists before deleting
	const { data: existing, error: findError } = await client
		.from("canvases")
		.select("id")
		.eq("id", id)
		.eq("user_id", userId)
		.maybeSingle()

	if (findError) throw findError
	if (!existing) throw new Error("Canvas not found")

	const { error } = await client
		.from("canvases")
		.delete()
		.eq("id", id)
		.eq("user_id", userId)

	if (error) throw error

	return { id }
}
