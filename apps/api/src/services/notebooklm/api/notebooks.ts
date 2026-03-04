/**
 * NotebookLM Notebooks API
 * CRUD operations on notebooks.
 */

import type { NotebookLMClient } from "../client"
import { type Notebook, type NotebookDescription, RPCMethod } from "../types"

export class NotebooksAPI {
	constructor(private client: NotebookLMClient) {}

	/**
	 * List all notebooks for the authenticated user.
	 */
	async list(): Promise<Notebook[]> {
		const result = await this.client.rpcCall(RPCMethod.LIST_NOTEBOOKS, [
			null,
			1,
			null,
			[2],
		])

		if (!result || !Array.isArray(result)) return []

		// Notebooks are in result[0] array
		const items = Array.isArray(result[0]) ? result[0] : []
		return items.map(parseNotebook).filter(Boolean) as Notebook[]
	}

	/**
	 * Create a new notebook.
	 */
	async create(title: string): Promise<Notebook> {
		const result = await this.client.rpcCall(RPCMethod.CREATE_NOTEBOOK, [
			title,
			null,
			null,
			[2],
			[1],
		])

		const notebook = parseNotebook(result)
		if (!notebook) {
			throw new Error("Failed to create notebook — unexpected response format")
		}
		return notebook
	}

	/**
	 * Get a notebook by ID (includes source data).
	 */
	async get(notebookId: string): Promise<{
		notebook: Notebook
		rawSourceData: unknown[]
	}> {
		const result = await this.client.rpcCall(RPCMethod.GET_NOTEBOOK, [
			notebookId,
			null,
			[2],
			null,
			0,
		])

		if (!Array.isArray(result)) {
			throw new Error(`Notebook ${notebookId} not found`)
		}

		const notebookData = result[0]
		const notebook: Notebook = {
			id: notebookData?.[0] ?? notebookId,
			title: notebookData?.[3]?.[1] ?? "Untitled",
			createdAt: notebookData?.[3]?.[3]
				? new Date(notebookData[3][3] * 1000)
				: null,
			sourcesCount: 0,
			isOwner: true,
		}

		// Sources are in result[0][1] — array of source arrays
		const rawSourceData = Array.isArray(notebookData?.[1])
			? notebookData[1]
			: []
		notebook.sourcesCount = rawSourceData.length

		return { notebook, rawSourceData }
	}

	/**
	 * Delete a notebook.
	 */
	async delete(notebookId: string): Promise<boolean> {
		await this.client.rpcCall(RPCMethod.DELETE_NOTEBOOK, [[notebookId], [2]])
		return true
	}

	/**
	 * Rename a notebook.
	 */
	async rename(notebookId: string, newTitle: string): Promise<Notebook> {
		const result = await this.client.rpcCall(RPCMethod.RENAME_NOTEBOOK, [
			notebookId,
			[[null, null, null, [null, newTitle]]],
		])

		const notebook = parseNotebook(result)
		return (
			notebook ?? {
				id: notebookId,
				title: newTitle,
				createdAt: null,
				sourcesCount: 0,
				isOwner: true,
			}
		)
	}

	/**
	 * Get notebook description (AI-generated summary + suggested topics).
	 */
	async getDescription(notebookId: string): Promise<NotebookDescription> {
		const result = await this.client.rpcCall(RPCMethod.SUMMARIZE, [notebookId])

		if (!Array.isArray(result)) {
			return { summary: "", suggestedTopics: [] }
		}

		const summary = result[0]?.[0]?.[0] ?? ""
		const topicsRaw = result[1]?.[0] ?? []
		const suggestedTopics = Array.isArray(topicsRaw)
			? topicsRaw
					.filter((t): t is unknown[] => Array.isArray(t))
					.map((t) => ({
						title: String(t[0] ?? ""),
						followUp: t[1] ? String(t[1]) : null,
					}))
			: []

		return { summary, suggestedTopics }
	}
}

// ─── Parsing Helpers ─────────────────────────────────────────

function parseNotebook(raw: unknown): Notebook | null {
	if (!Array.isArray(raw)) return null

	// Notebook data can be nested differently depending on the RPC
	// LIST_NOTEBOOKS: each item is [id, ?, ?, [?, title, ?, timestamp, ...], ...]
	// CREATE_NOTEBOOK: [id, ?, ?, [?, title, ?, timestamp, ...], ...]
	const id = raw[0]
	if (typeof id !== "string") return null

	const meta = raw[3]
	const title = meta?.[1] ?? "Untitled"
	const timestamp = meta?.[3]
	const createdAt =
		typeof timestamp === "number" ? new Date(timestamp * 1000) : null

	// Source count: from nested array at raw[1]
	const sources = Array.isArray(raw[1]) ? raw[1] : []
	const sourcesCount = sources.length

	return {
		id: String(id),
		title: String(title),
		createdAt,
		sourcesCount,
		isOwner: true,
	}
}
