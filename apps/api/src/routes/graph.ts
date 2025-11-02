import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { calculateSemanticSimilarity } from "@repo/lib/similarity";

const CONNECTIONS_SCHEMA = z.object({
  containerTags: z.array(z.string().min(1)).optional(),
  documentIds: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(2).max(500).default(200),
  threshold: z.number().min(0).max(1).default(0.72),
  topK: z.number().int().min(1).max(20).default(3),
});

type ConnectionsParams = z.infer<typeof CONNECTIONS_SCHEMA>;

type RawDocumentRow = {
  id: string;
  title: string | null;
  summary: string | null;
  summary_embedding: unknown;
  documents_to_spaces?:
    | Array<{ space_id: string | null; spaces?: { container_tag: string | null } | null }>
    | null;
  metadata?: Record<string, unknown> | null;
};

type ParsedDocument = {
  id: string;
  embedding: number[] | null;
  spaces: string[];
};

function parseEmbedding(source: unknown): number[] | null {
  if (!source) return null;
  if (Array.isArray(source)) {
    return source.every((value) => typeof value === "number")
      ? (source as number[])
      : null;
  }
  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function extractSpaces(doc: RawDocumentRow): string[] {
  let metadataSpaces: string[] = [];
  if (doc.metadata && typeof doc.metadata === "object") {
    const raw = (doc.metadata as Record<string, unknown>).containerTags;
    if (Array.isArray(raw)) {
      metadataSpaces = raw
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim());
    }
  }

  const relationSpaces =
    doc.documents_to_spaces
      ?.map((item) => item?.spaces?.container_tag ?? null)
      ?.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      ?.map((value) => value.trim()) ?? [];
  const combined = [...metadataSpaces, ...relationSpaces];
  return combined.length > 0 ? Array.from(new Set(combined)) : ["default"];
}

export async function handleGraphConnections({
  client,
  payload,
  orgId,
}: {
  client: SupabaseClient;
  payload: unknown;
  orgId: string;
}) {
  let parsed: ConnectionsParams;
  try {
    parsed = CONNECTIONS_SCHEMA.parse(payload ?? {});
  } catch (error) {
    return Response.json(
      {
        error: {
          message: "Invalid graph connections payload",
          issues: error instanceof z.ZodError ? error.issues : undefined,
        },
      },
      { status: 400 },
    );
  }

  try {
    let query = client
      .from("documents")
      .select(
        "id, title, summary, summary_embedding, metadata, documents_to_spaces(space_id, spaces(container_tag))",
      )
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false });

    if (parsed.documentIds && parsed.documentIds.length > 0) {
      query = query.in("id", parsed.documentIds);
    } else {
      query = query.limit(parsed.limit);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[Graph Connections] Query failed:", error);
      return Response.json({
        data: { edges: [], count: 0 },
        error: {
          message: "Failed to fetch documents for graph connections",
        },
      });
    }

    const rows = Array.isArray(data) ? (data as RawDocumentRow[]) : [];

    const filteredRows = parsed.containerTags?.length
      ? rows.filter((row) => {
          const spaces = extractSpaces(row);
          return spaces.some((space) => parsed.containerTags?.includes(space));
        })
      : rows;

    const documents: ParsedDocument[] = filteredRows.map((row) => ({
      id: row.id,
      embedding: parseEmbedding(row.summary_embedding),
      spaces: extractSpaces(row),
    }));

    const edges: Array<{
      sourceId: string;
      targetId: string;
      similarity: number;
    }> = [];

    const DOC_SIMILARITY_THRESHOLD = parsed.threshold;
    const TOP_K_PER_DOC = parsed.topK;

    const docsBySpace = new Map<string, ParsedDocument[]>();
    for (const doc of documents) {
      if (!doc.embedding) continue;
      for (const space of doc.spaces) {
        if (!docsBySpace.has(space)) {
          docsBySpace.set(space, []);
        }
        docsBySpace.get(space)!.push(doc);
      }
    }

    docsBySpace.forEach((spaceDocs) => {
      const n = spaceDocs.length;
      if (n < 2) return;

      const neighbors: Array<Array<{ j: number; sim: number }>> = Array.from(
        { length: n },
        () => [],
      );

      for (let i = 0; i < n; i++) {
        const embI = spaceDocs[i]!.embedding;
        if (!embI) continue;
        for (let j = i + 1; j < n; j++) {
          const embJ = spaceDocs[j]!.embedding;
          if (!embJ) continue;
          const sim = calculateSemanticSimilarity(embI, embJ);
          if (sim >= DOC_SIMILARITY_THRESHOLD) {
            neighbors[i]!.push({ j, sim });
            neighbors[j]!.push({ j: i, sim });
          }
        }
      }

      const keep = new Set<string>();
      for (let i = 0; i < n; i++) {
        const top = neighbors[i]!.sort((a, b) => b.sim - a.sim).slice(
          0,
          TOP_K_PER_DOC,
        );
        for (const { j } of top) {
          const a = Math.min(i, j);
          const b = Math.max(i, j);
          keep.add(`${a}-${b}`);
        }
      }

      for (const key of keep) {
        const [aStr, bStr] = key.split("-");
        const i = Number(aStr);
        const j = Number(bStr);
        const embI = spaceDocs[i]!.embedding;
        const embJ = spaceDocs[j]!.embedding;
        if (!embI || !embJ) continue;
        const similarity = calculateSemanticSimilarity(embI, embJ);
        if (similarity <= 0) continue;
        edges.push({
          sourceId: spaceDocs[i]!.id,
          targetId: spaceDocs[j]!.id,
          similarity: Number(similarity.toFixed(4)),
        });
      }
    });

    return Response.json({
      data: {
        edges,
        count: edges.length,
      },
    });
  } catch (error) {
    console.error("[Graph Connections] Failed to compute edges:", error);
    return Response.json({
      data: { edges: [], count: 0 },
      error: {
        message: "Failed to compute graph connections",
        details: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}
