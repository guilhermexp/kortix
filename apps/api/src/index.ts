import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// Load env in this order: local in app → root .env.local → generic .env
try {
  loadEnv({ path: ".env.local" });
  const rootEnvLocal = resolve(process.cwd(), "..", "..", ".env.local");
  if (existsSync(rootEnvLocal)) {
    loadEnv({ path: rootEnvLocal });
  }
  loadEnv();
} catch {
  // ignore env load errors
}

import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import {
  CreateProjectSchema,
  DeleteProjectSchema,
  DocumentsWithMemoriesQuerySchema,
  ListMemoriesQuerySchema,
  MemoryAddSchema,
  MigrateMCPRequestSchema,
  SearchRequestSchema,
  SettingsRequestSchema,
} from "@repo/validation/api";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { env } from "./env";
import { requireAuth } from "./middleware/auth";
import { rateLimiter } from "./middleware/rate-limiter";
import { CreateApiKeySchema, createApiKeyHandler } from "./routes/api-keys";
import {
  getSession as getSessionInfo,
  refreshSession,
  signIn,
  signOut,
  signUp,
} from "./routes/auth";
import { generateChatTitle, handleChat } from "./routes/chat";
import { handleChatV2 } from "./routes/chat-v2";
import {
  createConnection,
  createConnectionInputSchema,
  deleteConnection,
  getConnection,
  listConnections,
} from "./routes/connections";
import {
  handleCreateConversation,
  handleDeleteConversation,
  handleGetConversation,
  handleGetConversationEvents,
  handleGetConversationHistory,
  handleListConversations,
  handleUpdateConversation,
} from "./routes/conversations";
import {
  addDocument,
  cancelDocument,
  DocumentsByIdsSchema,
  deleteDocument,
  findDocumentRelatedLinks,
  getDocument,
  listDocuments,
  listDocumentsWithMemories,
  listDocumentsWithMemoriesByIds,
  migrateMcpDocuments,
  updateDocument,
} from "./routes/documents";
import { handleGraphConnections } from "./routes/graph";
import { healthHandler } from "./routes/health";
import { registerMcpRoutes } from "./routes/mcp";
import {
  completePasswordReset,
  requestPasswordReset,
  updatePassword,
  updatePasswordValidator,
} from "./routes/password";
import { createProject, deleteProject, listProjects } from "./routes/projects";
import { searchDocuments } from "./routes/search";
import { getSettings, updateSettings } from "./routes/settings";
import {
  getCanvasState,
  saveCanvasState,
  deleteCanvasState,
  listCanvasProjects,
  createCanvasProject,
  updateCanvasProject,
  deleteCanvasProject,
} from "./routes/canvas";
import { getWaitlistStatus } from "./routes/waitlist";
import aiActionsRoutes from "./routes/ai-actions";
import { AnalysisService } from "./services/analysis-service";
import {
  startDocumentTimeoutMonitor,
  stopDocumentTimeoutMonitor,
} from "./services/document-timeout-monitor";
import { hybridSearch } from "./services/hybrid-search";
import type { SessionContext } from "./session";
import { createClientForSession, supabaseAdmin } from "./supabase";

const app = new Hono<{ Variables: { session: SessionContext } }>();

const allowedOrigins = new Set(env.ALLOWED_ORIGINS);

// Debug: confirm OpenRouter key presence without printing secrets
try {
  const hasOpenRouterKey = Boolean(
    process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY,
  );
  console.log("[Boot] OpenRouter key detected:", hasOpenRouterKey);
} catch {
  // ignore
}

// Handle preflight OPTIONS requests explicitly first
app.options("*", (c) => {
  const origin = c.req.header("origin");
  const allowedOrigin = origin && (allowedOrigins.has(origin) || origin.startsWith("http://localhost"))
    ? origin
    : env.ALLOWED_ORIGINS[0] ?? "http://localhost:3000";

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Kortix-Organization, X-Kortix-User",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
});

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return env.ALLOWED_ORIGINS[0] ?? "http://localhost:3000";
      }
      if (allowedOrigins.has(origin) || origin.startsWith("http://localhost")) {
        return origin;
      }
      return env.ALLOWED_ORIGINS[0] ?? origin;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Kortix-Organization",
      "X-Kortix-User",
    ],
    exposeHeaders: ["Set-Cookie"],
  }),
);

