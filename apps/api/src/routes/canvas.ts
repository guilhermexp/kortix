import type { SupabaseClient } from "@supabase/supabase-js"

// Canvas Project types
export interface CanvasProject {
	id: string
	name: string
	description?: string | null
	thumbnail?: string | null
	color: string
	createdAt: string
	updatedAt: string
}

// List all canvas projects for a user
export async function listCanvasProjects(
	client: SupabaseClient,
	userId: string,
	orgId: string,
): Promise<CanvasProject[]> {
	const { data, error } = await client
		.from("canvas_projects")
		.select("id, name, description, thumbnail, color, created_at, updated_at")
		.eq("user_id", userId)
		.order("updated_at", { ascending: false })

	if (error) throw error

	return (data || []).map((p) => ({
		id: p.id,
		name: p.name,
		description: p.description,
		thumbnail: p.thumbnail,
		color: p.color || "blue",
		createdAt: p.created_at,
		updatedAt: p.updated_at,
	}))
}

// Create a new canvas project
export async function createCanvasProject(
	client: SupabaseClient,
	userId: string,
	orgId: string,
	payload: { name: string; description?: string; color?: string },
): Promise<CanvasProject> {
	const { data, error } = await client
		.from("canvas_projects")
		.insert({
			user_id: userId,
			org_id: orgId,
			name: payload.name,
			description: payload.description || null,
			color: payload.color || "blue",
		})
		.select("id, name, description, thumbnail, color, created_at, updated_at")
		.single()

	if (error) throw error

	return {
		id: data.id,
		name: data.name,
		description: data.description,
		thumbnail: data.thumbnail,
		color: data.color || "blue",
		createdAt: data.created_at,
		updatedAt: data.updated_at,
	}
}

// Update a canvas project
export async function updateCanvasProject(
	client: SupabaseClient,
	userId: string,
	projectId: string,
	payload: { name?: string; description?: string; color?: string; thumbnail?: string },
): Promise<CanvasProject> {
	const updateData: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	}
	if (payload.name !== undefined) updateData.name = payload.name
	if (payload.description !== undefined) updateData.description = payload.description
	if (payload.color !== undefined) updateData.color = payload.color
	if (payload.thumbnail !== undefined) updateData.thumbnail = payload.thumbnail

	const { data, error } = await client
		.from("canvas_projects")
		.update(updateData)
		.eq("id", projectId)
		.eq("user_id", userId)
		.select("id, name, description, thumbnail, color, created_at, updated_at")
		.single()

	if (error) throw error

	return {
		id: data.id,
		name: data.name,
		description: data.description,
		thumbnail: data.thumbnail,
		color: data.color || "blue",
		createdAt: data.created_at,
		updatedAt: data.updated_at,
	}
}

// Delete a canvas project and its state
export async function deleteCanvasProject(
	client: SupabaseClient,
	userId: string,
	projectId: string,
): Promise<{ success: boolean }> {
	// First delete the canvas state associated with this project
	await client
		.from("canvas_states")
		.delete()
		.eq("user_id", userId)
		.eq("project_id", projectId)

	// Then delete the project itself
	const { error } = await client
		.from("canvas_projects")
		.delete()
		.eq("id", projectId)
		.eq("user_id", userId)

	if (error) throw error

	return { success: true }
}

// Get canvas state for a user and project
export async function getCanvasState(
	client: SupabaseClient,
	userId: string,
	orgId: string,
	projectId: string = "default",
) {
	const { data, error } = await client
		.from("canvas_states")
		.select("id, state, updated_at")
		.eq("user_id", userId)
		.eq("project_id", projectId)
		.maybeSingle()

	if (error) throw error

	return {
		state: data?.state ?? null,
		updatedAt: data?.updated_at ?? null,
	}
}

// Save canvas state for a user and project
export async function saveCanvasState(
	client: SupabaseClient,
	userId: string,
	orgId: string,
	projectId: string = "default",
	state: unknown,
) {
	// Upsert the canvas state
	const { data, error } = await client
		.from("canvas_states")
		.upsert(
			{
				user_id: userId,
				org_id: orgId,
				project_id: projectId,
				state: state,
				updated_at: new Date().toISOString(),
			},
			{
				onConflict: "user_id,project_id",
			}
		)
		.select("id, updated_at")
		.single()

	if (error) throw error

	return {
		success: true,
		updatedAt: data?.updated_at,
	}
}

// Delete canvas state for a user and project
export async function deleteCanvasState(
	client: SupabaseClient,
	userId: string,
	projectId: string = "default",
) {
	const { error } = await client
		.from("canvas_states")
		.delete()
		.eq("user_id", userId)
		.eq("project_id", projectId)

	if (error) throw error

	return {
		success: true,
	}
}
