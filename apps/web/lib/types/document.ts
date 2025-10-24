import type { z } from "zod";
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api";

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>;
export type DocumentWithMemories = DocumentsResponse["documents"][0];