// Apply rate limiting globally (automatically skips /health and similar paths)
app.use("*", rateLimiter());

app.get("/health", healthHandler);

// Image proxy to bypass CORS restrictions for external images
app.get("/api/image-proxy", async (c) => {
  const url = c.req.query("url");
  if (!url) {
    return c.json({ error: "Missing url parameter" }, 400);
  }

  try {
    // Validate URL
    const parsedUrl = new URL(url);
    const allowedProtocols = ["http:", "https:"];
    if (!allowedProtocols.includes(parsedUrl.protocol)) {
      return c.json({ error: "Invalid URL protocol" }, 400);
    }

    // Fetch the image
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KortixBot/1.0)",
        "Accept": "image/*,*/*",
      },
    });

    if (!response.ok) {
      return c.json({ error: `Failed to fetch image: ${response.status}` }, response.status);
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = await response.arrayBuffer();

    // Set cache headers (cache for 1 hour)
    c.header("Content-Type", contentType);
    c.header("Cache-Control", "public, max-age=3600");
    c.header("Access-Control-Allow-Origin", "*");

    return c.body(buffer);
  } catch (error) {
    console.error("[image-proxy] Error fetching image:", error);
    return c.json({ error: "Failed to fetch image" }, 500);
  }
});

app.get("/", (c) =>
  c.json({
    message: "Kortix API",
    docs: "Pending",
  }),
);

app.post("/api/auth/sign-up", async (c) => signUp(c));
app.post("/api/auth/sign-in", async (c) => signIn(c));
app.post("/api/auth/sign-out", async (c) => signOut(c));
app.post("/api/auth/refresh", async (c) => refreshSession(c));
app.get("/api/auth/session", async (c) => getSessionInfo(c));
app.post("/api/auth/password/reset/request", async (c) =>
  requestPasswordReset(c),
);
app.post("/api/auth/password/reset/complete", async (c) =>
  completePasswordReset(c),
);
app.post(
  "/api/auth/password/update",
  requireAuth,
  zValidator("json", updatePasswordValidator),
  async (c) => updatePassword(c),
);
app.post(
  "/api/auth/api-keys",
  requireAuth,
  zValidator("json", CreateApiKeySchema),
  async (c) => createApiKeyHandler(c),
);

registerMcpRoutes(app);

// AI Actions routes (for canvas AI context menu)
app.route("/api/ai-actions", aiActionsRoutes);

app.use("/v3/*", requireAuth);
app.use("/chat", requireAuth);
app.use("/chat/*", requireAuth);

app.get("/v3/projects", async (c) => {
  const { organizationId, internalUserId } = c.var.session;
  const supabase = createClientForSession(c.var.session);

  try {
    const projects = await listProjects(supabase, organizationId);
    return c.json({ projects });
  } catch (error) {
    console.error("Failed to list projects", error);
    return c.json({ error: { message: "Failed to list projects" } }, 500);
  }
});

app.post("/v3/projects", zValidator("json", CreateProjectSchema), async (c) => {
  const { organizationId, userId } = c.var.session;
  const body = c.req.valid("json");
  const supabase = createClientForSession(c.var.session);

  try {
    const project = await createProject(supabase, {
      organizationId,
      userId,
      payload: body,
    });
    return c.json(project, 201);
  } catch (error) {
    console.error("Failed to create project", error);
    return c.json({ error: { message: "Failed to create project" } }, 400);
  }
});

app.delete(
  "/v3/projects/:projectId",
  zValidator("json", DeleteProjectSchema.optional()),
  async (c) => {
    const { organizationId } = c.var.session;
    const projectId = c.req.param("projectId");
    const body = c.req.valid("json") ?? { action: "delete" as const };
    const supabase = createClientForSession(c.var.session);

    try {
      const result = await deleteProject(supabase, {
        organizationId,
        projectId,
        mode: body,
      });
      return c.json(result);
    } catch (error) {
      console.error("Failed to delete project", error);
      return c.json({ error: { message: "Failed to delete project" } }, 400);
    }
  },
);

