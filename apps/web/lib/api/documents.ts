import { BACKEND_URL_SSR } from "@lib/env"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import { cookies } from "next/headers"
import type { z } from "zod"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]

export async function getDocumentById(
	id: string,
): Promise<DocumentWithMemories | null> {
	try {
		const cookieStore = await cookies()
		const sessionCookie = cookieStore.get("kortix_session")

		const response = await fetch(
			`${BACKEND_URL_SSR.replace(/\/$/, "")}/v3/documents/documents/by-ids`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(sessionCookie && {
						Cookie: `${sessionCookie.name}=${sessionCookie.value}`,
					}),
				},
				body: JSON.stringify({
					ids: [id],
					by: "id",
				}),
				credentials: "include",
			},
		)

		if (!response.ok) {
			if (response.status === 404) {
				return null
			}
			throw new Error(`Failed to fetch document: ${response.statusText}`)
		}

		const data = (await response.json()) as DocumentsResponse

		if (!data.documents || data.documents.length === 0) {
			return null
		}

		return data.documents[0] ?? null
	} catch (error) {
		console.error("Error fetching document:", error)
		throw error
	}
}
