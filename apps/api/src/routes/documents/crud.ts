/**
 * Documents — CRUD operations (get, update, delete, cancel)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addConnectionUpdateJob } from "../../worker/connection-updater-job";
import { getDocumentChildren } from "./bundles";
import {
  ensureSpace,
} from "./add";
import {
  extractContainerTags,
  invalidateDocumentCaches,
} from "./utils";

export async function getDocument(
  client: SupabaseClient,
  organizationId: string,
  documentId: string,
) {
  const { data: document, error } = await client
    .from("documents")
    .select(
      "id, status, content, summary, metadata, created_at, updated_at, space_id, spaces(container_tag), title, url, type, preview_image, raw, parent_id",
    )
    .eq("org_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  if (!document) return null;

  const containerTags = extractContainerTags(document);

  const { data: memories, error: memoriesError } = await client
    .from("memories")
    .select("id, content, metadata, created_at, updated_at")
    .eq("org_id", organizationId)
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });

  if (memoriesError) throw memoriesError;

  // If this is a bundle, fetch children
  const isBundle = (document as any).type === "bundle";
  let children: Array<{
    id: string;
    title: string | null;
    previewImage: string | null;
    summary: string | null;
    status: string;
    url: string | null;
    type: string;
    content: string | null;
    childOrder: number;
  }> | undefined;
  let childCount: number | undefined;

  if (isBundle) {
    children = await getDocumentChildren(client, organizationId, documentId);
    childCount = children.length;
  }

  return {
    id: document.id,
    status: document.status ?? "unknown",
    content: document.content ?? null,
    summary: document.summary ?? null,
    metadata: document.metadata ?? null,
    containerTags,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    // Additional fields needed for preview rendering
    title: (document as any).title ?? null,
    url: (document as any).url ?? null,
    type: (document as any).type ?? null,
    previewImage: (document as any).preview_image ?? null,
    raw: (document as any).raw ?? null,
    parentId: (document as any).parent_id ?? null,
    // Bundle fields
    ...(childCount !== undefined ? { childCount } : {}),
    ...(children ? { children } : {}),
    // Transform memory entries: database 'content' → API 'memory'
    memoryEntries: (memories ?? []).map((row) => ({
      id: row.id,
      memory: row.content ?? "", // API field (backward compatibility)
      metadata: row.metadata ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export async function updateDocument(
  client: SupabaseClient,
  {
    organizationId,
    documentId,
    content,
    title,
    containerTags,
    metadata,
  }: {
    organizationId: string;
    documentId: string;
    content?: string;
    title?: string;
    containerTags?: string[];
    metadata?: Record<string, unknown> | null;
  },
) {
  const updates: Record<string, unknown> = {};

  if (content !== undefined) {
    updates.content = content;
  }

  if (title !== undefined) {
    updates.title = title;
  }

  if (metadata !== undefined) {
    updates.metadata = metadata;
  }

  const normalizedTags =
    Array.isArray(containerTags) && containerTags.length > 0
      ? Array.from(
          new Set(
            containerTags
              .map((tag) => tag?.trim())
              .filter((tag): tag is string => Boolean(tag && tag.length > 0)),
          ),
        )
      : undefined;

  if (
    Object.keys(updates).length === 0 &&
    (!normalizedTags || normalizedTags.length === 0)
  ) {
    throw new Error(
      "At least one field (content, title, metadata, or containerTags) must be provided for update",
    );
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await client
      .from("documents")
      .update(updates)
      .eq("id", documentId)
      .eq("org_id", organizationId);

    if (updateError) throw updateError;
  }

  if (normalizedTags && normalizedTags.length > 0) {
    const spaceIds: string[] = [];
    for (const tag of normalizedTags) {
      const spaceId = await ensureSpace(client, organizationId, tag);
      spaceIds.push(spaceId);
    }

    // Update document to use the first space (many-to-one relationship)
    // Note: Schema only supports ONE space per document now
    const primarySpaceId = spaceIds[0];
    const { error: updateSpaceError } = await client
      .from("documents")
      .update({ space_id: primarySpaceId })
      .eq("id", documentId)
      .eq("org_id", organizationId);

    if (updateSpaceError) throw updateSpaceError;
  }

  const updated = await getDocument(client, organizationId, documentId);
  if (!updated) {
    throw new Error("Document not found after update");
  }

  // Queue connection update job (async - doesn't block response)
  addConnectionUpdateJob(documentId, organizationId).catch((err) => {
    console.error("[updateDocument] Failed to queue connection update", {
      documentId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  invalidateDocumentCaches();
  return updated;
}

export async function deleteDocument(
  client: SupabaseClient,
  {
    organizationId,
    documentId,
  }: {
    organizationId: string;
    documentId: string;
  },
) {
  // Skip if this is a temporary ID (not yet created in database)
  if (documentId.startsWith("temp-")) {
    console.log(
      `[deleteDocument] Skipping temporary document ${documentId} - not yet in database`,
    );
    return;
  }

  // Check if this document is a child of a bundle
  const { data: doc } = await client
    .from("documents")
    .select("parent_id")
    .eq("id", documentId)
    .eq("org_id", organizationId)
    .maybeSingle();

  const parentId = doc?.parent_id ?? null;

  const { error } = await client
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("org_id", organizationId);

  if (error) throw error;

  // If this was a child, check if parent bundle is now empty and delete it
  if (parentId) {
    const { data: siblings } = await client
      .from("documents")
      .select("id")
      .eq("parent_id", parentId)
      .eq("org_id", organizationId)
      .limit(1);

    if (!siblings || siblings.length === 0) {
      // No more children — delete the empty parent bundle
      await client
        .from("documents")
        .delete()
        .eq("id", parentId)
        .eq("org_id", organizationId);
    }
  }

  invalidateDocumentCaches();
}

export async function cancelDocument(
  client: SupabaseClient,
  {
    organizationId,
    documentId,
  }: {
    organizationId: string;
    documentId: string;
  },
) {
  // Skip if this is a temporary ID (not yet created in database)
  if (documentId.startsWith("temp-")) {
    console.log(
      `[cancelDocument] Skipping temporary document ${documentId} - not yet in database`,
    );
    return;
  }

  // First, delete any partial chunks that may have been created
  const { error: chunksError } = await client
    .from("document_chunks")
    .delete()
    .eq("document_id", documentId);

  if (chunksError) {
    console.error("Failed to delete chunks during cancellation:", chunksError);
    // Don't throw - continue with status update even if chunk deletion fails
  }

  // Update document status to failed with cancellation message
  const { error: updateError } = await client
    .from("documents")
    .update({
      status: "failed",
      error: "Cancelled by user",
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("org_id", organizationId);

  if (updateError) throw updateError;

  console.log(
    `[cancelDocument] Document ${documentId} cancelled by user, cleaned up partial data`,
  );
}
