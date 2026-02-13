import { z } from "zod";

// Excalidraw content is a JSON string containing elements, appState, and files.
// We validate it as a string (serialized JSON) since the actual structure is
// managed by Excalidraw and may change between versions.
const ExcalidrawContentSchema = z.union([
  z.string(), // Serialized JSON string
  z.record(z.unknown()), // Already-parsed object (elements, appState, files)
]);

export const CanvasSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  content: ExcalidrawContentSchema.nullable().optional(),
  preview: z.string().nullable().optional(),
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
});

export const CanvasResponseSchema = CanvasSchema;

export const ListCanvasesResponseSchema = z.array(CanvasSchema);