app.post("/v3/documents", zValidator("json", MemoryAddSchema), async (c) => {
  const { organizationId, internalUserId } = c.var.session;
  const payload = c.req.valid("json");
  const supabase = createClientForSession(c.var.session);

  try {
    const doc = await addDocument({
      organizationId,
      userId: internalUserId,
      payload,
      client: supabase,
    });
    const statusCode = (doc as any)?.alreadyExists ? 200 : 201;
    return c.json(doc, statusCode);
  } catch (error) {
    console.error("Failed to add document", error);
    return c.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Failed to add document",
        },
      },
      400,
    );
  }
});

app.post("/v3/documents/file", async (c) => {
  const { organizationId, internalUserId } = c.var.session;

  try {
    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || !(file instanceof File)) {
      return c.json({ error: { message: "No file uploaded" } }, 400);
    }

    // Basic upload hardening: size limit and MIME whitelist
    const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
    const ALLOWED_MIME = new Set([
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/pdf",
      "application/json",
      "text/html",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      // Microsoft Office formats
      "application/msword", // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/vnd.ms-excel", // .xls
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-powerpoint", // .ppt
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
    ]);

    if (file.size > MAX_SIZE_BYTES) {
      return c.json({ error: { message: "File too large (max 10MB)" } }, 413);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = file.name || "uploaded-file";
    const mimeType = file.type || "application/octet-stream";

    if (!ALLOWED_MIME.has(mimeType)) {
      return c.json(
        {
          error: {
            message: "Unsupported file type",
            allowed: Array.from(ALLOWED_MIME),
          },
        },
        415,
      );
    }

    let containerTags: string[] | undefined;
    const rawContainerTags = body.containerTags;
    if (Array.isArray(rawContainerTags)) {
      containerTags = rawContainerTags
        .map((value) => String(value))
        .filter(Boolean);
    } else if (
      typeof rawContainerTags === "string" &&
      rawContainerTags.trim().length > 0
    ) {
      try {
        const parsed = JSON.parse(rawContainerTags);
        if (Array.isArray(parsed)) {
          containerTags = parsed.map((value) => String(value)).filter(Boolean);
        } else {
          containerTags = [rawContainerTags];
        }
      } catch {
        containerTags = [rawContainerTags];
      }
    }

    const rawMetadata = body.metadata;
    let extraMetadata: Record<string, unknown> | undefined;
    if (typeof rawMetadata === "string" && rawMetadata.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawMetadata);
        if (parsed && typeof parsed === "object") {
          extraMetadata = parsed as Record<string, unknown>;
        }
      } catch {
        extraMetadata = undefined;
      }
    }

    const base64Content = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64Content}`;

    const payload = {
      content: dataUrl,
      containerTags,
      metadata: {
        ...(extraMetadata ?? {}),
        filename,
        mimeType,
        size: file.size,
        type: "file",
        source: "upload",
      },
    };

    const supabase = createClientForSession(c.var.session);
    const doc = await addDocument({
      organizationId,
      userId: internalUserId,
      payload,
      client: supabase,
    });
    const statusCode = (doc as any)?.alreadyExists ? 200 : 201;
    return c.json(doc, statusCode);
  } catch (error) {
    console.error("File upload failed", error);
    return c.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "File upload failed",
        },
      },
      500,
    );
  }
});

app.post(
  "/v3/documents/list",
  zValidator("json", ListMemoriesQuerySchema.partial().optional()),
  async (c) => {
    const { organizationId } = c.var.session;
    const filters = c.req.valid("json") ?? {};
    const supabase = createClientForSession(c.var.session);

    try {
      const response = await listDocuments(supabase, organizationId, filters);
      return c.json(response);
    } catch (error) {
      console.error("Failed to list documents", error);
      return c.json(
        {
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Failed to list documents",
          },
        },
        500,
      );
    }
  },
);

app.post(
  "/v3/deep-agent/analyze",
  zValidator(
    "json",
    z.object({
      url: z.string().url(),
      mode: z.enum(["auto", "youtube"]).optional().default("auto"),
      title: z.string().optional(),
      githubToken: z.string().optional(),
      useExa: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const { url, mode, title, githubToken, useExa } = body;

    try {
      const service = new AnalysisService("gemini-2.5-flash", useExa);
      const result = await service.analyzeAuto(url, title, githubToken, {
        useExa,
      });
      return c.json(result);
    } catch (error) {
      console.error("Deep Agent analysis failed", error);
      return c.json(
        {
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Deep Agent analysis failed",
          },
        },
        500,
      );
    }
  },
);

app.post(
  "/v3/documents/documents",
  zValidator("json", DocumentsWithMemoriesQuerySchema),
  async (c) => {
    const { organizationId } = c.var.session;
    const query = c.req.valid("json");
    const supabase = createClientForSession(c.var.session);

    try {
      const docs = await listDocumentsWithMemories(
        supabase,
        organizationId,
        query,
      );
      return c.json(docs);
    } catch (error) {
      console.error("Failed to fetch documents with memories:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        organizationId,
        query,
      });
      return c.json(
        {
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Failed to fetch documents",
            details:
              process.env.NODE_ENV === "development"
                ? error instanceof Error
                  ? error.stack
                  : String(error)
                : undefined,
          },
        },
        500,
      );
    }
  },
);

app.get("/v3/documents/:id", async (c) => {
  const { organizationId } = c.var.session;
  const documentId = c.req.param("id");
  const supabase = createClientForSession(c.var.session);

  try {
    const document = await getDocument(supabase, organizationId, documentId);
    if (!document) {
      return c.json({ error: { message: "Document not found" } }, 404);
    }
    return c.json(document);
  } catch (error) {
    console.error("Failed to fetch document", error);
    return c.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Failed to fetch document",
        },
      },
      500,
    );
  }
});

app.patch(
  "/v3/documents/:id",
  zValidator(
    "json",
    z
      .object({
        content: z.string().optional(),
        title: z.string().optional(),
        containerTag: z.string().optional(),
        containerTags: z.array(z.string()).optional(),
        metadata: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .refine(
        (data) =>
          data.content !== undefined ||
          data.title !== undefined ||
          data.containerTag !== undefined ||
          (Array.isArray(data.containerTags) &&
            data.containerTags.length > 0) ||
          data.metadata !== undefined,
        { message: "At least one field must be provided for update" },
      ),
  ),
  async (c) => {
    const { organizationId } = c.var.session;
    const documentId = c.req.param("id");
    const { content, title, containerTag, containerTags, metadata } =
      c.req.valid("json");
    const supabase = createClientForSession(c.var.session);

    try {
      const normalizedTags =
        containerTags ??
        (containerTag && containerTag.length > 0 ? [containerTag] : undefined);

      const updatedDocument = await updateDocument(supabase, {
        organizationId,
        documentId,
        content,
        title,
        containerTags: normalizedTags,
        metadata,
      });
      return c.json(updatedDocument);
    } catch (error) {
      console.error("Failed to update document", error);
      return c.json(
        {
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Failed to update document",
          },
        },
        400,
      );
    }
  },
);

app.post(
  "/v3/documents/documents/by-ids",
  zValidator("json", DocumentsByIdsSchema),
  async (c) => {
    const { organizationId } = c.var.session;
    const query = c.req.valid("json");
    const supabase = createClientForSession(c.var.session);

    try {
      const docs = await listDocumentsWithMemoriesByIds(
        supabase,
        organizationId,
        query,
      );
      return c.json(docs);
    } catch (error) {
      console.error("Failed to fetch documents by ids", error);
      return c.json({ error: { message: "Failed to fetch documents" } }, 500);
    }
  },
);

app.post(
  "/v3/documents/migrate-mcp",
  zValidator("json", MigrateMCPRequestSchema),
  async (c) => {
    const { organizationId } = c.var.session;
    const payload = c.req.valid("json");

    try {
      const response = await migrateMcpDocuments(organizationId, payload);
      return c.json(response);
    } catch (error) {
      console.error("Failed to migrate MCP documents", error);
      return c.json({ error: { message: "Failed to migrate documents" } }, 500);
    }
  },
);

app.post("/v3/documents/:id/cancel", async (c) => {
  const { organizationId } = c.var.session;
  const documentId = c.req.param("id");
  const supabase = createClientForSession(c.var.session);

  try {
    await cancelDocument(supabase, { organizationId, documentId });
    return c.json({ message: "Document processing cancelled" }, 200);
  } catch (error) {
    console.error("Failed to cancel document", error);
    return c.json({ error: { message: "Failed to cancel document" } }, 400);
  }
});

// Resume a single paused document
app.post("/v3/documents/:id/resume", async (c) => {
  const { organizationId } = c.var.session;
  const documentId = c.req.param("id");
  const supabase = createClientForSession(c.var.session);

  try {
    // Update document status from paused to queued
    const { error: docError } = await supabase
      .from("documents")
      .update({ status: "queued" })
      .eq("id", documentId)
      .eq("org_id", organizationId)
      .eq("status", "paused");

    if (docError) throw docError;

    // Update corresponding ingestion job
    const { error: jobError } = await supabase
      .from("ingestion_jobs")
      .update({ status: "queued", error_message: null })
      .eq("document_id", documentId)
      .eq("status", "paused");

    if (jobError) throw jobError;

    return c.json({ message: "Document resumed", documentId }, 200);
  } catch (error) {
    console.error("Failed to resume document", error);
    return c.json({ error: { message: "Failed to resume document" } }, 400);
  }
});

// Resume ALL paused documents for the organization
app.post("/v3/documents/resume-all", async (c) => {
  const { organizationId } = c.var.session;
  const supabase = createClientForSession(c.var.session);

  try {
    // Get all paused documents for this org
    const { data: pausedDocs, error: selectError } = await supabase
      .from("documents")
      .select("id")
      .eq("org_id", organizationId)
      .eq("status", "paused");

    if (selectError) throw selectError;

    const documentIds = pausedDocs?.map(d => d.id) ?? [];

    if (documentIds.length === 0) {
      return c.json({ message: "No paused documents found", count: 0 }, 200);
    }

    // Update all paused documents to queued
    const { error: docError } = await supabase
      .from("documents")
      .update({ status: "queued" })
      .in("id", documentIds);

    if (docError) throw docError;

    // Update all corresponding ingestion jobs
    const { error: jobError } = await supabase
      .from("ingestion_jobs")
      .update({ status: "queued", error_message: null })
      .in("document_id", documentIds)
      .eq("status", "paused");

    if (jobError) throw jobError;

    console.log(`[resume-all] Resumed ${documentIds.length} paused documents for org ${organizationId}`);
    return c.json({ message: "All paused documents resumed", count: documentIds.length }, 200);
  } catch (error) {
    console.error("Failed to resume all documents", error);
    return c.json({ error: { message: "Failed to resume documents" } }, 400);
  }
});

// Find related links for a document (manually triggered)
app.post("/v3/documents/:id/related-links", async (c) => {
  const { organizationId } = c.var.session;
  const documentId = c.req.param("id");
  const supabase = createClientForSession(c.var.session);

  try {
    const result = await findDocumentRelatedLinks(
      supabase,
      documentId,
      organizationId,
    );
    return c.json(result);
  } catch (error) {
    console.error("Failed to find related links", error);
    return c.json(
      {
        success: false,
        relatedLinks: [],
        error: "Failed to find related links",
      },
      500,
    );
  }
});

app.delete("/v3/documents/:id", async (c) => {
  const { organizationId } = c.var.session;
  const documentId = c.req.param("id");
  const supabase = createClientForSession(c.var.session);

  console.log("[DELETE document] Debug:", { organizationId, documentId, session: c.var.session });

  try {
    await deleteDocument(supabase, { organizationId, documentId });
    return c.body(null, 204);
  } catch (error) {
    console.error("Failed to delete document", { error, organizationId, documentId });
    return c.json({ error: { message: "Failed to delete document" } }, 400);
  }
});

app.post("/v3/search", zValidator("json", SearchRequestSchema), async (c) => {
  const { organizationId } = c.var.session;
  const body = c.req.valid("json");
  const supabase = createClientForSession(c.var.session);

  try {
    const response = await searchDocuments(supabase, organizationId, body);
    return c.json(response);
  } catch (error) {
    console.error("Search failed", error);
    return c.json({ error: { message: "Search failed" } }, 500);
  }
});

// New hybrid search endpoint with keyword + vector search
app.post(
  "/v3/search/hybrid",
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
    const { organizationId } = c.var.session;
    const body = c.req.valid("json");
    const supabase = createClientForSession(c.var.session);

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
      });

      return c.json({
        results,
        timing: 0, // Can add timing if needed
        total: results.length,
      });
    } catch (error) {
      console.error("Hybrid search failed", error);
      try {
        const fallback = await searchDocuments(
          supabase,
          organizationId,
          body,
        );
        return c.json(fallback, 200);
      } catch (e) {
        return c.json({ error: { message: "Hybrid search failed" } }, 500);
      }
    }
  },
);

// List all connections for the organization
// IMPORTANT: This route must come BEFORE /:provider to avoid matching "list" as a provider
app.post(
  "/v3/connections/list",
  requireAuth,
  zValidator(
    "json",
    z.object({
      containerTags: z.array(z.string()).optional(),
    }),
  ),
  async (c) => {
    const { organizationId, userId } = c.var.session;
    const { containerTags } = c.req.valid("json");
    const supabase = createClientForSession(c.var.session);

    try {
      const connections = await listConnections(
        supabase,
        organizationId,
        containerTags,
      );
      return c.json({ data: connections });
    } catch (error) {
      console.error("Failed to list connections", error);
      return c.json({ error: { message: "Failed to load connections" } }, 500);
    }
  },
);

// Create a new connection (OAuth flow initiation)
app.post(
  "/v3/connections/:provider",
  requireAuth,
  zValidator("json", createConnectionInputSchema),
  async (c) => {
    const { organizationId, userId } = c.var.session;
    const provider = c.req.param("provider");
    const payload = c.req.valid("json");
    const supabase = createClientForSession(c.var.session);

    try {
      const result = await createConnection(supabase, {
        organizationId,
        userId,
        provider,
        payload,
      });
      return c.json({ data: result });
    } catch (error) {
      console.error("Failed to create connection", error);
      return c.json({ error: { message: "Failed to create connection" } }, 500);
    }
  },
);

// Get a specific connection by ID
app.get("/v3/connections/:connectionId", requireAuth, async (c) => {
  const { organizationId, userId } = c.var.session;
  const connectionId = c.req.param("connectionId");
  const supabase = createClientForSession(c.var.session);

  try {
    const connection = await getConnection(
      supabase,
      organizationId,
      connectionId,
    );
    if (!connection) {
      return c.json({ error: { message: "Connection not found" } }, 404);
    }
    return c.json({ data: connection });
  } catch (error) {
    console.error("Failed to get connection", error);
    return c.json({ error: { message: "Failed to get connection" } }, 500);
  }
});

// Delete a connection
app.delete("/v3/connections/:connectionId", requireAuth, async (c) => {
  const { organizationId, userId } = c.var.session;
  const connectionId = c.req.param("connectionId");
  const supabase = createClientForSession(c.var.session);

  try {
    await deleteConnection(supabase, organizationId, connectionId);
    return c.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to delete connection", error);
    return c.json({ error: { message: "Failed to remove connection" } }, 500);
  }
});

app.get("/v3/settings", async (c) => {
  const { organizationId } = c.var.session;
  const supabase = createClientForSession(c.var.session);
  try {
    const settings = await getSettings(supabase, organizationId);
    return c.json(settings);
  } catch (error) {
    console.error("Failed to fetch settings", error);
    return c.json({ error: { message: "Failed to fetch settings" } }, 500);
  }
});

app.patch(
  "/v3/settings",
  zValidator("json", SettingsRequestSchema.partial().optional()),
  async (c) => {
    const { organizationId } = c.var.session;
    const payload = c.req.valid("json") ?? {};
    const supabase = createClientForSession(c.var.session);

    try {
      const response = await updateSettings(supabase, organizationId, payload);
      return c.json(response);
    } catch (error) {
      console.error("Failed to update settings", error);
      return c.json({ error: { message: "Failed to update settings" } }, 400);
    }
  },
);

app.get("/v3/waitlist/status", (c) => c.json(getWaitlistStatus()));

// Canvas Projects endpoints (like Figma projects)
app.get("/v3/canvas-projects", async (c) => {
  const { organizationId, internalUserId } = c.var.session;
  const supabase = createClientForSession(c.var.session);
  try {
    const projects = await listCanvasProjects(supabase, internalUserId, organizationId);
    return c.json({ projects });
  } catch (error) {
    console.error("Failed to list canvas projects", error);
    return c.json(
      { error: { message: "Failed to list canvas projects" } },
      500,
    );
  }
});

app.post("/v3/canvas-projects", async (c) => {
  const { organizationId, internalUserId } = c.var.session;
  const body = await c.req.json();
  const supabase = createClientForSession(c.var.session);
  try {
    const project = await createCanvasProject(
      supabase,
      internalUserId,
      organizationId,
      body,
    );
    return c.json(project, 201);
  } catch (error) {
    console.error("Failed to create canvas project", error);
    return c.json(
      { error: { message: "Failed to create canvas project" } },
      400,
    );
  }
});

app.patch("/v3/canvas-projects/:projectId", async (c) => {
  const { organizationId, internalUserId } = c.var.session;
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const supabase = createClientForSession(c.var.session);
  try {
    const project = await updateCanvasProject(
      supabase,
      internalUserId,
      projectId,
      body,
    );
    return c.json(project);
  } catch (error) {
    console.error("Failed to update canvas project", error);
    return c.json(
      { error: { message: "Failed to update canvas project" } },
      400,
    );
  }
});

app.delete("/v3/canvas-projects/:projectId", async (c) => {
  const { organizationId, internalUserId } = c.var.session;
  const projectId = c.req.param("projectId");
  const supabase = createClientForSession(c.var.session);
  try {
    const result = await deleteCanvasProject(supabase, internalUserId, projectId);
    return c.json(result);
  } catch (error) {
    console.error("Failed to delete canvas project", error);
    return c.json(
      { error: { message: "Failed to delete canvas project" } },
      400,
    );
  }
});

// Canvas state endpoints
app.get("/v3/canvas/:projectId?", async (c) => {
  const { organizationId, internalUserId } = c.var.session;
  const projectId = c.req.param("projectId") || "default";
  const supabase = createClientForSession(c.var.session);
  try {
    const result = await getCanvasState(
      supabase,
      internalUserId,
      organizationId,
      projectId,
    );
    return c.json(result);
  } catch (error) {
    console.error("Failed to fetch canvas state", error);
    return c.json({ error: { message: "Failed to fetch canvas state" } }, 500);
  }
});

app.post("/v3/canvas/:projectId?", async (c) => {
  const { organizationId, internalUserId } = c.var.session;
  const projectId = c.req.param("projectId") || "default";
  const body = await c.req.json();
  const supabase = createClientForSession(c.var.session);
  try {
    const result = await saveCanvasState(
      supabase,
      internalUserId,
      organizationId,
      projectId,
      body.state,
    );
    return c.json(result);
  } catch (error) {
    console.error("Failed to save canvas state", error);
    return c.json({ error: { message: "Failed to save canvas state" } }, 500);
  }
});

app.delete("/v3/canvas/:projectId?", async (c) => {
  const { organizationId, internalUserId } = c.var.session;
  const projectId = c.req.param("projectId") || "default";
  const supabase = createClientForSession(c.var.session);
  try {
    const result = await deleteCanvasState(supabase, internalUserId, projectId);
    return c.json(result);
  } catch (error) {
    console.error("Failed to delete canvas state", error);
    return c.json({ error: { message: "Failed to delete canvas state" } }, 500);
  }
});

app.post("/chat", async (c) => {
  const { organizationId } = c.var.session;
  const body = await c.req.json();
  const supabase = createClientForSession(c.var.session);
  return handleChat({ orgId: organizationId, client: supabase, body });
});

// New enhanced chat endpoint with AI SDK
app.post("/chat/v2", async (c) => {
  const { organizationId, userId } = c.var.session;
  const body = await c.req.json();
  const supabase = createClientForSession(c.var.session);
  return handleChatV2({
    orgId: organizationId,
    userId,
    client: supabase,
    body,
  });
});

app.post("/chat/title", async (c) => {
  const body = await c.req.json();
  try {
    const title = generateChatTitle(body);
    return c.text(title);
  } catch (error) {
    console.error("Failed to generate chat title", error);
    return c.text("Untitled conversation", 400);
  }
});

// Conversation management endpoints
app.post("/v3/conversations", async (c) => {
  const { organizationId, userId } = c.var.session;
  const body = await c.req.json();
  const supabase = createClientForSession(c.var.session);
  return handleCreateConversation({
    client: supabase,
    orgId: organizationId,
    userId,
    body,
  });
});

app.get("/v3/conversations", async (c) => {
  const { organizationId } = c.var.session;
  const supabase = createClientForSession(c.var.session);
  return handleListConversations({
    client: supabase,
    orgId: organizationId,
    searchParams: new URLSearchParams(c.req.query()),
  });
});

app.get("/v3/conversations/:id", async (c) => {
  const { organizationId } = c.var.session;
  const conversationId = c.req.param("id");
  const supabase = createClientForSession(c.var.session);
  return handleGetConversation({ client: supabase, conversationId });
});

app.get("/v3/conversations/:id/events", async (c) => {
  const { organizationId } = c.var.session;
  const conversationId = c.req.param("id");
  const supabase = createClientForSession(c.var.session);
  return handleGetConversationEvents({ client: supabase, conversationId });
});

app.get("/v3/conversations/:id/history", async (c) => {
  const { organizationId } = c.var.session;
  const conversationId = c.req.param("id");
  const supabase = createClientForSession(c.var.session);
  return handleGetConversationHistory({ client: supabase, conversationId });
});

app.patch("/v3/conversations/:id", async (c) => {
  const { organizationId } = c.var.session;
  const conversationId = c.req.param("id");
  const body = await c.req.json();
  const supabase = createClientForSession(c.var.session);
  return handleUpdateConversation({ client: supabase, conversationId, body });
});

app.delete("/v3/conversations/:id", async (c) => {
  const { organizationId } = c.var.session;
  const conversationId = c.req.param("id");
  const supabase = createClientForSession(c.var.session);
  return handleDeleteConversation({ client: supabase, conversationId });
});

app.post("/v3/graph/connections", async (c) => {
  const { organizationId, userId } = c.var.session;
  const body = await c.req.json();
  const supabase = createClientForSession(c.var.session);
  return handleGraphConnections({
    client: supabase,
    payload: body,
    orgId: organizationId,
  });
});

// Start document timeout monitor to prevent stuck documents
startDocumentTimeoutMonitor();

// Handle uncaught exceptions and unhandled promise rejections
process.on("uncaughtException", (error) => {
  console.error("[FATAL] Uncaught Exception:", error);
  console.error("Stack:", error.stack);
  // Log but don't exit - let the process recover if possible
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled Promise Rejection:", reason);
  console.error("Promise:", promise);
  // Log but don't exit - let the process recover if possible
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  stopDocumentTimeoutMonitor();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  stopDocumentTimeoutMonitor();
  process.exit(0);
});

serve({
  fetch: app.fetch,
  port: env.PORT,
  hostname: "0.0.0.0",
});

console.log(`API server running on http://0.0.0.0:${env.PORT}`);
