import { z } from "zod";

// Excalidraw content is a JSON string containing elements, appState, and files.
// We validate it as a string (serialized JSON) since the actual structure is
// managed by Excalidraw and may change between versions.
const ExcalidrawContentSchema = z.union([
  z.string(), // Serialized JSON string
  z.record(z.string(), z.unknown()), // Already-parsed object (elements, appState, files)
]);

export const CanvasSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  content: ExcalidrawContentSchema.nullable().optional(),
  preview: z.string().nullable().optional(),
  version: z.number().int().min(1).default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateCanvasSchema = z.object({
  name: z.string().min(1).default("Untitled Canvas"),
  projectId: z.string().uuid().optional(),
  content: ExcalidrawContentSchema.optional(),
});

export const UpdateCanvasSchema = z.object({
  name: z.string().min(1).optional(),
  content: ExcalidrawContentSchema.optional(),
  preview: z.string().max(500_000).optional(), // Cap preview size at 500KB
  baseVersion: z.number().int().min(1).optional(),
});

export const CanvasResponseSchema = CanvasSchema;

export const ListCanvasesResponseSchema = z.array(CanvasSchema);

export const CanvasToolModeSchema = z.enum(["append", "replace"]).default("append");

export const CanvasCreateViewInputSchema = z.object({
  canvasId: z.string().uuid().optional(),
  input: z.string().min(2),
  checkpointId: z.string().uuid().optional(),
  mode: CanvasToolModeSchema.optional(),
  baseVersion: z.number().int().min(1).optional(),
});

export const CanvasCreateViewResultSchema = z.object({
  checkpointId: z.string().uuid().nullable().optional(),
  canvasId: z.string().uuid(),
  appliedElementIds: z.array(z.string()).default([]),
  deletedElementIds: z.array(z.string()).default([]),
  camera: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
  conflictStatus: z.enum(["none", "stale_base"]).default("none"),
  canvasVersion: z.number().int().min(1),
  message: z.string().optional(),
});
