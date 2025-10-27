import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import type { z } from "zod"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
export type DocumentWithMemories = DocumentsResponse["documents"][0]
