import type { SupabaseClient } from "@supabase/supabase-js"

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
