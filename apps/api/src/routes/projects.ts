import {
  CreateProjectSchema,
  DeleteProjectSchema,
  ProjectSchema,
  UpdateProjectSchema,
} from "@repo/validation/api";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type DeleteProjectInput = z.infer<typeof DeleteProjectSchema>;

type SpaceWithDocumentCount = {
  id: string;
  name: string | null;
  container_tag: string;
  is_fixed: boolean | null;
  created_at: string;
  updated_at: string | null;
  org_id: string;
  document_count?: number;
};

function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: unknown }).code ?? "");
  const message = String((error as { message?: unknown }).message ?? "");
  return (
    code === "42703" ||
    message.includes(`column ${column} does not exist`) ||
    message.includes(`"${column}"`)
  );
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function mapSpaceToProject(space: SpaceWithDocumentCount) {
  const updatedAt = space.updated_at ?? space.created_at;
  return ProjectSchema.parse({
    id: space.id,
    name: space.name ?? "Untitled Project",
    containerTag: space.container_tag,
    createdAt: space.created_at,
    updatedAt,
    isExperimental: false,
    isFixed: space.is_fixed ?? false,
    documentCount: space.document_count ?? 0,
  });
}

export async function listProjects(
  client: SupabaseClient,
  organizationId: string,
) {
  // Get all spaces for the organization
  let { data: spaces, error } = await client
    .from("spaces")
    .select("id, container_tag, name, is_fixed, created_at, updated_at, org_id")
    .eq("org_id", organizationId)
    .order("created_at", { ascending: false });

  // Backward compatibility: databases without spaces.is_fixed column
  if (error && isMissingColumnError(error, "is_fixed")) {
    const fallback = await client
      .from("spaces")
      .select("id, container_tag, name, created_at, updated_at, org_id")
      .eq("org_id", organizationId)
      .order("created_at", { ascending: false });

    error = fallback.error;
    spaces = (fallback.data ?? []).map((space) => ({
      ...space,
      is_fixed: false,
    }));
  }

  if (error) throw error;

  if (!spaces || spaces.length === 0) {
    return [];
  }

  // Count documents for each space
  const spacesWithCounts: SpaceWithDocumentCount[] = await Promise.all(
    spaces.map(async (space) => {
      const { count, error: countError } = await client
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("space_id", space.id)
        .eq("org_id", organizationId);

      if (countError) {
        console.error(
          `Error counting documents for space ${space.id}:`,
          countError,
        );
      }

      return {
        ...space,
        document_count: count ?? 0,
      };
    }),
  );

  return spacesWithCounts.map(mapSpaceToProject);
}

export async function createProject(
  client: SupabaseClient,
  {
    organizationId,
    userId: _userId,
    payload,
  }: {
    organizationId: string;
    userId: string;
    payload: CreateProjectInput;
  },
) {
  const parsed = CreateProjectSchema.parse(payload);
  const slug = slugify(parsed.name);
  const containerTag = `sm_project_${slug || Math.random().toString(36).slice(2, 10)}`;

  // Select without is_fixed to avoid hard dependency on newer schema columns.
  // New projects are always non-fixed.
  const { data, error } = await client
    .from("spaces")
    .insert({
      org_id: organizationId,
      container_tag: containerTag,
      name: parsed.name,
      metadata: {},
    })
    .select("id, container_tag, name, created_at, updated_at, org_id")
    .single();

  if (error) throw error;

  // New space has 0 documents
  return mapSpaceToProject({ ...data, is_fixed: false, document_count: 0 });
}

