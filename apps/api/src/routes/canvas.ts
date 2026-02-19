import {
	CanvasResponseSchema,
	CreateCanvasSchema,
	UpdateCanvasSchema,
} from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { z } from "zod"

export type CreateCanvasInput = z.infer<typeof CreateCanvasSchema>
export type UpdateCanvasInput = z.infer<typeof UpdateCanvasSchema>

export class CanvasVersionConflictError extends Error {
	expectedVersion: number
	currentVersion: number

	constructor(expectedVersion: number, currentVersion: number) {
		super(
			`Canvas version conflict: expected ${expectedVersion}, current ${currentVersion}`,
		)
		this.name = "CanvasVersionConflictError"
		this.expectedVersion = expectedVersion
		this.currentVersion = currentVersion
	}
}

function mapCanvasToResponse(canvas: any) {
	if (!canvas || typeof canvas !== "object") {
		throw new Error("Canvas data is null or invalid - the canvases table may not exist. Run migration 0015_add_canvases_table.sql")
	}
	if (!canvas.id) {
		throw new Error("Canvas insert returned empty data - check RLS policies and that the canvases table has all required columns (id, user_id, name, content, created_at, updated_at, version)")
	}
	return CanvasResponseSchema.parse({
		id: canvas.id,
		userId: canvas.user_id,
		projectId: canvas.project_id,
		name: canvas.name,
		content: canvas.content,
		preview: canvas.preview,
		version:
			typeof canvas.version === "number" && Number.isFinite(canvas.version)
				? canvas.version
				: 1,
		createdAt: canvas.created_at ? new Date(canvas.created_at).toISOString() : new Date().toISOString(),
		updatedAt: canvas.updated_at ? new Date(canvas.updated_at).toISOString() : new Date().toISOString(),
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
	if (payload.baseVersion !== undefined) {
		const { data: current, error: currentError } = await client
			.from("canvases")
			.select("version")
			.eq("id", id)
			.eq("user_id", userId)
			.single()
		if (currentError) throw currentError
		const currentVersion =
			typeof current?.version === "number" && Number.isFinite(current.version)
				? current.version
				: 1
		if (currentVersion !== payload.baseVersion) {
			throw new CanvasVersionConflictError(payload.baseVersion, currentVersion)
		}
	}

	const updates: any = {
		updated_at: new Date().toISOString(),
	}

	if (payload.name !== undefined) updates.name = payload.name
	if (payload.content !== undefined) updates.content = payload.content
	if (payload.preview !== undefined) updates.preview = payload.preview
	if (payload.baseVersion !== undefined) {
		updates.version = payload.baseVersion + 1
	}

	let query = client
		.from("canvases")
		.update(updates)
		.eq("id", id)
		.eq("user_id", userId)
	if (payload.baseVersion !== undefined) {
		query = query.eq("version", payload.baseVersion)
	}
	const { data, error } = await query.select("*").single()

	if (error) throw error
	if (!data) {
		throw new Error("Canvas not found")
	}

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
