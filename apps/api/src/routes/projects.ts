import {
	CreateProjectSchema,
	DeleteProjectSchema,
	ProjectSchema,
	UpdateProjectSchema,
} from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { z } from "zod"

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type DeleteProjectInput = z.infer<typeof DeleteProjectSchema>

type SpaceWithRelations = {
	id: string
	name: string | null
	container_tag: string
	created_at: string
	updated_at: string | null
	is_experimental: boolean | null
	documents_to_spaces?: Array<{ document_id: string | null }>
}

function slugify(name: string) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
}

function mapSpaceToProject(space: SpaceWithRelations) {
	return ProjectSchema.parse({
		id: space.id,
		name: space.name ?? "Untitled Project",
		containerTag: space.container_tag,
		createdAt: space.created_at,
		updatedAt: space.updated_at,
		isExperimental: space.is_experimental ?? false,
		documentCount: space.documents_to_spaces?.length ?? 0,
	})
}

export async function listProjects(
	client: SupabaseClient,
	organizationId: string,
) {
	const { data, error } = await client
		.from("spaces")
		.select(
			"id, container_tag, name, is_experimental, created_at, updated_at, documents_to_spaces(document_id)",
		)
		.eq("organization_id", organizationId)
		.order("created_at", { ascending: false })

	if (error) throw error
	const spaces = data ?? []
	return spaces.map(mapSpaceToProject)
}

export async function createProject(
	client: SupabaseClient,
	{
		organizationId,
		userId: _userId,
		payload,
	}: {
		organizationId: string
		userId: string
		payload: CreateProjectInput
	},
) {
	const parsed = CreateProjectSchema.parse(payload)
	const slug = slugify(parsed.name)
	const containerTag = `sm_project_${slug || Math.random().toString(36).slice(2, 10)}`

	const { data, error } = await client
		.from("spaces")
		.insert({
			organization_id: organizationId,
			container_tag: containerTag,
			name: parsed.name,
			is_experimental: false,
			metadata: {},
		})
		.select(
			"id, container_tag, name, is_experimental, created_at, updated_at, documents_to_spaces(document_id)",
		)
		.single()

	if (error) throw error
	return mapSpaceToProject(data)
}

export async function deleteProject(
	client: SupabaseClient,
	{
		organizationId,
		projectId,
		mode,
	}: {
		organizationId: string
		projectId: string
		mode: DeleteProjectInput
	},
) {
	const parsed = DeleteProjectSchema.parse(mode)
	let documentsAffected = 0
	const memoriesAffected = 0

	if (parsed.action === "move") {
		const targetProjectId = parsed.targetProjectId
		if (!targetProjectId) {
			throw new Error("targetProjectId is required when action is move")
		}

		// Security: Verify target project belongs to the same organization
		const { data: targetProject, error: targetCheckError } = await client
			.from("spaces")
			.select("id, organization_id")
			.eq("id", targetProjectId)
			.eq("organization_id", organizationId)
			.single()

		if (targetCheckError || !targetProject) {
			throw new Error(
				"Target project not found or does not belong to your organization",
			)
		}

		const { data: links, error: linksError } = await client
			.from("documents_to_spaces")
			.select("document_id")
			.eq("space_id", projectId)

		if (linksError) throw linksError

		documentsAffected = links?.length ?? 0

		if (links && links.length > 0) {
			const inserts = links.map((link) => ({
				document_id: link.document_id,
				space_id: targetProjectId,
			}))

			const { error: upsertError } = await client
				.from("documents_to_spaces")
				.upsert(inserts, { onConflict: "document_id,space_id" })

			if (upsertError) throw upsertError

			const { error: deleteLinksError } = await client
				.from("documents_to_spaces")
				.delete()
				.eq("space_id", projectId)

			if (deleteLinksError) throw deleteLinksError
		}
	} else {
		const { data: links, error: linksError } = await client
			.from("documents_to_spaces")
			.select("document_id")
			.eq("space_id", projectId)

		if (linksError) throw linksError

		const documentIds = (links ?? []).map((link) => link.document_id)
		documentsAffected = documentIds.length

		if (documentIds.length > 0) {
			const { error: deleteDocsError } = await client
				.from("documents")
				.delete()
				.eq("org_id", organizationId)
				.in("id", documentIds)

			if (deleteDocsError) throw deleteDocsError
		}

		const { error: deleteLinksError } = await client
			.from("documents_to_spaces")
			.delete()
			.eq("space_id", projectId)

		if (deleteLinksError) throw deleteLinksError
	}

	const { error } = await client
		.from("spaces")
		.delete()
		.eq("id", projectId)
		.eq("organization_id", organizationId)

	if (error) throw error

	return {
		success: true,
		message: "Project deleted successfully",
		documentsAffected,
		memoriesAffected,
	}
}

export async function updateProject(
	client: SupabaseClient,
	{
		organizationId,
		projectId,
		payload,
	}: {
		organizationId: string
		projectId: string
		payload: z.infer<typeof UpdateProjectSchema>
	},
) {
	const parsed = UpdateProjectSchema.parse(payload)

	const { data, error } = await client
		.from("spaces")
		.update({ name: parsed.name })
		.eq("id", projectId)
		.eq("organization_id", organizationId)
		.select(
			"id, container_tag, name, is_experimental, created_at, updated_at, documents_to_spaces(document_id)",
		)
		.single()

	if (error) throw error
	return mapSpaceToProject(data as SpaceWithRelations)
}