export async function deleteProject(
  client: SupabaseClient,
  {
    organizationId,
    projectId,
    mode,
  }: {
    organizationId: string;
    projectId: string;
    mode: DeleteProjectInput;
  },
) {
  // Check if project is fixed (protected against deletion)
  let { data: space, error: spaceError } = await client
    .from("spaces")
    .select("is_fixed")
    .eq("id", projectId)
    .eq("org_id", organizationId)
    .maybeSingle();

  // Backward compatibility: databases without spaces.is_fixed column
  if (spaceError && isMissingColumnError(spaceError, "is_fixed")) {
    const fallback = await client
      .from("spaces")
      .select("id")
      .eq("id", projectId)
      .eq("org_id", organizationId)
      .maybeSingle();

    spaceError = fallback.error;
    space = fallback.data
      ? ({ is_fixed: false } as { is_fixed: boolean })
      : null;
  }

  if (spaceError) throw spaceError;

  if (space?.is_fixed) {
    throw new Error("Cannot delete a fixed project");
  }

  const parsed = DeleteProjectSchema.parse(mode);
  let documentsAffected = 0;
  const memoriesAffected = 0;

  if (parsed.action === "move") {
    const targetProjectId = parsed.targetProjectId;
    if (!targetProjectId) {
      throw new Error("targetProjectId is required when action is move");
    }

    // Security: Verify target project belongs to the same organization
    const { data: targetProject, error: targetCheckError } = await client
      .from("spaces")
      .select("id, org_id")
      .eq("id", targetProjectId)
      .eq("org_id", organizationId)
      .single();

    if (targetCheckError || !targetProject) {
      throw new Error(
        "Target project not found or does not belong to your organization",
      );
    }

    // Count documents before moving
    const { count, error: countError } = await client
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("space_id", projectId)
      .eq("org_id", organizationId);

    if (countError) throw countError;
    documentsAffected = count ?? 0;

    // Move documents to target project
    if (documentsAffected > 0) {
      const { error: updateError } = await client
        .from("documents")
        .update({ space_id: targetProjectId })
        .eq("space_id", projectId)
        .eq("org_id", organizationId);

      if (updateError) throw updateError;
    }
  } else {
    // Delete action: count and delete documents
    const { data: docs, error: docsError } = await client
      .from("documents")
      .select("id")
      .eq("space_id", projectId)
      .eq("org_id", organizationId);

    if (docsError) throw docsError;

    documentsAffected = docs?.length ?? 0;

    if (docs && docs.length > 0) {
      const documentIds = docs.map((doc) => doc.id);
      const { error: deleteDocsError } = await client
        .from("documents")
        .delete()
        .eq("org_id", organizationId)
        .in("id", documentIds);

      if (deleteDocsError) throw deleteDocsError;
    }
  }

  // Delete the space itself
  const { error } = await client
    .from("spaces")
    .delete()
    .eq("id", projectId)
    .eq("org_id", organizationId);

  if (error) throw error;

  return {
    success: true,
    message: "Project deleted successfully",
    documentsAffected,
    memoriesAffected,
  };
}

export async function updateProject(
  client: SupabaseClient,
  {
    organizationId,
    projectId,
    payload,
  }: {
    organizationId: string;
    projectId: string;
    payload: z.infer<typeof UpdateProjectSchema>;
  },
) {
  const parsed = UpdateProjectSchema.parse(payload);

  let { data, error } = await client
    .from("spaces")
    .update({ name: parsed.name })
    .eq("id", projectId)
    .eq("org_id", organizationId)
    .select("id, container_tag, name, is_fixed, created_at, updated_at, org_id")
    .single();

  // Backward compatibility: databases without spaces.is_fixed column
  if (error && isMissingColumnError(error, "is_fixed")) {
    const fallback = await client
      .from("spaces")
      .update({ name: parsed.name })
      .eq("id", projectId)
      .eq("org_id", organizationId)
      .select("id, container_tag, name, created_at, updated_at, org_id")
      .single();

    error = fallback.error;
    data = fallback.data ? { ...fallback.data, is_fixed: false } : null;
  }

  if (error) throw error;

  // Count documents for the updated project
  const { count, error: countError } = await client
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("space_id", projectId)
    .eq("org_id", organizationId);

  if (countError) {
    console.error(
      `Error counting documents for space ${projectId}:`,
      countError,
    );
  }

  return mapSpaceToProject({ ...data, document_count: count ?? 0 });
}
